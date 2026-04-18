// Reads and writes .ctx/config.json for persistent session configuration

import fs from 'fs/promises';
import path from 'path';

const CTX_DIR = path.join(process.cwd(), '.ctx');
const CONFIG_PATH = path.join(CTX_DIR, 'config.json');

export async function readConfig() {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function writeConfig(data) {
  await fs.mkdir(CTX_DIR, { recursive: true });
  const current = await readConfig() || {};
  const updated = { ...current, ...data };
  await fs.writeFile(CONFIG_PATH, JSON.stringify(updated, null, 2));
  return updated;
}
