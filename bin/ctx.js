#!/usr/bin/env node
// CLI entry point — registers start, paste, and status commands via commander

import { Command } from 'commander';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

program
  .name('ctx')
  .description('Context Bridge — seamless AI context transfer across IDEs')
  .version(version);

program
  .command('start')
  .description('Start background session monitoring with auto-snapshots')
  .option('--interval <n>', 'Snapshot every N messages', '10')
  .action(async (opts) => {
    const { run } = await import('../src/commands/start.js');
    await run(opts);
  });

program
  .command('paste')
  .description('Generate handoff prompt and copy to clipboard')
  .option('--paste', 'Force stdin fallback reader (for cloud IDEs)')
  .action(async (opts) => {
    const { run } = await import('../src/commands/paste.js');
    await run(opts);
  });

program
  .command('status')
  .description('Show monitoring status and recent snapshots')
  .action(async () => {
    const { run } = await import('../src/commands/status.js');
    await run();
  });

program.parse(process.argv);
