/**
 * Schema for the CSV output of analyzed markdown blocks
 */
export interface AnalyzedBlock {
	block_number: number;
	original_text: string;
	summary: string;
	category: string;
	key_topics: string;        // comma-separated
	entities: string;          // people, places, orgs (comma-separated)
	sentiment: string;         // positive, neutral, negative, mixed
	actionable: string;        // yes/no - does it contain action items?
	tags: string;              // suggested tags (comma-separated)
}

/**
 * CSV headers in order
 */
export const CSV_HEADERS: (keyof AnalyzedBlock)[] = [
	"block_number",
	"original_text",
	"summary",
	"category",
	"key_topics",
	"entities",
	"sentiment",
	"actionable",
	"tags",
];
