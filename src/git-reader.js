// Reads git state (diffs, log, status) and recent error logs from the project root

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);

const MAX_DIFF_CHARS = 3000;
const LOG_TAIL_LINES = 100;

async function run(cmd, cwd) {
  try {
    const { stdout } = await execAsync(cmd, { cwd, timeout: 10000 });
    return stdout.trim();
  } catch (err) {
    // Non-zero exit (e.g. no commits yet) — return stderr or empty
    return (err.stderr || '').trim();
  }
}

async function readLogErrors(projectPath) {
  const errors = [];
  try {
    const entries = await fs.readdir(projectPath);
    const logFiles = entries.filter(e => e.endsWith('.log'));
    for (const logFile of logFiles.slice(0, 3)) {
      const full = path.join(projectPath, logFile);
      const content = await fs.readFile(full, 'utf8');
      const lines = content.split('\n');
      const tail = lines.slice(-LOG_TAIL_LINES).join('\n');
      // Extract lines that look like errors
      const errorLines = tail
        .split('\n')
        .filter(l => /error|exception|fatal|failed/i.test(l))
        .slice(-10);
      if (errorLines.length) {
        errors.push(`[${logFile}]\n${errorLines.join('\n')}`);
      }
    }
  } catch {
    // no log files or unreadable — ignore
  }
  return errors.join('\n\n').trim();
}

export async function readGitState(projectPath) {
  const cwd = projectPath || process.cwd();

  const [diffStat, diffFull, log, status, stash] = await Promise.all([
    run('git diff HEAD --stat', cwd),
    run('git diff HEAD -- .', cwd),
    run('git log --oneline -5', cwd),
    run('git status --short', cwd),
    run('git stash list', cwd)
  ]);

  const diff = diffFull.length > MAX_DIFF_CHARS
    ? diffFull.slice(0, MAX_DIFF_CHARS) + '\n... (truncated)'
    : diffFull;

  // Parse changed file names from diff stat.
  // Real diff stat lines look like: " src/foo.js | 3 +++"
  // Filter by requiring a | followed by whitespace and a digit.
  const changedFiles = diffStat
    .split('\n')
    .filter(l => /\|\s+\d/.test(l))
    .map(l => l.split('|')[0].trim())
    .filter(Boolean);

  const errors = await readLogErrors(cwd);

  return {
    changedFiles,
    diff,
    diffStat,
    recentCommits: log,
    status,
    stash,
    errors
  };
}
