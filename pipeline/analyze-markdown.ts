import "dotenv/config";
import { QueueEvents } from "bullmq";
import { llmQueue, connection } from "../scheduler/queue.js";
import { parseMarkdownToBlocks } from "./markdown-parser.js";
import { createAnalysisPrompt } from "./prompt-template.js";
import { writeBlocksToCSV } from "./csv-writer.js";
import type { AnalyzedBlock } from "./types.js";

/**
 * Process an Obsidian markdown file: split into blocks, analyze with LLM, output CSV
 */
export async function processObsidianFile(
	markdownPath: string,
	outputCSVPath: string,
	model = "gpt-oss:20b",
): Promise<void> {
	console.log(`📄 Reading markdown file: ${markdownPath}`);
	const blocks = await parseMarkdownToBlocks(markdownPath);
	console.log(`✂️  Split into ${blocks.length} text blocks`);

	// Enqueue all blocks as LLM jobs
	console.log(`🚀 Enqueueing ${blocks.length} analysis jobs...`);
	const jobPromises = blocks.map(async (block, index) => {
		const job = await llmQueue.add(
			`analyze-block-${index + 1}`,
			{
				prompt: createAnalysisPrompt(block),
				source: "obsidian-analyzer",
				model,
				timeoutMs: 120_000, // 2 min per block
			},
			{ priority: 3 }, // medium priority
		);
		return { job, blockNumber: index + 1, originalText: block };
	});

	const jobData = await Promise.all(jobPromises);
	console.log(`✅ Enqueued ${jobData.length} jobs. Waiting for completion...`);

	// Create QueueEvents instance for listening to job completion
	const queueEvents = new QueueEvents("llm", { connection });

	// Wait for all jobs to complete
	const results: AnalyzedBlock[] = [];
	for (const { job, blockNumber, originalText } of jobData) {
		try {
			const result = await job.waitUntilFinished(queueEvents);

			// Parse LLM response (should be JSON)
			let parsed;
			try {
				// Remove potential markdown code fences
				const cleaned = result.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
				parsed = JSON.parse(cleaned);
			} catch (parseErr) {
				console.warn(`⚠️  Block ${blockNumber}: Failed to parse JSON, using defaults`);
				parsed = {
					summary: "Parse error",
					category: "Unknown",
					key_topics: "",
					entities: "",
					sentiment: "neutral",
					actionable: "no",
					tags: "",
				};
			}

			results.push({
				block_number: blockNumber,
				original_text: originalText,
				summary: parsed.summary ?? "",
				category: parsed.category ?? "",
				key_topics: parsed.key_topics ?? "",
				entities: parsed.entities ?? "",
				sentiment: parsed.sentiment ?? "",
				actionable: parsed.actionable ?? "",
				tags: parsed.tags ?? "",
			});

			console.log(`✅ Block ${blockNumber} analyzed`);
		} catch (err: any) {
			console.error(`❌ Block ${blockNumber} failed:`, err.message);
			results.push({
				block_number: blockNumber,
				original_text: originalText,
				summary: "Analysis failed",
				category: "Error",
				key_topics: "",
				entities: "",
				sentiment: "neutral",
				actionable: "no",
				tags: "",
			});
		}
	}

	// Write to CSV
	await writeBlocksToCSV(results, outputCSVPath);

	// Clean up QueueEvents
	await queueEvents.close();

	console.log(`🎉 Done! Analyzed ${results.length} blocks.`);
}

// CLI usage: tsx pipeline/analyze-markdown.ts <markdown-file> <output-csv>
if (import.meta.url === `file://${process.argv[1]}`) {
	const [, , markdownPath, outputCSVPath] = process.argv;

	if (!markdownPath || !outputCSVPath) {
		console.error("Usage: tsx pipeline/analyze-markdown.ts <markdown-file> <output-csv>");
		process.exit(1);
	}

	processObsidianFile(markdownPath, outputCSVPath).catch(err => {
		console.error("Fatal error:", err);
		process.exit(1);
	});
}
