import { readFile } from "fs/promises";

/**
 * Read an Obsidian markdown file and split into text blocks by blank lines.
 * Returns array of non-empty text blocks (paragraphs, bullet lists, etc.)
 */
export async function parseMarkdownToBlocks(filePath: string): Promise<string[]> {
	const content = await readFile(filePath, "utf-8");

	// Split by one or more blank lines (handles \n\n or \r\n\r\n)
	const blocks = content
		.split(/\n\s*\n/)
		.map(block => block.trim())
		.filter(block => block.length > 0);

	return blocks;
}

/**
 * Split markdown content (string) into blocks - useful for testing
 */
export function splitMarkdownContent(content: string): string[] {
	return content
		.split(/\n\s*\n/)
		.map(block => block.trim())
		.filter(block => block.length > 0);
}
