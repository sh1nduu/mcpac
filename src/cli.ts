#!/usr/bin/env bun

import { Command } from 'commander';
import { examplesCommand } from './commands/examples.js';
import { executeCommand } from './commands/execute.js';
import { generateCommand } from './commands/generate.js';
import { gettingStartedCommand } from './commands/getting-started.js';
import { infoCommand } from './commands/info.js';
import { serverCommand } from './commands/server.js';
import { toolsCommand } from './commands/tools.js';
import { VERSION } from './version.js';

const program = new Command();

program
  .name('mcpac')
  .description('MCP as Code - Convert MCP servers into executable TypeScript libraries')
  .version(VERSION)
  .addHelpText(
    'after',
    `
Quick Start:
  $ mcpac getting-started    # Complete setup guide
  $ mcpac info              # Check current status
  $ mcpac examples          # View usage examples

Common Workflow:
  1. mcpac server add <name> --command <cmd> --args <args...>
  2. mcpac generate
  3. mcpac tools list         # Discover available functions
  4. mcpac tools call <name>  # Quick tool invocation (OR)
  5. mcpac execute -f <file>  # Complex multi-tool scripts
`,
  );

// Add subcommands
program.addCommand(gettingStartedCommand);
program.addCommand(infoCommand);
program.addCommand(examplesCommand);
serverCommand(program);
generateCommand(program);
executeCommand(program);
toolsCommand(program);

// Error handling
program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  process.exit(1);
});

// Parse arguments
program.parse();
