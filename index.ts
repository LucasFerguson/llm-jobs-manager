import "dotenv/config";
import { llmQueue } from "./scheduler/queue.js";

// this is just for demo purposes; in real usage, jobs would be added by other parts of your system

async function seedDemoJobs() {
	await llmQueue.add("openwebui-priority", {
		prompt: "Summarize daily news for dashboard",
		source: "openwebui",
		model: "gpt-oss:20b",
		timeoutMs: 60_000,
	}, { priority: 1 }); // highest priority

	await llmQueue.add("n8n-low", {
		prompt: "Generate product taglines",
		source: "n8n",
		model: "gpt-oss:20b",
		timeoutMs: 60_000,
	}, { priority: 5 });

	await llmQueue.add("n8n-low", {
		prompt: "Translate support snippets",
		source: "n8n",
		model: "gpt-oss:20b",
		timeoutMs: 60_000,
	}, { priority: 5 });

	console.log("Seeded demo jobs (Open WebUI high priority, n8n lower).");
}

// await seedDemoJobs();

setInterval(() => {
	seedDemoJobs().catch(console.error);
}, 1000); // every 1 second, for demo purposes


