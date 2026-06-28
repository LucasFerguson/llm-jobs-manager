import { promises as fs } from "fs";
import { buildVaultIndex, getFolder, readNote } from "./vault-index.js";
import { evaluateNote, evaluateFolder, closeQueueEvents } from "./evaluator.js";
import type { VaultIndex } from "./vault-index.js";
import type { SearchResult, SearchContext } from "./types.js";

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_RESULTS = 10;

/**
 * Orchestrator: intelligently searches vault by traversing hierarchy and evaluating relevance.
 */
export async function searchVault(
	query: string,
	vaultRoot: string,
	model: string = "gpt-oss:20b",
	maxDepth: number = DEFAULT_MAX_DEPTH,
	maxResults: number = DEFAULT_MAX_RESULTS,
): Promise<SearchResult[]> {
	console.log(`\n${"=".repeat(70)}`);
	console.log(`🔍 VAULT SEARCH INITIALIZED`);
	console.log(`   Query: "${query}"`);
	console.log(`   Vault: ${vaultRoot}`);
	console.log(`   Max Depth: ${maxDepth}, Max Results: ${maxResults}, Model: ${model}`);
	console.log(`${"=".repeat(70)}\n`);

	console.log(`📚 Building vault index...`);
	const index = await buildVaultIndex(vaultRoot);
	console.log(`✓ Index complete:`);
	console.log(`   Total files: ${index.files.size}`);
	console.log(`   Unique note names: ${index.notesByName.size}`);
	console.log(`   Folders: ${index.foldersByPath.size}`);

	// Log sample of indexed files
	console.log(`   Sample files:`);
	let count = 0;
	for (const [relPath] of index.files) {
		if (count++ < 5) console.log(`     - ${relPath}`);
	}
	if (index.files.size > 5) console.log(`     ... and ${index.files.size - 5} more`);
	console.log();

	const context: SearchContext = {
		query,
		vaultRoot,
		currentFolder: "",
		foundResults: [],
		exploredPaths: new Set(),
		maxDepth,
		currentDepth: 0,
	};

	console.log(`🔎 SEARCH STARTING\n`);

	// Start search from root
	await exploreFolder("", index, context, model);

	// Sort results by relevance (highest first)
	context.foundResults.sort((a, b) => b.relevance - a.relevance);

	console.log(`\n${"=".repeat(70)}`);
	console.log(`✅ SEARCH COMPLETE`);
	console.log(`   Explored paths: ${context.exploredPaths.size}`);
	console.log(`   Results found: ${context.foundResults.length}`);
	console.log(`${"=".repeat(70)}\n`);

	// Return top results
	return context.foundResults.slice(0, maxResults);
}

/**
 * Recursively explore a folder and its contents.
 */
