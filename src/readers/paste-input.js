// Reads conversation from stdin — fallback for cloud IDEs (Codex App, Windsurf, Copilot)

import readline from 'readline';

// Patterns that indicate a new message boundary and the speaker
const ROLE_PATTERNS = [
  { pattern: /^(you|user)\s*:/i, role: 'user' },
  { pattern: /^(assistant|claude|copilot|ai|bot|codex|windsurf|cursor)\s*:/i, role: 'assistant' }
];

function detectRole(line) {
  for (const { pattern, role } of ROLE_PATTERNS) {
    if (pattern.test(line.trim())) return role;
  }
  return null;
}

function stripRolePrefix(line) {
  return line.replace(/^[^:]+:\s*/, '').trim();
}

async function readStdin() {
  return new Promise((resolve) => {
    const lines = [];
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    rl.on('line', line => lines.push(line));
    rl.on('close', () => resolve(lines));
  });
}

export async function readMessages(projectPath) {
  console.log('  Paste your conversation below. Press Ctrl+D when done.\n');

  const lines = await readStdin();

  const messages = [];
  let currentRole = null;
  let currentLines = [];

  for (const line of lines) {
    const role = detectRole(line);
    if (role) {
      // Save previous message
      if (currentRole && currentLines.length) {
        messages.push({
          role: currentRole,
          content: currentLines.join('\n').trim(),
          timestamp: Date.now()
        });
      }
      currentRole = role;
      const firstLine = stripRolePrefix(line);
      currentLines = firstLine ? [firstLine] : [];
    } else if (currentRole) {
      currentLines.push(line);
    }
  }

  // Save last message
  if (currentRole && currentLines.length) {
    messages.push({
      role: currentRole,
      content: currentLines.join('\n').trim(),
      timestamp: Date.now()
    });
  }

  if (!messages.length) {
    // Treat entire input as a single user message
    const content = lines.join('\n').trim();
    if (content) {
      messages.push({ role: 'user', content, timestamp: Date.now() });
    }
  }

  return {
    messages,
    ide: 'paste-input',
    projectPath: projectPath || process.cwd(),
    sessionId: `paste-${Date.now()}`
  };
}
