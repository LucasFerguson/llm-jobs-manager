import { randomUUID } from "crypto";
import { QueueEvents } from "bullmq";
import { llmQueue, connection } from "../scheduler/queue.js";
import { decideAction } from "./router.js";
import { searchVault } from "../vault-search/search.js";
import { insertRequest, completeRequest, failRequest, getRequest, type RequestRecord } from "./db.js";

const OBSIDIAN_VAULT_PATH = process.env.OBSIDIAN_VAULT_PATH ?? "./input";
const DEFAULT_MODEL = "gpt-oss:20b";

let sharedQueueEvents: QueueEvents | null = null;

function getQueueEvents(): QueueEvents {
	if (!sharedQueueEvents) {
		sharedQueueEvents = new QueueEvents("llm", { connection });
		sharedQueueEvents.setMaxListeners(0);
	}
	return sharedQueueEvents;
}

export async function closeOrchestratorQueueEvents() {
	if (sharedQueueEvents) {
		await sharedQueueEvents.close();
		sharedQueueEvents = null;
	}
}

async function runChat(message: string, model: string): Promise<string> {
	const job = await llmQueue.add(
		"agent-chat",
		{ prompt: message, model, source: "agent", timeoutMs: 120_000 },
		{ priority: 2 },
	);
	return job.waitUntilFinished(getQueueEvents());
}

async function runVaultSearch(message: string, model: string): Promise<string> {
	const results = await searchVault(message, OBSIDIAN_VAULT_PATH, model);
	if (results.length === 0) {
		return `No relevant notes found in the vault for: "${message}"`;
	}
	return results
		.map((r, i) => `${i + 1}. ${r.noteTitle} (${(r.relevance * 100).toFixed(0)}%)\n   ${r.excerpt}`)
		.join("\n\n");
}

export interface AgentRequestInput {
	message: string;
	model?: string;
	source?: string;
}

/**
 * Route a message to the appropriate action, run it, and persist the outcome.
 */
export async function handleAgentRequest(input: AgentRequestInput): Promise<RequestRecord> {
	const model = input.model ?? DEFAULT_MODEL;
	const id = randomUUID();
	const createdAt = Date.now();

	const { action } = await decideAction(input.message, model);

	insertRequest({
		id,
		message: input.message,
		action,
		model,
		source: input.source ?? null,
		createdAt,
	});

	try {
		const result = action === "vault_search" ? await runVaultSearch(input.message, model) : await runChat(input.message, model);
		completeRequest(id, result, Date.now());
	} catch (err: any) {
		failRequest(id, err.message ?? String(err), Date.now());
	}

	return getRequest(id)!;
}
