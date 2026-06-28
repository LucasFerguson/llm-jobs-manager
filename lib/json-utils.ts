/**
 * LLMs sometimes wrap "JSON only" responses in markdown code fences; strip those before parsing.
 */
export function stripJsonFences(text: string): string {
	let cleaned = text.trim();
	if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
	else if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
	if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
	return cleaned.trim();
}

export function parseJsonResponse<T>(text: string, fallback: T): T {
	try {
		return JSON.parse(stripJsonFences(text));
	} catch {
		return fallback;
	}
}
