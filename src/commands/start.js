// Starts background session monitoring with auto-snapshots

import { readMessages } from '../readers/index.js';
import { writeConfig } from '../config.js';
import { startWatcher } from '../watcher.js';

export async function run(opts = {}) {
  const snapshotInterval = parseInt(opts.interval ?? '10', 10);
  const projectPath = process.cwd();

  console.log('\n  ctx — Context Bridge\n');
  console.log(`  Project: ${projectPath}`);

  // Auto-detect IDE
  let ide = 'unknown';
  try {
    const result = await readMessages(projectPath);
    ide = result.ide;
  } catch (err) {
    console.error(`  ⚠ Could not detect IDE: ${err.message}`);
    console.log('  Defaulting to paste-input mode.');
    ide = 'paste-input';
  }

  console.log(`  IDE detected: ${ide}`);
  console.log(`  Snapshot interval: every ${snapshotInterval} messages\n`);

  await writeConfig({
    ide,
    projectPath,
    startedAt: new Date().toISOString(),
    snapshotInterval
  });

  console.log('  Monitoring started. Press Ctrl+C to stop.\n');

  await startWatcher(ide, projectPath, snapshotInterval);
}
