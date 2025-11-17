import { Command } from 'commander';

export const examplesCommand = new Command('examples')
  .description('Show code examples')
  .action(() => {
    console.log(`
📝 MCPaC Code Examples

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  IMPORTANT: Tool Naming Conventions

MCP servers use different naming conventions. Always check actual tool names:
  $ mcpac tools list -s <server>

Common patterns:
  • Official filesystem: read_file, write_file (snake_case)
  • Everything server: echo, add, printEnv (camelCase/lowercase)

Permission IDs always use exact MCP names:
  • --grant filesystem.read_file   (NOT filesystem.readFile)
  • --grant everything.echo        (exact as shown)

The examples below use placeholder names. Replace with actual names from your server.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 1: Simple Echo (everything server)

// Recommended: MCPaC namespace (no import needed)
declare const runtime: MCPaC.McpRequires<['everything.echo']>;

const result = await runtime.everything.echo({ message: 'Hello MCPaC!' });
const text = result.content.find(c => c.type === 'text')?.text;
console.log(text);

// Run with: mcpac execute -f script.ts --grant everything.echo

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 2: Read File Content (filesystem server - snake_case)

// Note: Official filesystem server uses snake_case tool names
declare const runtime: MCPaC.McpRequires<['filesystem.read_file']>;

const result = await runtime.filesystem.read_file({ path: './data.txt' });
const text = result.content.find(c => c.type === 'text')?.text;

if (text) {
  console.log('File content:', text);
} else {
  console.error('No text content found');
}

// Run with: mcpac execute -f script.ts --grant filesystem.read_file

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 3: Write to File (filesystem server - snake_case)

declare const runtime: MCPaC.McpRequires<['filesystem.write_file']>;

const result = await runtime.filesystem.write_file({
  path: './output.txt',
  content: 'Hello from MCPaC!'
});

console.log('File written:', result.isError ? 'Failed' : 'Success');

// Run with: mcpac execute -f script.ts --grant filesystem.write_file

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 4: Multiple Operations (filesystem server)

// Declare required permissions (multiple) - using snake_case
declare const runtime: MCPaC.McpRequires<[
  'filesystem.create_directory',
  'filesystem.write_file',
  'filesystem.list_directory'
]>;

// Create directory
await runtime.filesystem.create_directory({ path: './output' });

// Write file
await runtime.filesystem.write_file({
  path: './output/result.txt',
  content: 'Processing complete'
});

// List directory contents
const list = await runtime.filesystem.list_directory({ path: './output' });
console.log(list.content.find(c => c.type === 'text')?.text);

// Run with: mcpac execute -f script.ts --grant filesystem.create_directory,filesystem.write_file,filesystem.list_directory

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 5: Working with MCP Response Structure

declare const runtime: MCPaC.McpRequires<['filesystem.read_file']>;

const result = await runtime.filesystem.read_file({ path: './data.json' });

// result.content is an array of ContentBlock
// ContentBlock can be: text, image, audio, resource_link, or resource

for (const block of result.content) {
  if (block.type === 'text') {
    const data = JSON.parse(block.text);
    console.log('Parsed JSON:', data);
  } else if (block.type === 'image') {
    console.log('Image data:', block.data);
    console.log('MIME type:', block.mimeType);
  }
}

// Run with: mcpac execute -f script.ts --grant filesystem.read_file

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 6: Error Handling

declare const runtime: MCPaC.McpRequires<['filesystem.read_file']>;

try {
  const result = await runtime.filesystem.read_file({ path: './nonexistent.txt' });

  if (result.isError) {
    console.error('Tool returned error:', result.content);
  } else {
    const text = result.content.find(c => c.type === 'text')?.text;
    console.log('Success:', text);
  }
} catch (error) {
  console.error('Exception occurred:', error.message);
}

// Run with: mcpac execute -f script.ts --grant filesystem.read_file

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Alternative: Explicit Import Syntax

If you prefer explicit imports over the MCPaC namespace:

import type { McpRequires } from './servers/_types.js';
declare const runtime: McpRequires<['filesystem.read_file']>;

// Both syntaxes work identically - choose based on preference
// MCPaC.McpRequires - No import needed, concise
// McpRequires       - Explicit import, traditional

Note: Always use exact MCP tool names in permission declarations!

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Running Examples

Execute inline code:
  $ mcpac execute -c "<paste example code>" --grant <permissions>

Execute from file:
  $ echo "<paste example code>" > script.ts
  $ mcpac execute -f script.ts --grant <permissions>

Execute from stdin:
  $ cat script.ts | mcpac execute --stdin --grant <permissions>

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Tips:
  • Examples show common patterns - check YOUR server's actual tool names!
  • Run 'mcpac info' to see your configured servers
  • Run 'mcpac tools list -s <server>' to see exact tool names
  • Run 'mcpac tools list' to see all available tools
  • Tool names vary by server: filesystem uses snake_case, everything uses camelCase
  • Use MCPaC namespace for cleaner code (recommended)
  • Always verify permission IDs match exact MCP tool names
`);
  });
