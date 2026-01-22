import "dotenv/config";
import { Worker, UnrecoverableError } from "bullmq";
import { connection, LLMJobData } from "./queue.js";

const HARD_TIMEOUT_MS = 20 * 60 * 1000; // 20 min, tune this

const LITELLM_BASE_URL = (process.env.LITELLM_BASE_URL ?? "http://litellm.netbird.cloud:4000").replace(/\/+$/, "");
const LITELLM_API_KEY = process.env.LITELLM_API_KEY; // if you enabled auth

async function callLiteLLMWithAbort(prompt: string, model: string, signal: AbortSignal) {
	const url = `${LITELLM_BASE_URL}/v1/chat/completions`; // OpenAI-compatible endpoint

	const headers: Record<string, string> = { "content-type": "application/json" };
	if (LITELLM_API_KEY) headers["Authorization"] = `Bearer ${LITELLM_API_KEY}`;

	const res = await fetch(url, {
		method: "POST",
		headers,
		body: JSON.stringify({
			model, // this must match your LiteLLM "model_name" alias if using config.yaml
			messages: [{ role: "user", content: prompt }],
			stream: false,
		}),
		signal,
	});

	if (!res.ok) throw new Error(`LiteLLM error: ${res.status} ${await res.text()}`);
	const json = await res.json();
	return json.choices?.[0]?.message?.content ?? json;
}

export const worker = new Worker(
	"llm",
	async (job: { data: LLMJobData }) => {
		const controller = new AbortController();

		const timeout = setTimeout(() => {
			controller.abort(); // this is your GPU failsafe
		}, job.data.timeoutMs ?? HARD_TIMEOUT_MS);

		try {
			const out = await callLiteLLMWithAbort(job.data.prompt, job.data.model, controller.signal);
			return out;
		} catch (e: any) {
			// If it was our timeout, fail in a way that avoids retries
			if (controller.signal.aborted) {
				throw new UnrecoverableError("Hard timeout hit; aborted LiteLLM request");
			}
			throw e;
		} finally {
			clearTimeout(timeout);
		}
	},
	{
		connection,
		concurrency: 1, // your “one worker does everything” rule
	},
);

worker.on("completed", (job) => {
	console.log(`Job ${job.id} completed.`);
});

worker.on("failed", (job, err) => {
	console.error(`Job ${job?.id} failed: ${err.message}`);
});

console.log("Worker started, waiting for jobs...");