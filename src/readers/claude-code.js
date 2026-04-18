// Reads conversation history from Claude Code's local JSONL storage

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const MAX_MESSAGES = 50;

/**
 * Flatten content field to plain text.
 * Content can be a string or an array of content blocks.
 */
function flattenContent(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');

  return content
    .filter(block => block.type === 'text')
    .map(block => block.text ?? '')
    .join('\n')
    .trim();
}

/**
 * Find the project directory that matches the current working directory.
 * Each project dir contains a config.json with { projectPath }.
 */
async function findProjectDir(cwd) {
  let entries;
  try {
    entries = await fs.readdir(CLAUDE_PROJECTS_DIR);
  } catch {
    return null;
  }

  for (const entry of entries) {
    const configPath = path.join(CLAUDE_PROJECTS_DIR, entry, 'config.json');
    try {
      const raw = await fs.readFile(configPath, 'utf8');
      const config = JSON.parse(raw);
      if (config.projectPath && path.resolve(config.projectPath) === path.resolve(cwd)) {
        return path.join(CLAUDE_PROJECTS_DIR, entry);
      }
    } catch {
      // skip dirs without valid config.json
    }
  }

  // Fallback: pick most recently modified project dir
  const stats = await Promise.all(
    entries.map(async e => {
      try {
        const s = await fs.stat(path.join(CLAUDE_PROJECTS_DIR, e));
        return { entry: e, mtime: s.mtime };
      } catch {
        return null;
      }
    })
  );
  const valid = stats.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
  return valid.length ? path.join(CLAUDE_PROJECTS_DIR, valid[0].entry) : null;
}

/**
 * Find the most recently modified .jsonl file in a project directory.
 * Checks both the project dir itself and a conversations/ subdirectory.
 */
async function findLatestConversation(projectDir) {
  const candidates = [];

  // Check project dir directly (newer Claude Code layout)
  try {
    const rootFiles = await fs.readdir(projectDir);
    for (const f of rootFiles.filter(f => f.endsWith('.jsonl'))) {
      const full = path.join(projectDir, f);
      const s = await fs.stat(full);
      candidates.push({ file: full, mtime: s.mtime });
    }
  } catch {
    // ignore
  }

  // Also check conversations/ subdirectory (older layout)
  try {
    const convDir = path.join(projectDir, 'conversations');
    const convFiles = await fs.readdir(convDir);
    for (const f of convFiles.filter(f => f.endsWith('.jsonl'))) {
      const full = path.join(convDir, f);
      const s = await fs.stat(full);
      candidates.push({ file: full, mtime: s.mtime });
    }
  } catch {
    // ignore
  }

  if (!candidates.length) return null;
  candidates.sort((a, b) => b.mtime - a.mtime);
  return candidates[0].file;
}

export async function readMessages(projectPath) {
  const cwd = projectPath || process.cwd();

  const projectDir = await findProjectDir(cwd);
  if (!projectDir) {
    throw new Error(`No Claude Code project found for: ${cwd}`);
  }

  const convFile = await findLatestConversation(projectDir);
  if (!convFile) {
    throw new Error(`No conversation files found in ${projectDir}`);
  }

  const raw = await fs.readFile(convFile, 'utf8');
  const lines = raw.split('\n').filter(l => l.trim());

  const messages = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      // We want entries with a message.role field
      if (!obj.message?.role) continue;
      const role = obj.message.role;
      if (role !== 'user' && role !== 'assistant') continue;

      const content = flattenContent(obj.message.content);
      if (!content) continue;

      messages.push({
        role,
        content,
        timestamp: obj.timestamp ? new Date(obj.timestamp).getTime() : Date.now()
      });
    } catch {
      // skip corrupt lines
    }
  }

  const recent = messages.slice(-MAX_MESSAGES);

  return {
    messages: recent,
    ide: 'claude-code',
    projectPath: cwd,
    sessionId: path.basename(convFile, '.jsonl')
  };
}
