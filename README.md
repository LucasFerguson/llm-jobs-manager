LLM Jobs Manager

A job queue system for managing Ollama server requests with priority handling. Uses BullMQ and Redis to prevent overwhelming the LLM server.

Setup:
1. Copy .env.example to .env and set your Redis password/host/port
2. Run `npm install`
3. Start Redis with `docker-compose up -d`
4. Build with `npm run build`
5. Run queue + seed demo jobs with `npm start`
6. Dashboard at `npm run start:dashboard` (http://localhost:3333/admin/queues)
7. Worker only: `npm run start:worker`

Development:
- `npm run dev` - starts worker, dashboard, the agent API, and the gateway with auto-reload on file changes

Analyzing Obsidian files:
- `npm run analyze input/your-file.md output/results.csv`
- See ANALYZE-README.md for details

npm run analyze ./Obsidian-Vault/repo-stats.md output/repo-stats.csv

Project hierarchy summaries:
- `npm run hierarchy <vaultPath> <outputPath> [noteSent=2] [folderSent=3] [rootSent=5] [model=gpt-oss:20b]`
- Uses `project-hierarchy/hierarchy.ts` to summarize notes and folders bottom-up and writes copies with YAML frontmatter into the output path

npm run hierarchy ./input ./output 2 3 5 gpt-oss:20b

Agent API:
- `npm run start:agent-api` (or `npm run dev`, which now also runs it) - starts the HTTP entry point for the assistant
- `POST /api/agent` - send a message, a router decides whether to answer directly (`chat`) or search your Obsidian vault (`vault_search`), then returns the result. Persisted to SQLite (`AGENT_DB_PATH`, default `./agent.db`).
  ```bash
  curl -X POST http://localhost:3334/api/agent \
    -H 'content-type: application/json' \
    -d '{"message": "what do my notes say about habits?"}'
  ```
- `GET /api/requests/:id` - fetch one persisted request/result
- `GET /api/requests?limit=20` - recent history
- Set `OBSIDIAN_VAULT_PATH` in `.env` to point `vault_search` at your real vault (defaults to `./input`)

Open WebUI gateway:
- `npm run start:gateway` (or `npm run dev`) - OpenAI-compatible endpoint backed by the queue, so Open WebUI's traffic gets prioritized/throttled like everything else
- In Open WebUI: Settings -> Connections -> add an OpenAI-compatible connection with Base URL `http://<this-host>:3335/v1` (no API key needed). Chats sent from Open WebUI now run through `llmQueue` at priority 1 (highest).
  ```bash
  curl -X POST http://localhost:3335/v1/chat/completions \
    -H 'content-type: application/json' \
    -d '{"model": "gpt-oss:20b", "messages": [{"role": "user", "content": "say OK"}], "stream": false}'
  ```
- Note: streaming requests get a single combined chunk back (not real token-by-token streaming) - see TODO.md backlog.

Project structure:
- `scheduler/` - Queue, worker, and dashboard code
- `gateway/` - OpenAI-compatible passthrough endpoint for Open WebUI (or any OpenAI-compatible client)
- `agent/` - HTTP API, router (chat vs. vault search), and SQLite persistence for the assistant
- `pipeline/` - Markdown analysis and CSV generation
- `project-hierarchy/` - Vault-wide hierarchical summarization
- `vault-search/` - LLM-driven hierarchical vault search (used by the agent's `vault_search` action)
- `lib/` - Shared utilities (e.g. LLM JSON-response parsing)
- `input/` - Place your markdown files here
- `output/` - Generated CSV files go here

Priority levels used:
- 1 (highest): Open WebUI requests via the gateway
- 2: Agent chat/vault_search, vault-search note/folder evaluation
- 3-4: Markdown analysis, hierarchy summarization
- 5: n8n workflows (demo)
