// Generates a handoff prompt and copies it to clipboard

import clipboard from 'clipboardy';
import { loadLatest, save } from '../snapshot.js';
import { readMessages } from '../readers/index.js';
import { readGitState } from '../git-reader.js';
import { compress } from '../compressor.js';

export async function run(opts = {}) {
  let snapshot = await loadLatest();

  if (snapshot) {
    console.log(`  Using snapshot from ${new Date(snapshot.timestamp).toLocaleString()}`);
    console.log(`  IDE: ${snapshot.ide}  |  Messages: ${snapshot.messages.length}`);
  } else {
    console.log('  No snapshot found — running fresh read…');
    try {
      const forceStdin = opts.paste === true;
      const { messages, ide, projectPath, sessionId } = await readMessages(null, forceStdin);
      const gitState = await readGitState(projectPath);
      const handoff = await compress({ messages, gitState, ide, projectPath });

      snapshot = await save({ messages, ide, projectPath, gitState, handoff });
      console.log(`  Fresh snapshot saved  (${messages.length} msgs, ide: ${ide})`);
    } catch (err) {
      console.error(`  Error reading session: ${err.message}`);
      process.exit(1);
    }
  }

  let { handoff } = snapshot;

  // Re-compress if handoff is missing (older snapshot format)
  if (!handoff) {
    console.log('  Re-compressing snapshot…');
    handoff = await compress({
      messages: snapshot.messages,
      gitState: snapshot.gitState,
      ide: snapshot.ide,
      projectPath: snapshot.projectPath
    });
  }

  try {
    await clipboard.write(handoff);
    console.log('\n  ✓ Handoff prompt copied to clipboard\n');
  } catch {
    console.log('\n  ⚠ Could not copy to clipboard — showing prompt below\n');
  }

  console.log('─'.repeat(60));
  console.log(handoff);
  console.log('─'.repeat(60));
  console.log('\n  Paste this into your new IDE session to resume.\n');
}
