LLM Jobs Manager

A job queue system for managing Ollama server requests with priority handling. Uses BullMQ and Redis to prevent overwhelming the LLM server.

Setup:
1. Copy .env.example to .env and set your Redis password
2. Run `npm install`
3. Start Redis with `docker-compose up -d`
4. Compile and run with `tsc && node index.js`

Priority levels:
- High: Open WebUI requests (interactive user queries)
- Low: Automated tools like n8n workflows
