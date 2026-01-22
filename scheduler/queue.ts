import "dotenv/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

const redisHost = process.env.REDIS_HOST ?? "localhost";
const redisPort = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;
const redisPassword = process.env.REDIS_PASSWORD;

export const connection = new Redis({
	host: redisHost,
	port: redisPort,
	password: redisPassword,
	maxRetriesPerRequest: null,
});

export interface LLMJobData {
	prompt: string;
	source: string;
	model: string;
	timeoutMs?: number;
}

export const llmQueue = new Queue("llm", {
	connection,
	defaultJobOptions: {
		attempts: 1,
		removeOnComplete: 1000,
		removeOnFail: 1000,
	},
});

// Avoid MaxListeners warnings when many jobs are enqueued
llmQueue.setMaxListeners(0);
