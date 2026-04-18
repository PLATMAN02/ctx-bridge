// Polling loop that updates context snapshot on every new message or git change

import { readMessages } from './readers/index.js';
import { readGitState } from './git-reader.js';
import { compress } from './compressor.js';
import { save, list } from './snapshot.js';
import { readConfig, writeConfig } from './config.js';

const POLL_INTERVAL_MS = 1_000; // 1 second

let snapshotCount = 0;
let lastMessageCount = 0;
let lastGitDiffStat = '';
let isSnapshotting = false; // prevent overlapping snapshots

async function takeSnapshot(ide, projectPath, reason) {
  if (isSnapshotting) return;
  isSnapshotting = true;
  try {
    const [{ messages }, gitState] = await Promise.all([
      readMessages(projectPath),
      readGitState(projectPath)
    ]);

    const handoff = await compress({ messages, gitState, ide, projectPath });
    await save({ messages, ide, projectPath, gitState, handoff });

    snapshotCount++;
    lastMessageCount = messages.length;
    lastGitDiffStat = gitState.diffStat;

    await writeConfig({
      lastSnapshotMessageCount: lastMessageCount,
      lastSnapshotAt: new Date().toISOString()
    });

    const fileCount = gitState.changedFiles.length;
    process.stdout.write(
      `\r  ✓ context updated — ${messages.length} msgs · ${fileCount} files  [${reason}]  \n`
    );
  } catch (err) {
    console.error(`  ✗ snapshot failed: ${err.message}`);
  } finally {
    isSnapshotting = false;
  }
}

export async function startWatcher(ide, projectPath) {
  const config = await readConfig();
  lastMessageCount = config?.lastSnapshotMessageCount ?? 0;

  const existingSnapshots = await list();
  snapshotCount = existingSnapshots.length;

  console.log(`  Polling every 1s — updating on every new message or git change`);

  const poll = async () => {
    try {
      const { messages } = await readMessages(projectPath);
      const gitState = await readGitState(projectPath);

      const newMessages = messages.length !== lastMessageCount;
      const gitChanged = gitState.diffStat !== lastGitDiffStat;

      if (newMessages) {
        await takeSnapshot(ide, projectPath, `${messages.length} msgs`);
      } else if (gitChanged) {
        await takeSnapshot(ide, projectPath, 'git changed');
      }
    } catch (err) {
      // silent — don't spam terminal on every poll error
    }
  };

  // Initial snapshot on start
  await takeSnapshot(ide, projectPath, 'initial');

  setInterval(poll, POLL_INTERVAL_MS);
}
