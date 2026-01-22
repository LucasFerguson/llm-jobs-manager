/**
 * Create a prompt for the LLM to analyze a text block and extract metadata
 */
export function createAnalysisPrompt(textBlock: string): string {
	return `Analyze the following text block and extract structured metadata. Return ONLY valid JSON with no markdown formatting or code fences.

Text block:
"""
${textBlock}
"""

Return a JSON object with these exact keys:
{
  "summary": "A concise 1-2 sentence summary of the main idea",
  "category": "Primary category (e.g., Meeting Notes, Ideas, Research, Todo, Personal, Technical, etc.)",
  "key_topics": "Comma-separated list of 2-4 main topics or themes",
  "entities": "Comma-separated list of people, places, organizations mentioned (or 'none')",
  "sentiment": "One of: positive, neutral, negative, mixed",
  "actionable": "yes or no - does this contain action items or tasks?",
  "tags": "Comma-separated list of 2-5 relevant tags for indexing"
}

Return ONLY the JSON object, no other text.`;
}
