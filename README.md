# ctx-bridge

> Never lose your AI coding session again.

When you hit a rate limit in an AI coding IDE, all your context — what you were building, decisions made, errors hit — is gone. `ctx` monitors your session automatically and generates a compressed handoff prompt so you can resume in any IDE instantly.

---

## Install

```bash
npm install -g ctx-bridge
```

---

## Quick Start

**1. Start monitoring in your project:**
```bash
cd your-project
ctx start
```

Runs in the background, updating your context snapshot every time a new message arrives.

**2. When you hit a rate limit — run:**
```bash
ctx paste
```

Handoff prompt is instantly copied to your clipboard. Paste it into any new IDE session and continue exactly where you left off.

---

## Commands

| Command | Description |
|---------|-------------|
| `ctx start` | Start background session monitoring |
| `ctx paste` | Generate handoff prompt + copy to clipboard |
| `ctx status` | Show snapshot history and session info |

---

## How It Works

1. **Reads locally** — Finds your IDE's conversation files on disk. No network needed, no API calls.
2. **Monitors continuously** — Polls every 1 second. Updates snapshot the moment a new message or git change is detected.
3. **Compresses with heuristics** — Extracts task, decisions, last error, and next step from your session into a ~500 token handoff block.
4. **Clipboard ready** — `ctx paste` puts the handoff prompt straight on your clipboard. Just Cmd+V in your new session.

---

## Supported IDEs

| IDE | How it reads | Storage path |
|-----|-------------|--------------|
| **Claude Code** | File | `~/.claude/projects/*/conversations/*.jsonl` |
| **Antigravity** (Google) | File | `~/.gemini/antigravity/brain/<session>/` |
| **Codex CLI** | File | `~/.codex/history/*.json` |
| **Cursor** | Paste | `ctx paste --paste` |
| **Windsurf** | Paste | `ctx paste --paste` |
| **GitHub Copilot** | Paste | `ctx paste --paste` |
| **Kiro** (Amazon) | Paste | `ctx paste --paste` |

For paste-mode IDEs, copy your chat, run `ctx paste --paste`, paste into terminal, press Ctrl+D.

---

## The Handoff Prompt

```
── ctx handoff ──
task:      building authentication middleware with JWT
decided:   JWT over sessions — simpler for mobile clients
tried:     passport.js — too heavy, dropped it
done:      POST /login, POST /register, JWT signing complete
stopped:   src/middleware/auth.js line 34 — verifyToken throws on expiry
next:      catch TokenExpiredError and return 401 with { expired: true }
files:     src/middleware/auth.js, src/routes/users.js
errors:    JsonWebTokenError: invalid signature
─────────────────
Resume by continuing from "stopped" above.
```

Paste this into any new IDE session. The AI picks up exactly where you left off.

---

## Running Inside Claude Code

You can run ctx without leaving the chat:

```
! ctx paste
```

The `!` prefix runs any shell command directly in Claude Code's chat.

---

## Monitoring Multiple Projects

Open a terminal tab per project:

```bash
# Tab 1
cd ~/project-a && ctx start

# Tab 2
cd ~/project-b && ctx start
```

Each project has its own `.ctx/` folder. Run `ctx paste` in whichever project you need the handoff from.

---

## Adding a New IDE Reader

1. Create `src/readers/<your-ide>.js`
2. Export:
   ```js
   export async function readMessages(projectPath) {
     return {
       messages: [{ role: 'user' | 'assistant', content: string, timestamp: number }],
       ide: 'your-ide-name',
       projectPath,
       sessionId: string
     };
   }
   ```
3. Add detection logic in `src/readers/index.js` — check for the IDE's local storage directory and call your reader.

---

## What Gets Captured

| Data | Source |
|------|--------|
| Last 50 chat messages | IDE local files |
| Changed files | `git diff HEAD --stat` |
| Exact file diffs | `git diff HEAD` (truncated to 3000 chars) |
| Last 5 commits | `git log --oneline -5` |
| Working tree state | `git status --short` |
| Error patterns | `*.log` files in project root |

---

## Snapshots

Snapshots are saved to `.ctx/snapshots/` in your project directory. The `.ctx/` folder is automatically added to `.gitignore`.

```
.ctx/
  config.json          ← session config
  snapshots/
    1713456789.json    ← timestamped snapshots
    latest.json        ← always points to most recent
```

---

## Contributing

```bash
git clone git@github.com:PLATMAN02/ctx-bridge.git
cd ctx-bridge
npm install
npm link   # makes ctx available globally from local source
```

---

## License

MIT
