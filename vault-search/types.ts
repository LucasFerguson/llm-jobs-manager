/**
 * Structured agent responses for the search system.
 */

export interface RelevanceJudgment {
	relevant: boolean; // is this note/folder relevant to the query?
	confidence: number; // 0-1: how sure are we?
	reason: string; // brief explanation
	excerpt?: string; // if relevant, a short quote that answers/relates to the query
	suggestedExplore?: string[]; // if folder, which children to explore next
}

export interface SearchResult {
	notePath: string; // relative path to the note
	noteTitle: string; // bare filename
	relevance: number; // 0-1: computed relevance score
	excerpt: string; // the actual text snippet answering the query
	confidence: number; // how confident in this excerpt
}

export interface SearchContext {
	query: string;
	vaultRoot: string;
	currentFolder: string; // relative path being explored
	foundResults: SearchResult[];
	exploredPaths: Set<string>; // avoid re-exploring
	maxDepth: number;
	currentDepth: number;
}

// Prompt template: evaluate a note for relevance
export function makeEvaluationPrompt(
	noteTitle: string,
	noteContent: string,
	query: string,
	maxChars: number = 1000,
): string {
	// Truncate content if too long
	let content = noteContent;
	if (content.length > maxChars) {
		content = content.slice(0, maxChars) + "\n... [truncated]";
	}

	return `You are evaluating whether a note is relevant to a user's search query.

USER QUERY: "${query}"

NOTE TITLE: "${noteTitle}"
NOTE CONTENT (first ${Math.min(maxChars, noteContent.length)} chars):
"""
${content}
"""

EVALUATION RULES:
1. The note TITLE is very important - if it contains keywords related to the query, the note is likely relevant.
2. Be inclusive: mark relevant=true if the note could plausibly relate to the query.
3. Consider keywords and related concepts (e.g., "networking" relates to "network", "security", "systems").
4. If the title is relevant, mark relevant=true even if the content is sparse.

Respond with JSON only, no markdown:
{
  "relevant": true|false,
  "confidence": 0.0-1.0,
  "reason": "1-2 sentences explaining your judgment, mentioning key matching terms",
  "excerpt": "if relevant, a short quote (1-3 sentences) from the note that answers or relates to the query; if content is sparse, use the title; null if not relevant"
}`;
}

// Prompt template: evaluate a folder for relevance
export function makeFolderEvaluationPrompt(
	folderName: string,
	childrenNames: string[],
	query: string,
): string {
	const childrenList = childrenNames.map(n => `  - ${n}`).join("\n");
	return `You are deciding which subfolders to explore to answer a search query.

USER QUERY: "${query}"

CURRENT FOLDER: "${folderName}"
AVAILABLE SUBFOLDERS:
${childrenList}

Your job: identify which subfolders likely contain information relevant to the query.

Be VERY INCLUSIVE: suggest exploring a subfolder if it could plausibly contain relevant information.
- "Professor" queries should explore course/research folders (course titles, module names, assignment folders).
- "Networking" queries should explore any course or project related to networks, systems, or technical topics.
- When in doubt, suggest exploring - it's better to explore and find nothing than to miss relevant content.

Respond with JSON only:
{
  "relevant": true|false,
  "confidence": 0.0-1.0,
  "reason": "brief explanation of your decision",
  "suggestedExplore": ["subfolder1", "subfolder2"] - list of subfolder names to explore for relevant info, or [] if unlikely to help
}`;
}

// Prompt template: extract snippet from note matching query
export function makeExtractionPrompt(query: string, noteContent: string): string {
	return `Given a user query and a note, extract the most relevant snippet (1-3 sentences) that answers or relates to the query.

QUERY: "${query}"

NOTE:
"""
${noteContent.slice(0, 2000)}
"""

Respond with JSON:
{
  "snippet": "extracted snippet or null if no relevant content",
  "confidence": 0.0-1.0
}`;
}
