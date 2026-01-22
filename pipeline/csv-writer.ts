import { writeFile } from "fs/promises";
import type { AnalyzedBlock } from "./types.js";
import { CSV_HEADERS } from "./types.js";

/**
 * Escape a field for CSV (handle quotes, commas, newlines)
 */
function escapeCSVField(field: string | number): string {
	const str = String(field);
	// If contains comma, quote, or newline, wrap in quotes and escape internal quotes
	if (str.includes(",") || str.includes('"') || str.includes("\n")) {
		return `"${str.replace(/"/g, '""')}"`;
	}
	return str;
}

/**
 * Convert analyzed blocks to CSV string
 */
export function blocksToCSV(blocks: AnalyzedBlock[]): string {
	const lines: string[] = [];

	// Header row
	lines.push(CSV_HEADERS.join(","));

	// Data rows
	for (const block of blocks) {
		const row = CSV_HEADERS.map(header => escapeCSVField(block[header]));
		lines.push(row.join(","));
	}

	return lines.join("\n");
}

/**
 * Write analyzed blocks to CSV file
 */
export async function writeBlocksToCSV(blocks: AnalyzedBlock[], outputPath: string): Promise<void> {
	const csv = blocksToCSV(blocks);
	await writeFile(outputPath, csv, "utf-8");
	console.log(`✅ Wrote ${blocks.length} analyzed blocks to ${outputPath}`);
}
