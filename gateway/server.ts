import "dotenv/config";
import express from "express";
import { QueueEvents } from "bullmq";
import { llmQueue, connection } from "../scheduler/queue.js";

const LITELLM_BASE_URL = (process.env.LITELLM_BASE_URL ?? "http://litellm.netbird.cloud:4000").replace(/\/+$/, "");
const LITELLM_API_KEY = process.env.LITELLM_API_KEY;
const GATEWAY_TIMEOUT_MS = process.env.GATEWAY_TIMEOUT_MS ? Number(process.env.GATEWAY_TIMEOUT_MS) : 300_000;

const queueEvents = new QueueEvents("llm", { connection });
queueEvents.setMaxListeners(0);

const app = express();
app.use(express.json());

function sseChunk(completion: any, model: string) {
	const content = completion.choices?.[0]?.message?.content ?? "";
	const chunk = {
		id: completion.id ?? "chatcmpl-gateway",
		object: "chat.completion.chunk",
		created: completion.created ?? Math.floor(Date.now() / 1000),
		model,
		choices: [{ index: 0, delta: { role: "assistant", content }, finish_reason: null }],
	};
	const doneChunk = { ...chunk, choices: [{ index: 0, delta: {}, finish_reason: "stop" }] };
	return `data: ${JSON.stringify(chunk)}\n\ndata: ${JSON.stringify(doneChunk)}\n\ndata: [DONE]\n\n`;
}

app.post("/v1/chat/completions", async (req, res) => {
	const body = req.body ?? {};
	if (!Array.isArray(body.messages) || !body.model) {
		return res.status(400).json({ error: "Request body must include 'model' and 'messages'." });
	}

	const wantsStream = body.stream === true;

	try {
		const job = await llmQueue.add(
			"openwebui-chat",
			{
				requestBody: { ...body, stream: false },
				model: body.model,
				source: "openwebui",
				timeoutMs: GATEWAY_TIMEOUT_MS,
			},
			{ priority: 1 }, // highest priority, per README's documented intent for Open WebUI traffic
		);

		const completion = await job.waitUntilFinished(queueEvents);

		if (wantsStream) {
			res.setHeader("content-type", "text/event-stream");
			res.setHeader("cache-control", "no-cache");
			res.write(sseChunk(completion, body.model));
			return res.end();
		}

		res.json(completion);
	} catch (err: any) {
		res.status(500).json({ error: err.message ?? String(err) });
	}
});

app.get("/v1/models", async (_req, res) => {
	try {
		const headers: Record<string, string> = {};
		if (LITELLM_API_KEY) headers["Authorization"] = `Bearer ${LITELLM_API_KEY}`;
		const upstream = await fetch(`${LITELLM_BASE_URL}/v1/models`, { headers });
		res.status(upstream.status).json(await upstream.json());
	} catch (err: any) {
		res.status(502).json({ error: err.message ?? String(err) });
	}
});

const port = process.env.GATEWAY_PORT ? Number(process.env.GATEWAY_PORT) : 3335;
app.listen(port, () => console.log(`OpenAI-compatible gateway on http://localhost:${port}/v1`));
