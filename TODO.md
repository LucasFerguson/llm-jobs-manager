TODO

## Completed ✅
- [x] Integrate with LLM API (switched from Ollama to LiteLLM)
- [x] Add priority queue levels (high for Open WebUI, low for n8n)
- [x] Add job status tracking dashboard (Bull Board at /admin/queues)
- [x] Set up TypeScript build pipeline with watch mode
- [x] Configure Redis with Docker Compose
- [x] Add environment variable management (.env)
- [x] Implement timeout/abort logic for long-running requests

## In Progress 🚧
- [ ] Create API endpoint to accept LLM requests from external clients
  - Currently only seeding demo jobs from index.ts
  - Need REST/Express endpoint for Open WebUI and n8n to POST jobs

## Backlog 📋
- [ ] Add rate limiting to prevent server overload
- [ ] Implement retry logic for failed jobs (currently attempts: 1)
- [ ] Add structured logging and monitoring (Winston/Pino)
- [ ] Create health check endpoint
- [ ] Document API usage for different clients (curl examples, OpenAPI spec)
- [ ] Add authentication for job submission (API keys, JWT)
- [ ] Add job result persistence (store completions in DB)
- [ ] Implement streaming responses for real-time LLM output
- [ ] Add concurrency controls per priority level
- [ ] Metrics and alerting (job queue depth, processing time)

## Recommendation for Next Step 🎯
**Create a REST API endpoint** to accept job submissions from external clients (Open WebUI, n8n).

Why this next:
1. Currently jobs are only seeded programmatically - not useful for real integration
2. Open WebUI and n8n need an HTTP endpoint to POST requests
3. Enables testing the full flow: submit → queue → process → return result
4. Foundation for adding auth, rate limiting, and validation later

Suggested implementation:
- Add Express server in `api.ts` (separate from dashboard)
- POST /api/jobs endpoint accepting { prompt, model, source?, priority?, timeoutMs? }
- Return job ID immediately, optional GET /api/jobs/:id for status/result
- Update README with curl examples
