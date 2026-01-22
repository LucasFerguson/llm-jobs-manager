import { llmQueue, connection } from "../scheduler/queue.js";
import { QueueEvents } from "bullmq";
import type { RelevanceJudgment } from "./types.js";
import { makeEvaluationPrompt, makeFolderEvaluationPrompt } from "./types.js";

let sharedQueueEvents: QueueEvents | null = null;

function getQueueEvents(): QueueEvents {
	if (!sharedQueueEvents) {
		sharedQueueEvents = new QueueEvents("llm", { connection });
		sharedQueueEvents.setMaxListeners(0);
	}
	return sharedQueueEvents;
}

export async function closeQueueEvents() {
	if (sharedQueueEvents) {
		await sharedQueueEvents.close();
		sharedQueueEvents = null;
	}
}

/**
 * Ask the LLM to evaluate whether a note is relevant to a query.
 * Returns a structured judgment.
 */
export async function evaluateNote(
	noteTitle: string,
	noteContent: string,
	query: string,
	model: string = "gpt-oss:20b",
): Promise<RelevanceJudgment> {
	const prompt = makeEvaluationPrompt(noteTitle, noteContent, query);
	const job = await llmQueue.add(
		"evaluate-note",
		{ prompt, model, source: "vault-search", timeoutMs: 60_000 },
		{ priority: 2 },
	);

	const result = await job.waitUntilFinished(getQueueEvents());
	try {
		// Remove markdown code fences if present
		let cleaned = result.trim();
		if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
		if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
		if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
		cleaned = cleaned.trim();

		const parsed = JSON.parse(cleaned);
		return {
			relevant: parsed.relevant ?? false,
			confidence: parsed.confidence ?? 0,
			reason: parsed.reason ?? "",
			excerpt: parsed.excerpt ?? undefined,
		};
	} catch (e) {
		console.warn("❌ Failed to parse note evaluator response:", result);
		return {
			relevant: false,
			confidence: 0,
			reason: "LLM response parse error",
		};
	}
}

/**
 * Ask the LLM whether to explore a folder.
 */
export async function evaluateFolder(
	folderName: string,
	childrenNames: string[],
	query: string,
	model: string = "gpt-oss:20b",
): Promise<RelevanceJudgment> {
	const prompt = makeFolderEvaluationPrompt(folderName, childrenNames, query);
	const job = await llmQueue.add(
		"evaluate-folder",
		{ prompt, model, source: "vault-search", timeoutMs: 60_000 },
		{ priority: 2 },
	);

	const result = await job.waitUntilFinished(getQueueEvents());
	try {
		// Remove markdown code fences if present
		let cleaned = result.trim();
		if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
		if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
		if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
		cleaned = cleaned.trim();

		const parsed = JSON.parse(cleaned);
		return {
			relevant: parsed.relevant ?? false,
			confidence: parsed.confidence ?? 0,
			reason: parsed.reason ?? "",
			suggestedExplore: parsed.suggestedExplore ?? [],
		};
	} catch (e) {
		console.warn("❌ Failed to parse folder evaluator response:", result);
		return {
			relevant: false,
			confidence: 0,
			reason: "LLM response parse error",
		};
	}
}
