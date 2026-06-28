import { QueueEvents } from "bullmq";
import { llmQueue, connection } from "../scheduler/queue.js";
import { parseJsonResponse } from "../lib/json-utils.js";

export type AgentAction = "chat" | "vault_search";

export interface RouterDecision {
	action: AgentAction;
	reason: string;
}

let sharedQueueEvents: QueueEvents | null = null;

function getQueueEvents(): QueueEvents {
	if (!sharedQueueEvents) {
		sharedQueueEvents = new QueueEvents("llm", { connection });
		sharedQueueEvents.setMaxListeners(0);
	}
	return sharedQueueEvents;
}

export async function closeRouterQueueEvents() {
	if (sharedQueueEvents) {
		await sharedQueueEvents.close();
		sharedQueueEvents = null;
	}
}

function makeRouterPrompt(message: string): string {
	return `You are a router deciding how to handle a personal assistant's incoming message.

Available actions:
- "chat": general questions, conversation, requests to generate or explain something. Use this by default.
- "vault_search": the user wants to find, recall, or search something from their personal notes (an Obsidian vault) - e.g. "what did I write about X", "find my notes on Y", "do I have anything about Z".

USER MESSAGE: "${message}"

Respond with JSON only, no markdown:
{
  "action": "chat" | "vault_search",
  "reason": "one short sentence explaining the choice"
}`;
}

/**
 * Ask the LLM which action to take for a given message. Defaults to "chat" on any failure.
 */
export async function decideAction(message: string, model: string): Promise<RouterDecision> {
	const job = await llmQueue.add(
		"agent-route",
		{ prompt: makeRouterPrompt(message), model, source: "agent-router", timeoutMs: 60_000 },
		{ priority: 2 },
	);

	const fallback: RouterDecision = { action: "chat", reason: "default (no routing decision available)" };
	try {
		const result = await job.waitUntilFinished(getQueueEvents());
		const parsed = parseJsonResponse<Record<string, any> | null>(result, null);
		if (!parsed || (parsed.action !== "chat" && parsed.action !== "vault_search")) return fallback;
		return { action: parsed.action, reason: parsed.reason ?? "" };
	} catch {
		return fallback;
	}
}
