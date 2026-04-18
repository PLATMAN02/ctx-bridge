// Compresses chat messages + git state into a handoff prompt using local heuristics (no API)

// Patterns that suggest a task description in user messages
const TASK_PATTERNS = [
  /\b(build|create|add|fix|implement|make|write|update|refactor|debug|set up|configure)\b/i
];

// Patterns that suggest errors in assistant messages
const ERROR_PATTERNS = [
  /error[:\s]/i, /exception[:\s]/i, /failed[:\s]/i, /cannot\s/i, /undefined\s/i, /null\s/i
];

// Patterns that suggest something was completed
const DONE_PATTERNS = [
  /\b(created|added|fixed|implemented|updated|done|complete|working|saved)\b/i
];

function firstSentence(text) {
  const s = text.replace(/\n+/g, ' ').trim();
  const end = s.search(/[.!?\n]/);
  return end > 0 ? s.slice(0, end + 1) : s.slice(0, 120);
}

function extractTask(messages) {
  // Walk user messages from the start to find what was asked to be built
  const userMsgs = messages.filter(m => m.role === 'user');
  for (const m of userMsgs) {
    if (TASK_PATTERNS.some(p => p.test(m.content))) {
      return firstSentence(m.content);
    }
  }
  return userMsgs[0] ? firstSentence(userMsgs[0].content) : 'unknown';
}

function extractLastError(messages) {
  // Walk assistant messages in reverse for the most recent error mention
  const assistantMsgs = [...messages].reverse().filter(m => m.role === 'assistant');
  for (const m of assistantMsgs) {
    const lines = m.content.split('\n');
    for (const line of lines) {
      if (ERROR_PATTERNS.some(p => p.test(line))) {
        return line.trim().slice(0, 150);
      }
    }
  }
  return 'none';
}

function extractDone(messages) {
  // Find the most recent assistant message that describes completing something
  const assistantMsgs = [...messages].reverse().filter(m => m.role === 'assistant');
  for (const m of assistantMsgs) {
    const lines = m.content.split('\n');
    for (const line of lines) {
      if (DONE_PATTERNS.some(p => p.test(line)) && line.length > 10) {
        return line.trim().slice(0, 150);
      }
    }
  }
  return 'unknown';
}

function extractStopped(messages) {
  // Last assistant message — this is where it stopped
  const last = [...messages].reverse().find(m => m.role === 'assistant');
  if (!last) return 'unknown';
  // Take the last meaningful line
  const lines = last.content.split('\n').map(l => l.trim()).filter(Boolean);
  return lines[lines.length - 1]?.slice(0, 150) ?? 'unknown';
}

function extractNext(messages) {
  // Last user message — this is what was being asked next
  const last = [...messages].reverse().find(m => m.role === 'user');
  if (!last) return 'unknown';
  return firstSentence(last.content);
}

export async function compress({ messages, gitState, ide, projectPath }) {
  const filesLine = gitState.changedFiles.length
    ? gitState.changedFiles.join(', ')
    : 'none detected';

  const errorsLine = gitState.errors
    ? gitState.errors.split('\n').find(l => l.trim()) ?? 'none'
    : extractLastError(messages);

  const recentMsgs = messages.slice(-30);

  return `── ctx handoff ──
task:      ${extractTask(messages)}
decided:   see last assistant message
tried:     unknown
done:      ${extractDone(recentMsgs)}
stopped:   ${extractStopped(recentMsgs)}
next:      ${extractNext(recentMsgs)}
files:     ${filesLine}
errors:    ${errorsLine}
─────────────────
Resume by continuing from "stopped" above.`;
}
