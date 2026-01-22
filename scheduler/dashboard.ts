import "dotenv/config";
import express from "express";
import { createBullBoard } from "@bull-board/api";
import { BullMQAdapter } from "@bull-board/api/bullMQAdapter";
import { ExpressAdapter } from "@bull-board/express";
import { llmQueue } from "./queue.js";

const app = express();

const serverAdapter = new ExpressAdapter();
serverAdapter.setBasePath("/admin/queues");

createBullBoard({
	queues: [new BullMQAdapter(llmQueue)],
	serverAdapter,
});

app.use("/admin/queues", serverAdapter.getRouter());

app.listen(3000, () => console.log("bull-board on http://localhost:3000/admin/queues"));
