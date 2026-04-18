# ctx — Context Bridge

Never lose your AI coding session again. ctx monitors your IDE session automatically and generates a compressed handoff prompt so you can resume in any AI IDE instantly.

## Install

```bash
npm install -g ctx-bridge
```

## Usage

### Start monitoring

```bash
ctx start
```

Starts a background watcher that auto-snapshots every 10 messages and on git changes.

### Generate handoff prompt

```bash
ctx paste
```

Compresses your session into a tight handoff prompt and copies it to clipboard. Paste it into any new IDE session to resume exactly where you left off.

Works even if `ctx start` was never run — it does a fresh read on demand.

### Check status

```bash
ctx status
```

Shows current IDE, snapshot count, last snapshot time, and recent snapshot history.

## How it works

- **Reads locally**: Finds your IDE's conversation files on disk (no network needed)
- **Compresses with AI**: Uses Claude Haiku to distill your session into a ~500-token handoff block
- **Clipboard-ready**: `ctx paste` puts the handoff prompt straight on your clipboard

## Supported IDEs

| IDE | Source | Mode |
|-----|--------|------|
| Claude Code | `~/.claude/projects/*/conversations/*.jsonl` | file |
| Codex CLI | `~/.codex/history/*.json` | file |
| Codex App | stdin | paste |
| Cursor | (planned) | file |
| Windsurf | stdin | paste |
| GitHub Copilot | stdin | paste |

For paste-mode IDEs, run `ctx paste --paste` and paste your conversation when prompted.

## Setup

Set your Anthropic API key for full AI-powered compression:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Without it, ctx falls back to local compression (last 10 messages + git stat).

## Adding a new IDE reader

1. Create `src/readers/<your-ide>.js`
2. Export `async function readMessages(projectPath)` returning:
   ```js
   { messages: [{ role, content, timestamp }], ide, projectPath, sessionId }
   ```
3. Add detection logic to `src/readers/index.js` (check for the IDE's history directory)

That's it — the watcher, compressor, and paste command all use the reader interface automatically.
