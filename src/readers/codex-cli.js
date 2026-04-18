// Reads conversation history from Codex CLI's local JSON storage

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CODEX_HISTORY_DIR = path.join(os.homedir(), '.codex', 'history');
const MAX_MESSAGES = 50;

export async function readMessages(projectPath) {
  let files;
  try {
    files = await fs.readdir(CODEX_HISTORY_DIR);
  } catch {
    throw new Error(`Codex CLI history directory not found: ${CODEX_HISTORY_DIR}`);
  }

  const jsonFiles = files.filter(f => f.endsWith('.json'));
  if (!jsonFiles.length) {
    throw new Error('No Codex CLI history files found');
  }

  // Sort by modified time, most recent first
  const stats = await Promise.all(
    jsonFiles.map(async f => {
      const full = path.join(CODEX_HISTORY_DIR, f);
      try {
        const s = await fs.stat(full);
        return { file: full, name: f, mtime: s.mtime };
      } catch {
        return null;
      }
    })
  );

  const sorted = stats.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
  const latestFile = sorted[0].file;
  const sessionId = path.basename(latestFile, '.json');

  const raw = await fs.readFile(latestFile, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Could not parse Codex history file: ${latestFile}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Unexpected Codex history format in: ${latestFile}`);
  }

  const messages = parsed
    .filter(m => m.role === 'user' || m.role === 'assistant')
    .map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      timestamp: m.timestamp ? new Date(m.timestamp).getTime() : Date.now()
    }))
    .slice(-MAX_MESSAGES);

  return {
    messages,
    ide: 'codex-cli',
    projectPath: projectPath || process.cwd(),
    sessionId
  };
}
