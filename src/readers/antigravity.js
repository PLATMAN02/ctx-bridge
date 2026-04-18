// Reads session context from Antigravity (Google) — ~/.gemini/antigravity/brain/

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);
const BRAIN_DIR = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
const AG_STORAGE = path.join(
  os.homedir(), 'Library', 'Application Support', 'Antigravity', 'User', 'workspaceStorage'
);

async function sqlite(dbPath, query) {
  try {
    const { stdout } = await execAsync(`sqlite3 "${dbPath}" "${query}"`, { timeout: 5000 });
    return stdout.trim();
  } catch {
    return '';
  }
}

/**
 * Find the workspaceStorage dir that matches the given project path.
 */
async function findWorkspaceDir(projectPath) {
  let entries;
  try {
    entries = await fs.readdir(AG_STORAGE);
  } catch {
    return null;
  }

  const normalized = path.resolve(projectPath);

  for (const entry of entries) {
    const wsJson = path.join(AG_STORAGE, entry, 'workspace.json');
    try {
      const raw = await fs.readFile(wsJson, 'utf8');
      const data = JSON.parse(raw);
      const folder = data.folder
        ? decodeURIComponent(data.folder.replace('file://', ''))
        : null;
      if (folder && path.resolve(folder) === normalized) {
        return path.join(AG_STORAGE, entry);
      }
    } catch {
      // skip
    }
  }
  return null;
}

/**
 * Extract session IDs referenced in the workspace DB's jetski artifacts.
 */
async function getSessionIds(workspaceDir) {
  const dbPath = path.join(workspaceDir, 'state.vscdb');
  const raw = await sqlite(dbPath, "SELECT value FROM ItemTable WHERE key='memento/antigravity.jetskiArtifactsEditor';");
  if (!raw) return [];

  try {
    const data = JSON.parse(raw);
    const ids = new Set();
    const entries = data['jetskiArtifactsEditor.viewState'] ?? [];
    for (const [filePath] of entries) {
      // extract UUID from path like ~/.gemini/antigravity/brain/<uuid>/file.md.resolved
      const match = filePath.match(/brain\/([0-9a-f-]{36})\//);
      if (match) ids.add(match[1]);
    }
    return [...ids];
  } catch {
    return [];
  }
}

/**
 * Read a markdown file, return empty string if missing.
 */
async function readMd(filePath) {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return '';
  }
}

/**
 * Get the most recently modified session from the brain dir.
 * If sessionIds provided, restrict to those.
 */
async function findLatestSession(sessionIds) {
  let dirs;
  try {
    dirs = await fs.readdir(BRAIN_DIR);
  } catch {
    return null;
  }

  const candidates = sessionIds?.length ? dirs.filter(d => sessionIds.includes(d)) : dirs;

  const stats = await Promise.all(
    candidates.map(async id => {
      const dir = path.join(BRAIN_DIR, id);
      try {
        const s = await fs.stat(dir);
        return { id, dir, mtime: s.mtime };
      } catch {
        return null;
      }
    })
  );

  const sorted = stats.filter(Boolean).sort((a, b) => b.mtime - a.mtime);
  return sorted[0] ?? null;
}

export async function readMessages(projectPath) {
  const cwd = projectPath || process.cwd();

  // Try to find project-specific sessions via workspace DB
  let sessionIds = [];
  const wsDir = await findWorkspaceDir(cwd);
  if (wsDir) {
    sessionIds = await getSessionIds(wsDir);
  }

  const latest = await findLatestSession(sessionIds);
  if (!latest) {
    throw new Error(`No Antigravity sessions found for: ${cwd}`);
  }

  const messages = [];
  const ts = latest.mtime.getTime();

  // Layout A: task.md / implementation_plan.md / walkthrough.md directly in session dir
  const [task, plan, walkthrough] = await Promise.all([
    readMd(path.join(latest.dir, 'task.md')),
    readMd(path.join(latest.dir, 'implementation_plan.md')),
    readMd(path.join(latest.dir, 'walkthrough.md'))
  ]);

  if (plan) messages.push({ role: 'user', content: `[Implementation Plan]\n${plan}`, timestamp: ts - 2000 });
  if (task) messages.push({ role: 'assistant', content: `[Task Status]\n${task}`, timestamp: ts - 1000 });
  if (walkthrough) messages.push({ role: 'assistant', content: `[Walkthrough]\n${walkthrough}`, timestamp: ts });

  // Layout B: artifacts/*.md subdirectory
  if (!messages.length) {
    const artifactsDir = path.join(latest.dir, 'artifacts');
    try {
      const files = await fs.readdir(artifactsDir);
      const mdFiles = files
        .filter(f => f.endsWith('.md') && !f.includes('.resolved') && !f.includes('.metadata'))
        .sort();
      for (let i = 0; i < mdFiles.length; i++) {
        const content = await readMd(path.join(artifactsDir, mdFiles[i]));
        if (content) {
          const role = i === 0 ? 'user' : 'assistant';
          messages.push({ role, content: `[${mdFiles[i]}]\n${content}`, timestamp: ts - (mdFiles.length - i) * 1000 });
        }
      }
    } catch {
      // no artifacts dir
    }
  }

  if (!messages.length) {
    throw new Error(`Session ${latest.id} has no readable content`);
  }

  return {
    messages,
    ide: 'antigravity',
    projectPath: cwd,
    sessionId: latest.id
  };
}
