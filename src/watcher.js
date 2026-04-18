// Polling loop that auto-snapshots when message count grows or git changes

import { readMessages } from './readers/index.js';
import { readGitState } from './git-reader.js';
import { compress } from './compressor.js';
import { save, list } from './snapshot.js';
import { readConfig, writeConfig } from './config.js';

const POLL_INTERVAL_MS = 30_000;       // 30 seconds
const GIT_SNAPSHOT_MIN_MS = 5 * 60_000; // 5 minutes between git-triggered snapshots

let snapshotCount = 0;
let lastMessageCount = 0;
let lastSnapshotAt = 0;
let lastGitDiffStat = '';

async function takeSnapshot(ide, projectPath, reason) {
  try {
    const [{ messages, sessionId }, gitState] = await Promise.all([
      readMessages(projectPath),
      readGitState(projectPath)
    ]);

    const handoff = await compress({ messages, gitState, ide, projectPath });
    await save({ messages, ide, projectPath, gitState, handoff });

    snapshotCount++;
    lastMessageCount = messages.length;
    lastSnapshotAt = Date.now();
    lastGitDiffStat = gitState.diffStat;

    await writeConfig({
      lastSnapshotMessageCount: lastMessageCount,
      lastSnapshotAt: new Date().toISOString()
    });

    const fileCount = gitState.changedFiles.length;
    console.log(
      `  ✓ snapshot #${snapshotCount} saved — ${messages.length} msgs · ${fileCount} files  [${reason}]`
    );
  } catch (err) {
    console.error(`  ✗ snapshot failed: ${err.message}`);
  }
}

export async function startWatcher(ide, projectPath, snapshotInterval = 10) {
  const config = await readConfig();
  lastMessageCount = config?.lastSnapshotMessageCount ?? 0;
  lastSnapshotAt = config?.lastSnapshotAt ? new Date(config.lastSnapshotAt).getTime() : 0;

  const existingSnapshots = await list();
  snapshotCount = existingSnapshots.length;

  console.log(`  Polling every ${POLL_INTERVAL_MS / 1000}s — snapshot every ${snapshotInterval} messages`);

  const poll = async () => {
    try {
      const { messages } = await readMessages(projectPath);
      const gitState = await readGitState(projectPath);
      const now = Date.now();

      const msgDelta = messages.length - lastMessageCount;
      const gitChanged = gitState.diffStat !== lastGitDiffStat;
      const timeSinceSnapshot = now - lastSnapshotAt;

      const shouldSnapshotMessages = msgDelta >= snapshotInterval;
      const shouldSnapshotGit = gitChanged && timeSinceSnapshot >= GIT_SNAPSHOT_MIN_MS;

      if (shouldSnapshotMessages) {
        await takeSnapshot(ide, projectPath, `+${msgDelta} messages`);
      } else if (shouldSnapshotGit) {
        await takeSnapshot(ide, projectPath, 'git changes');
      }
    } catch (err) {
      console.error(`  ⚠ poll error: ${err.message}`);
    }
  };

  // Take an initial snapshot on start
  await takeSnapshot(ide, projectPath, 'initial');

  setInterval(poll, POLL_INTERVAL_MS);
}
