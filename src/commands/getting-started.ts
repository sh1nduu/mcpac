import { Command } from 'commander';

export const gettingStartedCommand = new Command('getting-started')
  .description('Show getting started guide')
  .action(() => {
    console.log(`
🚀 Getting Started with MCPaC

MCPaC converts MCP servers into TypeScript libraries that you can execute as code.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Quick Start Workflow

1️⃣  Add an MCP Server
   $ mcpac server add filesystem --command npx \\
       --args @modelcontextprotocol/server-filesystem \\
       --args ./workspace

2️⃣  Generate TypeScript Code
   $ mcpac generate

3️⃣  Explore Available Tools (Optional)
   $ mcpac tools list -s filesystem          # See functions for specific server
   $ mcpac tools list                        # See all functions
   $ mcpac tools describe listDirectory      # View function details
   $ mcpac tools call readFile --path ./README.md  # Call tool directly

4️⃣  Execute Code with MCP Tools
   $ mcpac execute -c "
     declare const runtime: MCPaC.McpRequires<['filesystem.listDirectory']>;
     const result = await runtime.filesystem.listDirectory({ path: '.' });
     console.log(result.content[0].text);
   " --grant filesystem.listDirectory

   Note: MCPaC namespace provides type-safe access without explicit imports!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Reference MCP Servers

Official reference servers demonstrating MCP features:
  • Everything - Reference/test server with prompts, resources, and tools
  • Fetch - Web content fetching and conversion for efficient LLM usage
  • Filesystem - Secure file operations with configurable access controls
  • Git - Tools to read, search, and manipulate Git repositories
  • Memory - Knowledge graph-based persistent memory system
  • Sequential Thinking - Dynamic and reflective problem-solving
  • Time - Time and timezone conversion capabilities

Find more servers at: https://github.com/modelcontextprotocol/servers

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Understanding the Generated Code

After running 'mcpac generate', you'll have a hierarchical structure:

  servers/
  ├── _mcpac_runtime.ts         # Runtime library for MCP communication
  ├── _types.d.ts               # Lightweight root type definitions
  ├── global.d.ts               # MCPaC ambient namespace (no import needed!)
  └── <server-name>/
      ├── index.d.ts            # Server-level type definitions
      ├── <tool1>.d.ts          # Individual tool type definitions
      └── <tool2>.d.ts

Key Features:
  • Hierarchical .d.ts structure reduces token consumption
  • MCPaC namespace eliminates boilerplate imports
  • Type-safe access to all MCP tools
  • Capability-based permission system

Example usage (recommended - MCPaC namespace):
  declare const runtime: MCPaC.McpRequires<['filesystem.readFile']>;

  const result = await runtime.filesystem.readFile({ path: './data.txt' });
  const text = result.content.find(c => c.type === 'text')?.text;

Alternative (explicit import):
  import type { McpRequires } from './servers/_types.js';
  declare const runtime: McpRequires<['filesystem.readFile']>;

All tool calls return this structure:
  {
    content: Array<{type: "text", text: string} | ...>,
    isError: boolean
  }

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Next Steps

  📊 Check status:       mcpac info
  🔧 Explore tools:      mcpac tools list
  📝 View examples:      mcpac examples
  🔍 Test a server:      mcpac server test <name>
  📚 List commands:      mcpac --help

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);
  });
