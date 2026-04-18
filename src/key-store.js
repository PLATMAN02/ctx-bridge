// Persists the Gemini API key to ~/.ctx/config.json so it survives across projects

import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import readline from 'readline';

const GLOBAL_CTX_DIR = path.join(os.homedir(), '.ctx');
const GLOBAL_CONFIG_PATH = path.join(GLOBAL_CTX_DIR, 'config.json');

async function readGlobalConfig() {
  try {
    const raw = await fs.readFile(GLOBAL_CONFIG_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function writeGlobalConfig(data) {
  await fs.mkdir(GLOBAL_CTX_DIR, { recursive: true });
  const current = await readGlobalConfig();
  await fs.writeFile(GLOBAL_CONFIG_PATH, JSON.stringify({ ...current, ...data }, null, 2));
}

export async function getGeminiKey() {
  // 1. Environment variable takes precedence
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;

  // 2. Check persisted global config
  const config = await readGlobalConfig();
  if (config.geminiApiKey) return config.geminiApiKey;

  return null;
}

export async function promptAndSaveGeminiKey() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const key = await new Promise((resolve) => {
    rl.question(
      '\n  Gemini API key not found.\n  Get a free key at https://aistudio.google.com/apikey\n\n  Paste your GEMINI_API_KEY: ',
      (answer) => {
        rl.close();
        resolve(answer.trim());
      }
    );
  });

  if (!key) {
    console.log('  ⚠ No key entered — compression will use local fallback.\n');
    return null;
  }

  await writeGlobalConfig({ geminiApiKey: key });
  console.log(`  ✓ Key saved to ${GLOBAL_CONFIG_PATH}\n`);

  // Also set it in the current process so compressor picks it up immediately
  process.env.GEMINI_API_KEY = key;
  return key;
}
