# Obsidian Markdown Analyzer

Analyzes Obsidian markdown files by splitting them into text blocks and using LLM to extract metadata.

## Quick Start

1. Make sure Redis is running and worker is active:
```fish
docker-compose up -d
npm run dev  # starts worker + dashboard in watch mode
```

2. Analyze a markdown file:
```fish
npm run analyze input/sample-notes.md output/results.csv
```

3. Check the dashboard at http://localhost:3000/admin/queues to see job progress

4. View the results in `output/results.csv`

## What It Does

1. **Splits** your markdown file by blank lines into text blocks (paragraphs, lists, etc.)
2. **Enqueues** each block as an LLM job with a structured analysis prompt
3. **Extracts** metadata: summary, category, topics, entities, sentiment, tags
4. **Outputs** a CSV with all blocks and their analyzed metadata

## CSV Columns

- `block_number` - Sequential block number
- `original_text` - The original markdown text
- `summary` - 1-2 sentence summary
- `category` - Type (Meeting Notes, Ideas, Technical, Todo, etc.)
- `key_topics` - Main topics/themes
- `entities` - People, places, organizations mentioned
- `sentiment` - positive, neutral, negative, mixed
- `actionable` - yes/no (contains action items?)
- `tags` - Suggested indexing tags

## Files

- `pipeline/markdown-parser.ts` - Splits markdown by blank lines
- `pipeline/prompt-template.ts` - LLM prompt for metadata extraction
- `pipeline/csv-writer.ts` - Converts results to CSV
- `pipeline/analyze-markdown.ts` - Main orchestrator script
- `pipeline/types.ts` - TypeScript types and CSV schema
- `project-hierarchy/` - Hierarchical vault summarizer (notes → folders → root)
- `scheduler/` - Queue and worker management
- `input/` - Place your markdown files here
- `output/` - Generated CSV files appear here
