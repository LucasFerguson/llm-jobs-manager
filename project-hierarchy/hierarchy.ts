import "dotenv/config";
import { promises as fs } from "fs";
import { join, dirname } from "path";
import { llmQueue, connection } from "../scheduler/queue.js";
import { QueueEvents } from "bullmq";

interface NoteNode {
	type: "note";
	name: string;
	absPath: string;
	relPath: string;
	content: string;
	frontmatter: Record<string, any>;
	body: string;
	summary?: string;
}

interface FolderNode {
	type: "folder";
	name: string;
	absPath: string;
	relPath: string;
	children: Array<FolderNode | NoteNode>;
	summary?: string;
}

type Node = FolderNode | NoteNode;

function parseFrontmatter(content: string): { frontmatter: Record<string, any>; body: string } {
	const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n?/);
	if (!fmMatch) return { frontmatter: {}, body: content.trim() };
	const fmRaw = fmMatch[1];
	const body = content.slice(fmMatch[0].length).trim();
	const fmLines = fmRaw.split(/\n/).filter(Boolean);
	const frontmatter: Record<string, any> = {};
	for (const line of fmLines) {
		const idx = line.indexOf(":");
		if (idx === -1) continue;
		const key = line.slice(0, idx).trim();
		const value = line.slice(idx + 1).trim();
		frontmatter[key] = value;
	}
	return { frontmatter, body };
}

function renderFrontmatter(fm: Record<string, any>): string {
	const lines = Object.entries(fm).map(([k, v]) => `${k}: ${v}`);
	if (!lines.length) return "";
	return `---\n${lines.join("\n")}\n---\n\n`;
}

async function readVault(root: string, baseRel = ""): Promise<FolderNode> {
	const entries = await fs.readdir(root, { withFileTypes: true });
	const children: Array<FolderNode | NoteNode> = [];
	for (const entry of entries) {
		if (entry.name.startsWith(".")) continue; // skip hidden
		const abs = join(root, entry.name);
		const rel = join(baseRel, entry.name);
		if (entry.isDirectory()) {
			const folder = await readVault(abs, rel);
			children.push(folder);
		} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
			const raw = await fs.readFile(abs, "utf-8");
			const { frontmatter, body } = parseFrontmatter(raw);
			children.push({
				type: "note",
				name: entry.name,
				absPath: abs,
				relPath: rel,
				content: raw,
				frontmatter,
				body,
			});
		}
	}
	return {
		type: "folder",
		name: baseRel === "" ? "root" : baseRel.split("/").pop() ?? "",
		absPath: root,
		relPath: baseRel,
		children,
	};
}

async function ensureDir(dir: string) {
	await fs.mkdir(dir, { recursive: true });
}

async function writeNoteWithSummary(outRoot: string, note: NoteNode) {
	const outPath = join(outRoot, note.relPath);
	await ensureDir(dirname(outPath));
	const fm = { ...note.frontmatter, summary_2s: note.summary ?? "" };
	const fmText = renderFrontmatter(fm);
	await fs.writeFile(outPath, `${fmText}${note.body}\n`, "utf-8");
}

async function writeFolderSummaryNote(outRoot: string, folder: FolderNode, sentences: number, isRoot = false) {
	const fileName = isRoot ? "_root_summary.md" : "_folder_summary.md";
	const outPath = join(outRoot, folder.relPath || ".", fileName);
	await ensureDir(dirname(outPath));
	const fmText = renderFrontmatter({ summary: folder.summary ?? "" });
	const header = isRoot ? "# Root Summary" : `# Folder Summary: ${folder.name}`;
	await fs.writeFile(outPath, `${fmText}${header}\n\n${folder.summary ?? ""}\n`, "utf-8");
}

function makeNotePrompt(content: string, sentences: number, model: string) {
	return `You are summarizing an Obsidian note. Write EXACTLY ${sentences} sentences. Use the provided language. Avoid filler or hype words; focus on concise, specific details.

Note content:
"""
${content}
"""

Respond with plain text only, ${sentences} sentences.`;
}

function makeFolderPrompt(childrenSummaries: string[], sentences: number, name: string) {
	const bulletList = childrenSummaries.map(s => `- ${s}`).join("\n");
	return `You are summarizing a folder in an Obsidian vault.
Folder name: ${name}
Write ${sentences} sentences that summarize the key ideas.
Use ONLY the child summaries below (do not hallucinate). Avoid filler or hype words; keep it concise but include specific details.

Child summaries:
${bulletList}

Respond with plain text only, ${sentences} sentences.`;
}

async function summarizePrompt(prompt: string, model: string, priority: number, timeoutMs: number): Promise<string> {
	const job = await llmQueue.add("hierarchy-summary", { prompt, model, source: "hierarchy", timeoutMs }, { priority });
	const queueEvents = summarizePrompt.queueEvents ?? (summarizePrompt.queueEvents = new QueueEvents("llm", { connection }));
	queueEvents.setMaxListeners(0);
	return job.waitUntilFinished(queueEvents);
}

