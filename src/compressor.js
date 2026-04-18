// Compresses chat messages + git state into a dense handoff prompt via Gemini API

import { GoogleGenerativeAI } from '@google/generative-ai';
import { getGeminiKey } from './key-store.js';

const HANDOFF_TEMPLATE = `── ctx handoff ──
task:      <what was being built>
decided:   <key decisions made and why>
tried:     <approaches tried and rejected>
done:      <what is complete>
stopped:   <exactly where it stopped, file + line if known>
next:      <the very next action to take>
files:     <list of files actively being changed>
errors:    <last error message if any>
─────────────────
Resume by continuing from "stopped" above.`;

const SYSTEM_PROMPT = `You are a context compression engine. Your job is to read an AI coding session (chat messages + git changes) and produce a dense handoff summary under 500 tokens.
The summary will be pasted into a new AI IDE session so it can continue the work seamlessly.
Be specific. Include file names, line numbers, error messages, and exact next steps.
Never use vague language like "continue working" — always say exactly what to do next.
Output only the handoff block, no preamble.

Use this exact format:
${HANDOFF_TEMPLATE}`;

function formatMessages(messages) {
  return messages
    .map(m => `${m.role.toUpperCase()}: ${m.content}`)
    .join('\n\n');
}

function localCompress(messages, gitState) {
  const recent = messages.slice(-10);
  const lastUserMsg = [...recent].reverse().find(m => m.role === 'user');
  const lastAssistantMsg = [...recent].reverse().find(m => m.role === 'assistant');

  const filesLine = gitState.changedFiles.length
    ? gitState.changedFiles.join(', ')
    : 'none detected';

  const errorsLine = gitState.errors
    ? gitState.errors.split('\n')[0]
    : 'none';

  return `── ctx handoff ──
task:      ${lastUserMsg ? lastUserMsg.content.slice(0, 120) : 'unknown'}
decided:   (no API key — set GEMINI_API_KEY for full compression)
tried:     unknown
done:      ${gitState.recentCommits ? gitState.recentCommits.split('\n')[0] : 'unknown'}
stopped:   ${lastAssistantMsg ? lastAssistantMsg.content.slice(0, 120) : 'unknown'}
next:      continue from last assistant message above
files:     ${filesLine}
errors:    ${errorsLine}
─────────────────
Resume by continuing from "stopped" above.`;
}

export async function compress({ messages, gitState, ide, projectPath }) {
  const apiKey = await getGeminiKey();

  if (!apiKey) {
    console.error('  ⚠ No Gemini API key — using local compression (less accurate)');
    return localCompress(messages, gitState);
  }

  const userPrompt = `IDE: ${ide}
Project: ${projectPath}

RECENT CONVERSATION (last ${messages.length} messages):
${formatMessages(messages)}

GIT STATE:
Changed files: ${gitState.changedFiles.join(', ') || 'none'}
Recent commits: ${gitState.recentCommits || 'none'}
Diff summary: ${gitState.diffStat || 'no changes'}
Errors found: ${gitState.errors || 'none'}

Produce the handoff summary now.`;

  try {
    const genai = new GoogleGenerativeAI(apiKey);
    const model = genai.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: SYSTEM_PROMPT
    });

    const result = await model.generateContent(userPrompt);
    return result.response.text().trim();
  } catch (err) {
    console.error(`  ⚠ Gemini compression failed: ${err.message} — falling back to local`);
    return localCompress(messages, gitState);
  }
}
