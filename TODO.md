TODO

## Completed ✅
- [x] Integrate with LLM API (switched from Ollama to LiteLLM)
- [x] Add priority queue levels (high for Open WebUI, low for n8n)
- [x] Add job status tracking dashboard (Bull Board at /admin/queues)
- [x] Set up TypeScript build pipeline with watch mode
- [x] Configure Redis with Docker Compose
- [x] Add environment variable management (.env)
- [x] Implement timeout/abort logic for long-running requests
- [x] Create API endpoint to accept LLM requests from external clients (`agent/api.ts`, `POST /api/agent`)
- [x] Add job result persistence (store completions in DB) - SQLite via `agent/db.ts`
- [x] Document API usage (curl examples in README)
- [x] OpenAI-compatible gateway for Open WebUI (`gateway/server.ts`, `/v1/chat/completions` + `/v1/models`, priority 1)

## In Progress 🚧
- [ ] Wire n8n to actually call `POST /api/agent` instead of index.ts's demo seed loop
- [ ] Point a real Open WebUI instance at the new gateway and confirm a full chat round-trip in the actual UI (only curl-tested so far)

## Backlog 📋
- [ ] Add rate limiting to prevent server overload
- [ ] Implement retry logic for failed jobs (currently attempts: 1)
- [ ] Add structured logging and monitoring (Winston/Pino)
- [ ] Create health check endpoint
- [ ] OpenAPI spec for the agent API
- [ ] Add authentication for job submission (API keys, JWT) - including the gateway, which currently has none
- [ ] Implement real token-by-token streaming (the gateway currently fakes streaming with one combined SSE chunk)
- [ ] Add concurrency controls per priority level
- [ ] Metrics and alerting (job queue depth, processing time)
- [ ] Expand the agent router beyond chat/vault_search (e.g. wire in hierarchy summarize / markdown analyze as actions with explicit params)
- [ ] Multi-turn conversation memory (the agent currently has no memory across separate requests, only a persisted history table)
- [ ] CLI client for the agent API
- [ ] Make the hierarchy summarizer resumable/restartable (a full overnight vault run that dies partway currently has to restart from scratch)

## Recommendation for Next Step 🎯
**Point a real Open WebUI instance at `http://<host>:3335/v1`** and confirm the full chat experience works, then run the hierarchy summarizer against the full vault overnight.
