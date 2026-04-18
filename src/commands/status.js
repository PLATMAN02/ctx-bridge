// Shows monitoring status and lists recent snapshots

import { readConfig } from '../config.js';
import { list } from '../snapshot.js';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  if (diff < 60_000) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return new Date(ts).toLocaleDateString();
}

export async function run() {
  const config = await readConfig();
  const snapshots = await list();

  console.log('\n  ctx status\n');

  if (!config) {
    console.log('  No active monitoring session. Run `ctx start` to begin.\n');
  } else {
    console.log(`  IDE:       ${config.ide ?? 'unknown'}`);
    console.log(`  Project:   ${config.projectPath ?? process.cwd()}`);
    console.log(`  Started:   ${config.startedAt ? new Date(config.startedAt).toLocaleString() : 'unknown'}`);
    console.log(`  Interval:  every ${config.snapshotInterval ?? 10} messages`);
    if (config.lastSnapshotAt) {
      console.log(`  Last snap: ${new Date(config.lastSnapshotAt).toLocaleString()}`);
    }
    console.log('');
  }

  console.log(`  Snapshots: ${snapshots.length} total\n`);

  if (snapshots.length === 0) {
    console.log('  No snapshots yet.\n');
    return;
  }

  const recent = snapshots.slice(0, 5);
  console.log('  Recent snapshots:');
  for (let i = 0; i < recent.length; i++) {
    const s = recent[i];
    const ts = timeAgo(s.timestamp);
    const msgs = s.messages?.length ?? 0;
    const files = s.gitState?.changedFiles?.length ?? 0;
    const marker = i === 0 ? ' ← latest' : '';
    console.log(`    #${snapshots.length - i}  ${ts.padEnd(12)} ${msgs} msgs  ${files} files${marker}`);
  }
  console.log('');
}
