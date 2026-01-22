# Hierarchical Vault Search System

## Overview

The vault search system is an intelligent agent that traverses an Obsidian vault's folder hierarchy, uses LLM reasoning to evaluate relevance, and returns grounded excerpts from matching notes. Instead of using embeddings or vector similarity, it uses **structured exploration and language-model reasoning** to navigate the vault like a human would.

## Architecture

### Core Components

**1. Vault Indexing (`vault-index.ts`)**
- Fast in-memory index of all vault files and folders
- Provides `getFolder(relPath)` function for O(n) folder traversal
- Special handling for root folder ("") to distinguish top-level files from subfolders
- Key insight: Separate case for root (`if (folderRelPath === "")`) vs subfolder prefix matching

**2. Evaluator Agent (`evaluator.ts`)**
- Two evaluation functions: `evaluateNote()` and `evaluateFolder()`
- Calls LiteLLM proxy to get LLM judgments on relevance
- Returns structured JSON: `{ relevant, confidence, reason, excerpt/suggestedExplore }`
- **Robustness**: Strips markdown code fences (` ```json ... ``` `) from LLM responses before JSON parsing

**3. Search Orchestrator (`search.ts`)**
- Depth-first traversal of vault hierarchy with detailed logging
- For each folder:
  - Evaluates all notes for direct relevance
  - Evaluates folder's subfolders with suggested exploration list
  - Recursively explores suggested subfolders
- Returns sorted results ranked by confidence score
- **Key optimization**: Only passes folder names (not files) to folder evaluator

**4. Prompt Templates (`types.ts`)**
- Sophisticated LLM prompts that guide reasoning without rigid rules
- Emphasizes **inclusivity over precision** to avoid false negatives

## How It Works

### Search Flow

```
1. User query: "professor networking"
   ↓
2. Build vault index (scan all files, map structure)
   ↓
3. Explore ROOT folder
   ├─ Evaluate 11 root-level notes for relevance
   │  • CSP544 System and Network Security → RELEVANT (80%)
   │  • FDSN201 Food Science → RELEVANT (65%)
   │  • Year4 Semester1 → RELEVANT (65%)
   │  ✓ Found 3/11 matches at root level
   │
   └─ Evaluate 5 subfolders
      • LLM judges: "All folders could contain relevant professor/networking info"
      • Suggested explores: [CS536 Science of Programming, CS553 Cloud Computing, CS999 Research with Nik, IPRO498, IPRO499]
      ↓
4. Recursively explore each suggested subfolder
   ├─ CS536/
   │  • Evaluates 17 notes (mostly homework/lectures) → 0 matches
   │  • Explores 2 subfolders (Assignments, Lectures) → 0 matches
   │
   ├─ CS553 Cloud Computing/
   │  • Evaluates 23 notes → 1 match (Professor Tips note)
   │
   ├─ CS999 Research with Nik/ ★ MOST RELEVANT FOLDER
   │  • Evaluates 9 notes
   │  • DPDK.md → RELEVANT (75%)
   │  • Patchwork.md → RELEVANT (75%)
   │  • Project Update.md → RELEVANT (80%)
   │  • And 4 more networking research notes
   │  ✓ Found 7/9 matches
   │
   ├─ IPRO498 Lab to Launch/
   │  • Evaluates 5 notes → 2 matches
   │
   └─ IPRO499 Startup Launch/
      • Evaluates 5 notes → 0 matches

5. Aggregate and rank all results by relevance
   • Top result: Project Update.md (80%)
   • Second: DPDK.md (75%)
   • Third: Patchwork.md (75%)
   ... total 13 results found, return top 10
```

## Key Learnings

### 1. **JSON Response Parsing is Fragile**
LLMs sometimes wrap JSON in markdown code fences (` ```json ... ``` `), especially when instructed to respond with "JSON only". 

