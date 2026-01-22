import { promises as fs } from "fs";
import { join } from "path";

export interface VaultFile {
	name: string;
	relPath: string; // relative path from vault root
	absPath: string; // absolute path
	type: "note" | "folder";
}

export interface VaultIndex {
	files: Map<string, VaultFile>; // keyed by relPath
	notesByName: Map<string, VaultFile[]>; // keyed by bare filename (e.g., "My Note.md")
	foldersByPath: Map<string, VaultFile[]>; // keyed by folder path
}

/**
 * Recursively scan vault and build indexes for fast lookup.
 * Links in Obsidian use the note name (not path), so we index by name for fast resolution.
 */
export async function buildVaultIndex(vaultRoot: string): Promise<VaultIndex> {
	const index: VaultIndex = {
		files: new Map(),
		notesByName: new Map(),
		foldersByPath: new Map(),
	};

	const scan = async (dir: string, baseRel: string = ""): Promise<void> => {
		const entries = await fs.readdir(dir, { withFileTypes: true });
		for (const entry of entries) {
			if (entry.name.startsWith(".")) continue; // skip hidden
			const absPath = join(dir, entry.name);
			const relPath = baseRel ? join(baseRel, entry.name) : entry.name;

			if (entry.isDirectory()) {
				const folder: VaultFile = {
					name: entry.name,
					relPath,
					absPath,
					type: "folder",
				};
				index.files.set(relPath, folder);
				if (!index.foldersByPath.has(relPath)) index.foldersByPath.set(relPath, []);
				index.foldersByPath.get(relPath)!.push(folder);

				// Recurse
				await scan(absPath, relPath);
			} else if (entry.isFile() && entry.name.toLowerCase().endsWith(".md")) {
				const note: VaultFile = {
					name: entry.name,
					relPath,
					absPath,
					type: "note",
				};
				index.files.set(relPath, note);

				// Index by bare filename for link resolution
				if (!index.notesByName.has(entry.name)) {
					index.notesByName.set(entry.name, []);
				}
				index.notesByName.get(entry.name)!.push(note);
			}
		}
	};

	await scan(vaultRoot);
	return index;
}

/**
 * Resolve a note name (from a link like [[My Note]]) to its absolute path.
 * Returns first match; in case of ambiguity, prefers notes in lower hierarchy levels.
 */
export function resolveNoteLink(noteLink: string, index: VaultIndex): string | null {
	// Try exact match first (with .md added if needed)
	let noteName = noteLink;
	if (!noteName.endsWith(".md")) noteName += ".md";

	const matches = index.notesByName.get(noteName);
	if (!matches || matches.length === 0) return null;

	// Prefer deeper paths (more specific)
	matches.sort((a, b) => b.relPath.split("/").length - a.relPath.split("/").length);
	return matches[0].absPath;
}

/**
 * Get all files in a given folder (not recursive).
 */
export function getFolder(folderRelPath: string, index: VaultIndex): VaultFile[] {
	const children: VaultFile[] = [];

	for (const [relPath, file] of index.files.entries()) {
		// For root folder (""), check if file is at top level (no "/" in relPath)
		if (folderRelPath === "") {
			if (!relPath.includes("/")) {
				children.push(file);
			}
		} else {
			// For subfolders, check if file is a direct child
			const folderPrefix = folderRelPath + "/";
			if (relPath.startsWith(folderPrefix)) {
				const rest = relPath.slice(folderPrefix.length);
				if (!rest.includes("/")) {
					children.push(file);
				}
			}
		}
	}

	return children;
}

/**
 * Read note content.
 */
export async function readNote(absPath: string): Promise<string> {
	return fs.readFile(absPath, "utf-8");
}
