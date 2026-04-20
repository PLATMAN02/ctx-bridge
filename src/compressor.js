// Compresses chat messages + git state into a handoff prompt with full recent context

const MAX_MSG_CHARS = 500; // max chars per message before truncating

function truncate(text, max = MAX_MSG_CHARS) {
  const t = text.trim();
  return t.length > max ? t.slice(0, max) + '…' : t;
}

function firstSentence(text) {
  const s = text.replace(/\n+/g, ' ').trim();
  const end = s.search(/[.!?\n]/);
  return end > 0 ? s.slice(0, end + 1) : s.slice(0, 120);
}

// Patterns to detect task description
const TASK_PATTERNS = [
  /\b(build|create|add|fix|implement|make|write|update|refactor|debug|set up|configure)\b/i
];

// Patterns to detect errors
const ERROR_PATTERNS = [
  /error[:\s]/i, /exception[:\s]/i, /failed[:\s]/i, /cannot\s/i
];

function extractTask(messages) {
  const userMsgs = messages.filter(m => m.role === 'user');
  // Find first user message that describes work to be done
  for (const m of userMsgs) {
    if (TASK_PATTERNS.some(p => p.test(m.content))) {
      return firstSentence(m.content);
    }
  }
  return userMsgs[0] ? firstSentence(userMsgs[0].content) : 'unknown';
}

function extractLastError(messages, gitErrors) {
  if (gitErrors) return gitErrors.split('\n').find(l => l.trim()) ?? 'none';
  const assistantMsgs = [...messages].reverse().filter(m => m.role === 'assistant');
  for (const m of assistantMsgs) {
    for (const line of m.content.split('\n')) {
      if (ERROR_PATTERNS.some(p => p.test(line)) && line.length > 10) {
        return line.trim().slice(0, 150);
      }
    }
  }
  return 'none';
}

function extractStopped(messages) {
  const last = [...messages].reverse().find(m => m.role === 'assistant');
  if (!last) return 'unknown';
  const lines = last.content.split('\n').map(l => l.trim()).filter(Boolean);
  // Return last meaningful line
  return lines[lines.length - 1]?.slice(0, 150) ?? 'unknown';
}

function extractNext(messages) {
  const last = [...messages].reverse().find(m => m.role === 'user');
  if (!last) return 'unknown';
  return firstSentence(last.content);
}

function formatRecentMessages(messages) {
  // Last 15 messages formatted cleanly
  return messages
    .slice(-15)
    .map(m => {
      const role = m.role === 'user' ? 'YOU' : 'AI';
      return `[${role}]: ${truncate(m.content)}`;
    })
    .join('\n\n');
}

export async function compress({ messages, gitState, ide, projectPath }) {
  const filesLine = gitState.changedFiles.length
    ? gitState.changedFiles.join(', ')
    : 'none detected';

  const errorsLine = extractLastError(messages, gitState.errors);
  const recentMsgs = messages.slice(-30);
  const recentFormatted = formatRecentMessages(recentMsgs);

  const gitSummary = [
    gitState.recentCommits ? `commits: ${gitState.recentCommits.split('\n')[0]}` : null,
    gitState.status ? `status: ${gitState.status.split('\n')[0]}` : null,
  ].filter(Boolean).join(' | ');

  return `── ctx handoff ──
task:      ${extractTask(messages)}
stopped:   ${extractStopped(recentMsgs)}
next:      ${extractNext(recentMsgs)}
files:     ${filesLine}
git:       ${gitSummary || 'no git info'}
errors:    ${errorsLine}
─────────────────
RECENT CONVERSATION (last ${Math.min(messages.length, 15)} messages):

${recentFormatted}
─────────────────
Resume by continuing from "stopped" above. Read the recent conversation for full context.`;
}