summarizePrompt.queueEvents = undefined as QueueEvents | undefined;

async function closeQueueEvents() {
	if (summarizePrompt.queueEvents) {
		await summarizePrompt.queueEvents.close();
		summarizePrompt.queueEvents = undefined;
	}
}

async function summarizeNotes(tree: FolderNode, sentences: number, model: string) {
	const notes: NoteNode[] = [];
	const collect = (node: Node) => {
		if (node.type === "note") notes.push(node);
		else node.children.forEach(collect);
	};
	collect(tree);

	console.log(`🧠 Enqueueing ${notes.length} note summaries...`);
	let done = 0;
	const logEvery = Math.max(1, Math.floor(notes.length / 10));

	await Promise.all(notes.map(async (note, idx) => {
		note.summary = await summarizePrompt(makeNotePrompt(note.body, sentences, model), model, 3, 120_000);
		done += 1;
		if (done % logEvery === 0 || done === notes.length) {
			console.log(`✅ Notes summarized: ${done}/${notes.length} (last: ${note.relPath})`);
		}
	}));
}

function folderChildrenSummaries(folder: FolderNode): string[] {
	const parts: string[] = [];
	for (const child of folder.children) {
		if (child.type === "note" && child.summary) {
			parts.push(`${child.name}: ${child.summary}`);
		} else if (child.type === "folder" && child.summary) {
			parts.push(`${child.name} (folder): ${child.summary}`);
		}
	}
	return parts;
}

async function summarizeFoldersBottomUp(tree: FolderNode, sentencesForFolder: number, sentencesRoot: number, model: string) {
	// Post-order traversal with progress logging
	const folders: FolderNode[] = [];
	const collect = (node: FolderNode) => {
		for (const child of node.children) {
			if (child.type === "folder") collect(child);
		}
		folders.push(node);
	};
	collect(tree);

	let done = 0;
	const logEvery = Math.max(1, Math.floor(folders.length / 10));

	const dfs = async (node: FolderNode): Promise<void> => {
		for (const child of node.children) {
			if (child.type === "folder") await dfs(child);
		}
		const childSummaries = folderChildrenSummaries(node);
		if (childSummaries.length === 0) return;
		const sentenceCount = node.relPath === "" ? sentencesRoot : sentencesForFolder;
		node.summary = await summarizePrompt(makeFolderPrompt(childSummaries, sentenceCount, node.name), model, 4, 180_000);
		done += 1;
		if (done % logEvery === 0 || done === folders.length) {
			console.log(`📦 Folders summarized: ${done}/${folders.length} (last: ${node.relPath || "root"})`);
		}
	};

	await dfs(tree);
}

async function writeOutput(tree: FolderNode, outRoot: string, folderSentences: number, rootSentences: number) {
	// Write notes and create folder summaries
	const visit = async (node: FolderNode) => {
		for (const child of node.children) {
			if (child.type === "note") {
				await writeNoteWithSummary(outRoot, child);
			} else {
				await visit(child);
			}
		}
		// write folder summary note
		if (node.summary) {
			await writeFolderSummaryNote(outRoot, node, node.relPath === "" ? rootSentences : folderSentences, node.relPath === "");
		}
	};
	await visit(tree);
}

async function main() {
	const [, , vaultPath, outputPath, noteSentArg, folderSentArg, rootSentArg, modelArg = "gpt-oss:20b"] = process.argv;

	// Allow env overrides for defaults
	const noteDefault = process.env.NOTE_SENTENCES ?? "2";
	const folderDefault = process.env.FOLDER_SENTENCES ?? "3";
	const rootDefault = process.env.ROOT_SENTENCES ?? "5";

	const noteSent = noteSentArg ?? noteDefault;
	const folderSent = folderSentArg ?? folderDefault;
	const rootSent = rootSentArg ?? rootDefault;
	if (!vaultPath || !outputPath) {
		console.error("Usage: tsx project-hierarchy/hierarchy.ts <vaultPath> <outputPath> [noteSentences=2] [folderSentences=3] [rootSentences=5] [model=gpt-oss:20b]");
		process.exit(1);
	}

	const noteSentences = Number(noteSent);
	const folderSentences = Number(folderSent);
	const rootSentences = Number(rootSent);
	const model = modelArg;

	console.log(`📂 Reading vault: ${vaultPath}`);
	const tree = await readVault(vaultPath);
	console.log(`📝 Summarizing notes (${noteSentences} sentences each)...`);
	await summarizeNotes(tree, noteSentences, model);

	console.log(`📁 Summarizing folders (${folderSentences} sentences, root ${rootSentences})...`);
	await summarizeFoldersBottomUp(tree, folderSentences, rootSentences, model);

	console.log(`💾 Writing output to ${outputPath}`);
	await ensureDir(outputPath);
	await writeOutput(tree, outputPath, folderSentences, rootSentences);

	await closeQueueEvents();
	console.log("✅ Done generating hierarchical summaries.");
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(async (err) => {
		console.error("Fatal error:", err);
		await closeQueueEvents();
		process.exit(1);
	});
}
