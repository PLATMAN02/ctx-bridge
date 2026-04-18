// Saves and loads context snapshots to/from .ctx/snapshots/

import fs from 'fs/promises';
import path from 'path';

const CTX_DIR = path.join(process.cwd(), '.ctx');
const SNAPSHOTS_DIR = path.join(CTX_DIR, 'snapshots');
const LATEST_PATH = path.join(SNAPSHOTS_DIR, 'latest.json');
const GITIGNORE_PATH = path.join(process.cwd(), '.gitignore');

async function ensureDirs() {
  await fs.mkdir(SNAPSHOTS_DIR, { recursive: true });
  await ensureGitignore();
}

async function ensureGitignore() {
  try {
    let content = '';
    try {
      content = await fs.readFile(GITIGNORE_PATH, 'utf8');
    } catch {
      // .gitignore doesn't exist yet — that's fine
    }
    if (!content.includes('.ctx/')) {
      await fs.appendFile(GITIGNORE_PATH, '\n# ctx-bridge snapshots\n.ctx/\n');
    }
  } catch {
    // If we can't write .gitignore, it's not fatal
  }
}

export async function save(data) {
  await ensureDirs();

  const timestamp = Date.now();
  const filename = `${timestamp}.json`;
  const filepath = path.join(SNAPSHOTS_DIR, filename);

  const snapshot = {
    timestamp,
    ide: data.ide,
    projectPath: data.projectPath,
    messages: data.messages,
    gitState: data.gitState,
    handoff: data.handoff
  };

  await fs.writeFile(filepath, JSON.stringify(snapshot, null, 2));

  // Update latest.json (copy, not symlink — more portable)
  await fs.writeFile(LATEST_PATH, JSON.stringify(snapshot, null, 2));

  return snapshot;
}

export async function loadLatest() {
  try {
    const raw = await fs.readFile(LATEST_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function list() {
  try {
    const entries = await fs.readdir(SNAPSHOTS_DIR);
    const snapshots = [];

    for (const entry of entries) {
      if (entry === 'latest.json') continue;
      if (!entry.endsWith('.json')) continue;
      try {
        const raw = await fs.readFile(path.join(SNAPSHOTS_DIR, entry), 'utf8');
        const data = JSON.parse(raw);
        snapshots.push(data);
      } catch {
        // skip corrupt snapshot files
      }
    }

    return snapshots.sort((a, b) => b.timestamp - a.timestamp);
  } catch {
    return [];
  }
}
