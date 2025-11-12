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
   $ mcpac tools list                        # See all functions
   $ mcpac tools describe listDirectory      # View function details
   $ mcpac tools call readFile --path ./README.md  # Call tool directly

4️⃣  Execute Code with MCP Tools
   $ mcpac execute -c "
     import { filesystem } from './servers/index.js';
     const result = await filesystem.listDirectory({ path: '.' });
     console.log(result.content[0].text);
   "

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Available MCP Servers

Official MCP servers you can use:
  • @modelcontextprotocol/server-filesystem - File system operations
  • @modelcontextprotocol/server-github - GitHub API access
  • @modelcontextprotocol/server-postgres - PostgreSQL database
  • @modelcontextprotocol/server-sqlite - SQLite database
  • @modelcontextprotocol/server-brave-search - Web search via Brave
  • @modelcontextprotocol/server-google-maps - Google Maps API

Find more servers at: https://github.com/modelcontextprotocol/servers

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Understanding the Generated Code

After running 'mcpac generate', you'll have:
  • servers/_mcpac_runtime.ts - Runtime library for MCP communication
  • servers/<server-name>/*.ts - Type-safe tool functions
  • servers/index.ts - Main exports

All generated functions return MCP tool call results with this structure:
  {
    content: Array<{type: "text", text: string} | ...>,
    isError: boolean
  }

Example usage:
  const result = await filesystem.readFile({ path: './data.txt' });
  const text = result.content.find(c => c.type === 'text')?.text;

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