**Solution**: Strip markdown fences before parsing:
```typescript
let cleaned = result.trim();
if (cleaned.startsWith("```json")) cleaned = cleaned.slice(7);
if (cleaned.startsWith("```")) cleaned = cleaned.slice(3);
if (cleaned.endsWith("```")) cleaned = cleaned.slice(0, -3);
const parsed = JSON.parse(cleaned);
```

### 2. **Inclusive Prompts Beat Strict Criteria**
Initial approach: "Decide if this folder is relevant" → Too conservative, skipped exploring folders.

**Learned**: LLMs respond better to prompts emphasizing:
- "Be VERY INCLUSIVE"
- "When in doubt, explore - false negatives are worse than false positives"
- "Look for ANY plausible connection"

This increased recall significantly, trading precision for coverage (which is correct for search).

### 3. **Title Matching is Powerful**
CSP544 System and **Network** Security was initially marked irrelevant because its content was sparse (just "System and Network Security" title + YAML frontmatter).

**Solution**: Explicitly weight note titles in evaluation prompt:
```
"EVALUATION RULES:
1. The note TITLE is very important - if it contains keywords related to the query, the note is likely relevant.
2. If the title is relevant, mark relevant=true even if the content is sparse."
```

This caught CSP544 at 80% confidence (matches "network" ↔ "networking").

### 4. **Context Matters for Folder Evaluation**
Initial bug: Passed both files AND folders to evaluator (e.g., "CS536 Science of Programming.md" and "CS536 Science of Programming/" folder).

**Fixed**: Pass only folder names to `evaluateFolder()`, then filter suggestions to exclude `.md` files.

This prevents confusion and ensures the evaluator recommends actual folders to explore.

### 5. **Root Folder Traversal Requires Special Logic**
Root folder ("") has no "/" character, breaking the standard prefix-matching logic.

**Solution**: Separate case:
```typescript
if (folderRelPath === "") {
  // Root: only include files without "/" (top-level only)
  if (!relPath.includes("/")) children.push(file);
} else {
  // Subfolder: match prefix + one level deep
  const folderPrefix = folderRelPath + "/";
  if (relPath.startsWith(folderPrefix) && !relPath.slice(folderPrefix.length).includes("/")) {
    children.push(file);
  }
}
```

## Performance & Observations

**For query "professor networking" on 83-file vault:**
- Explored: 8 folder levels deep
- Notes evaluated: ~80 notes across all folders
- Results found: 13 matches (top 10 returned)
- Most relevant folder: CS999 Research with Nik (7/9 notes relevant)
- Query execution: ~30-60 seconds (LLM inference time dominates)

**Key insight**: The system naturally prioritizes deeper folders with more targeted content (CS999 research notes scored higher than generic course materials).

## Prompt Engineering Insights

### Note Evaluation Prompt
```
"Be inclusive: mark relevant=true if the note could plausibly relate to the query.
Consider keywords in the note title and content that match or are closely related to the query.
If the title is relevant, mark relevant=true even if the content is sparse."
```

→ Produces recall-oriented judgments; catches tangential matches.

### Folder Evaluation Prompt
```
"Be VERY INCLUSIVE: suggest exploring a subfolder if it could plausibly contain relevant information.
When in doubt, suggest exploring - it's better to explore and find nothing than to miss relevant content."
```

→ Drives exploration; LLM suggests all potentially relevant subfolders without conservative filtering.

## Why This Approach Works

### vs. Full-Text Search
- Handles typos and synonyms naturally (LLM understands "networking" ↔ "network")
- Understands context (courses taught by professors vs. standalone mentions)
- Gracefully handles sparse or poorly-formatted notes

### vs. Vector Embeddings
- No model training or fine-tuning required
- Works with any LLM (via LiteLLM proxy)
- Fully interpretable (see exact reasoning in logs)
- No index refresh overhead

### vs. Simple Keyword Matching
- Understands relationships (CSP544 "network security" matches "networking query")
- Evaluates folder relevance holistically (explores course directories for professor mentions)
- Returns grounded excerpts with confidence scores

## Future Improvements

1. **Caching**: Store evaluator results per (note/folder, query) pair to avoid re-evaluation
2. **Smart depth control**: Stop exploring branches with low confidence scores
3. **Excerpt refinement**: Extract multiple overlapping excerpts, rank by relevance
4. **Parallel evaluation**: Evaluate multiple notes/folders concurrently within a folder level
5. **Query expansion**: Auto-suggest related search terms before traversal

## Configuration

Set via environment variables:
- `LITELLM_BASE_URL`: LLM endpoint (default: `http://litellm.netbird.cloud:4000/v1/chat/completions`)
- `LITELLM_API_KEY`: API key for LLM access
- Models: Configurable per search (default: `gpt-oss:20b`)

## CLI Usage

```bash
npm run search "<query>" <vaultRoot> [maxDepth=6] [maxResults=10] [model=gpt-oss:20b]

# Example
npm run search "professor networking" output/hierarchy 6 10 gpt-oss:20b
```

---

**Last Updated**: January 22, 2026  
**Status**: Production-ready with robust JSON parsing, inclusive relevance evaluation, and hierarchical traversal
