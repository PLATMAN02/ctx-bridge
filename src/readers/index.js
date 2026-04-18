// Auto-detects which IDE reader to use based on local file presence

import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const CLAUDE_PROJECTS_DIR = path.join(os.homedir(), '.claude', 'projects');
const CODEX_HISTORY_DIR = path.join(os.homedir(), '.codex', 'history');
const ANTIGRAVITY_BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');

const RECENT_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

async function dirExists(dir) {
  try {
    await fs.stat(dir);
    return true;
  } catch {
    return false;
  }
}

async function hasRecentFiles(dir, maxAgeMs = RECENT_THRESHOLD_MS) {
  try {
    const entries = await fs.readdir(dir);
    for (const entry of entries) {
      try {
        const full = path.join(dir, entry);
        const stat = await fs.stat(full);
        if (stat.isDirectory()) {
          const sub = await fs.readdir(full).catch(() => []);
          for (const sub_entry of sub) {
            const subFull = path.join(full, sub_entry);
            if (subFull.endsWith('.jsonl') || subFull.endsWith('.json')) {
              const subStat = await fs.stat(subFull).catch(() => null);
              if (subStat && Date.now() - subStat.mtime.getTime() < maxAgeMs) return true;
            }
            if (sub_entry === 'conversations') {
              const convFiles = await fs.readdir(subFull).catch(() => []);
              for (const cf of convFiles) {
                const cfStat = await fs.stat(path.join(subFull, cf)).catch(() => null);
                if (cfStat && Date.now() - cfStat.mtime.getTime() < maxAgeMs) return true;
              }
            }
          }
        }
        if (Date.now() - stat.mtime.getTime() < maxAgeMs) return true;
      } catch {
        // ignore stat errors
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Auto-detects which reader to use and reads messages.
 * @param {string|null} projectPath - project root (defaults to cwd)
 * @param {boolean} forceStdin - force stdin/paste reader
 */
export async function readMessages(projectPath, forceStdin = false) {
  if (forceStdin) {
    const { readMessages: pasteRead } = await import('./paste-input.js');
    return pasteRead(projectPath);
  }

  // 1. Check Claude Code
  const hasClaudeActivity = await hasRecentFiles(CLAUDE_PROJECTS_DIR);
  if (hasClaudeActivity) {
    try {
      const { readMessages: claudeRead } = await import('./claude-code.js');
      const result = await claudeRead(projectPath);
      if (result.messages.length > 0) return result;
    } catch (err) {
      console.error(`  ⚠ Claude Code reader failed: ${err.message}`);
    }
  }

  // 2. Check Antigravity
  const hasAntigravity = await dirExists(ANTIGRAVITY_BRAIN_DIR);
  if (hasAntigravity) {
    try {
      const { readMessages: agRead } = await import('./antigravity.js');
      const result = await agRead(projectPath);
      if (result.messages.length > 0) return result;
    } catch (err) {
      console.error(`  ⚠ Antigravity reader failed: ${err.message}`);
    }
  }

  // 3. Check Codex CLI
  const hasCodexActivity = await hasRecentFiles(CODEX_HISTORY_DIR);
  if (hasCodexActivity) {
    try {
      const { readMessages: codexRead } = await import('./codex-cli.js');
      const result = await codexRead(projectPath);
      if (result.messages.length > 0) return result;
    } catch (err) {
      console.error(`  ⚠ Codex CLI reader failed: ${err.message}`);
    }
  }

  // 4. Fallback to stdin paste
  console.log('  No local IDE history detected — falling back to paste input.');
  const { readMessages: pasteRead } = await import('./paste-input.js');
  return pasteRead(projectPath);
}
