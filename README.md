LLM Jobs Manager

A job queue system for managing Ollama server requests with priority handling. Uses BullMQ and Redis to prevent overwhelming the LLM server.

Setup:
1. Copy .env.example to .env and set your Redis password/host/port
2. Run `npm install`
3. Start Redis with `docker-compose up -d`
4. Build with `npm run build`
5. Run queue + seed demo jobs with `npm start`
6. Dashboard at `npm run start:dashboard` (http://localhost:3000/admin/queues)
7. Worker only: `npm run start:worker`

Development:
- `npm run dev` - starts worker and dashboard with auto-reload on file changes

Analyzing Obsidian files:
- `npm run analyze input/your-file.md output/results.csv`
- See ANALYZE-README.md for details

Project structure:
- `scheduler/` - Queue, worker, and dashboard code
- `pipeline/` - Markdown analysis and CSV generation
- `input/` - Place your markdown files here
- `output/` - Generated CSV files go here

Priority levels used in demo:
- High: Open WebUI requests
- Low: n8n workflows
