import "dotenv/config";
import express from "express";
import { handleAgentRequest } from "./orchestrator.js";
import { getRequest, listRequests } from "./db.js";

const app = express();
app.use(express.json());

app.post("/api/agent", async (req, res) => {
	const { message, model, source } = req.body ?? {};
	if (typeof message !== "string" || !message.trim()) {
		return res.status(400).json({ error: "Request body must include a non-empty 'message' string." });
	}

	try {
		const record = await handleAgentRequest({ message, model, source });
		res.json(record);
	} catch (err: any) {
		res.status(500).json({ error: err.message ?? String(err) });
	}
});

app.get("/api/requests/:id", (req, res) => {
	const record = getRequest(req.params.id);
	if (!record) return res.status(404).json({ error: "Request not found" });
	res.json(record);
});

app.get("/api/requests", (req, res) => {
	const limit = req.query.limit ? Number(req.query.limit) : 20;
	res.json(listRequests(limit));
});

const port = process.env.AGENT_PORT ? Number(process.env.AGENT_PORT) : 3334;
app.listen(port, () => console.log(`agent api on http://localhost:${port}/api/agent`));