async function exploreFolder(
	folderRelPath: string,
	index: VaultIndex,
	context: SearchContext,
	model: string,
): Promise<void> {
	if (context.exploredPaths.has(folderRelPath)) {
		console.log(`⏭️  Already explored: ${folderRelPath || "root"}`);
		return;
	}
	if (context.currentDepth > context.maxDepth) {
		console.log(`⏹️  Max depth (${context.maxDepth}) reached, stopping.`);
		return;
	}

	context.exploredPaths.add(folderRelPath);
	context.currentDepth += 1;

	const folderName = folderRelPath === "" ? "📦 ROOT" : folderRelPath.split("/").pop() || "unknown";
	const indent = "   ".repeat(context.currentDepth - 1);
	console.log(`${indent}📂 [Depth ${context.currentDepth}] Folder: ${folderName}`);

	const children = getFolder(folderRelPath, index);
	console.log(`${indent}   Found ${children.length} children (${children.filter(c => c.type === "note").length} notes, ${children.filter(c => c.type === "folder").length} folders)`);

	if (children.length === 0) {
		console.log(`${indent}   (empty, skipping)`);
		context.currentDepth -= 1;
		return;
	}

	// Separate children into notes and subfolders
	const notes = children.filter(c => c.type === "note");
	const folders = children.filter(c => c.type === "folder");

	// Evaluate and explore relevant notes
	console.log(`${indent}   📄 Evaluating ${notes.length} notes...`);
	let notesMatched = 0;
	for (const note of notes) {
		const content = await readNote(note.absPath);
		console.log(`${indent}      → ${note.name}`);

		const judgment = await evaluateNote(note.name, content, context.query, model);

		if (judgment.relevant && judgment.excerpt) {
			notesMatched++;
			console.log(`${indent}         ✓ RELEVANT (confidence: ${(judgment.confidence * 100).toFixed(0)}%)`);
			console.log(`${indent}         Reason: ${judgment.reason}`);
			console.log(`${indent}         Excerpt: "${judgment.excerpt.slice(0, 80)}..."`);

			context.foundResults.push({
				notePath: note.relPath,
				noteTitle: note.name,
				relevance: judgment.confidence,
				excerpt: judgment.excerpt,
				confidence: judgment.confidence,
			});
		} else {
			console.log(`${indent}         ✗ Not relevant`);
		}
	}
	console.log(`${indent}   → Notes matched: ${notesMatched}/${notes.length}`);

	// Evaluate and explore relevant subfolders
	if (folders.length > 0) {
		console.log(`${indent}   📁 Evaluating ${folders.length} subfolders...`);
		const folderNames = folders.map(f => f.name);
		const folderJudgment = await evaluateFolder(folderName.replace("📦 ", ""), folderNames, context.query, model);

		if (folderJudgment.relevant) {
			console.log(`${indent}      ✓ Folder relevant (confidence: ${(folderJudgment.confidence * 100).toFixed(0)}%)`);
			console.log(`${indent}      Reason: ${folderJudgment.reason}`);

			if (folderJudgment.suggestedExplore && folderJudgment.suggestedExplore.length > 0) {
				console.log(`${indent}      Exploring ${folderJudgment.suggestedExplore.length} suggested children: ${folderJudgment.suggestedExplore.join(", ")}`);
				for (const childName of folderJudgment.suggestedExplore) {
					const childFolder = folders.find(f => f.name === childName);
					if (childFolder) {
						await exploreFolder(childFolder.relPath, index, context, model);
					} else {
						console.log(`${indent}      ⚠️  Child "${childName}" not found in folders`);
					}
				}
			} else {
				console.log(`${indent}      No specific children to explore.`);
			}
		} else {
			console.log(`${indent}      ✗ Folder not relevant, skipping children`);
			console.log(`${indent}      Reason: ${folderJudgment.reason}`);
		}
	}

	context.currentDepth -= 1;
}

/**
 * CLI entry point
 */
async function main() {
	const [, , query, vaultRoot, depthArg, resultsArg, modelArg = "gpt-oss:20b"] = process.argv;

	if (!query || !vaultRoot) {
		console.error("Usage: tsx vault-search/search.ts <query> <vaultRoot> [maxDepth=6] [maxResults=10] [model=gpt-oss:20b]");
		process.exit(1);
	}

	const maxDepth = depthArg ? Number(depthArg) : DEFAULT_MAX_DEPTH;
	const maxResults = resultsArg ? Number(resultsArg) : DEFAULT_MAX_RESULTS;

	try {
		const results = await searchVault(query, vaultRoot, modelArg, maxDepth, maxResults);

		console.log(`${"=".repeat(70)}`);
		console.log(`📊 FINAL RESULTS`);
		console.log(`${"=".repeat(70)}`);
		console.log(`Total: ${results.length} result(s) found\n`);

		if (results.length === 0) {
			console.log(`No relevant results found. Try:`);
			console.log(`  - Adjusting your search query`);
			console.log(`  - Increasing maxDepth`);
			console.log(`  - Checking vault path: ${vaultRoot}`);
		} else {
			for (let i = 0; i < results.length; i++) {
				console.log(`\n${i + 1}. 📌 ${results[i].noteTitle}`);
				console.log(`   Path: ${results[i].notePath}`);
				console.log(`   Relevance: ${(results[i].relevance * 100).toFixed(0)}%`);
				console.log(`   Excerpt: "${results[i].excerpt}"`);
			}
		}
		console.log(`\n${"=".repeat(70)}\n`);
	} finally {
		await closeQueueEvents();
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	main().catch(err => {
		console.error("Fatal error:", err);
		process.exit(1);
	});
}
