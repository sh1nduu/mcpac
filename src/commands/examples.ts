import { Command } from 'commander';

export const examplesCommand = new Command('examples')
  .description('Show code examples')
  .action(() => {
    console.log(`
📝 MCPaC Code Examples

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 1: List Files in Directory

import type { McpRequires } from './servers/_types.js';

// Declare required permissions
declare const runtime: McpRequires<['filesystem.listDirectory']>;

const result = await runtime.filesystem.listDirectory({ path: '.' });
const text = result.content.find(c => c.type === 'text')?.text;
console.log(text);

// Run with: mcpac execute -f script.ts --grant filesystem.listDirectory

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 2: Read File Content

import type { McpRequires } from './servers/_types.js';

// Declare required permissions
declare const runtime: McpRequires<['filesystem.readFile']>;

const result = await runtime.filesystem.readFile({ path: './data.txt' });
const text = result.content.find(c => c.type === 'text')?.text;

if (text) {
  console.log('File content:', text);
} else {
  console.error('No text content found');
}

// Run with: mcpac execute -f script.ts --grant filesystem.readFile

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 3: Write to File

import type { McpRequires } from './servers/_types.js';

// Declare required permissions
declare const runtime: McpRequires<['filesystem.writeFile']>;

const result = await runtime.filesystem.writeFile({
  path: './output.txt',
  content: 'Hello from MCPaC!'
});

console.log('File written:', result.isError ? 'Failed' : 'Success');

// Run with: mcpac execute -f script.ts --grant filesystem.writeFile

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 4: Multiple Operations

import type { McpRequires } from './servers/_types.js';

// Declare required permissions (multiple)
declare const runtime: McpRequires<[
  'filesystem.createDirectory',
  'filesystem.writeFile',
  'filesystem.listDirectory'
]>;

// Create directory
await runtime.filesystem.createDirectory({ path: './output' });

// Write file
await runtime.filesystem.writeFile({
  path: './output/result.txt',
  content: 'Processing complete'
});

// List directory contents
const list = await runtime.filesystem.listDirectory({ path: './output' });
console.log(list.content.find(c => c.type === 'text')?.text);

// Run with: mcpac execute -f script.ts --grant filesystem.createDirectory,filesystem.writeFile,filesystem.listDirectory

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 5: Working with MCP Response Structure

import type { McpRequires } from './servers/_types.js';

// Declare required permissions
declare const runtime: McpRequires<['filesystem.readFile']>;

const result = await runtime.filesystem.readFile({ path: './data.json' });

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

// Run with: mcpac execute -f script.ts --grant filesystem.readFile

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 6: Error Handling

import type { McpRequires } from './servers/_types.js';

// Declare required permissions
declare const runtime: McpRequires<['filesystem.readFile']>;

try {
  const result = await runtime.filesystem.readFile({ path: './nonexistent.txt' });

  if (result.isError) {
    console.error('Tool returned error:', result.content);
  } else {
    const text = result.content.find(c => c.type === 'text')?.text;
    console.log('Success:', text);
  }
} catch (error) {
  console.error('Exception occurred:', error.message);
}

// Run with: mcpac execute -f script.ts --grant filesystem.readFile

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Running Examples

Execute inline code:
  $ mcpac execute -c "<paste example code>"

Execute from file:
  $ echo "<paste example code>" > script.ts
  $ mcpac execute -f script.ts

Execute from stdin:
  $ cat script.ts | mcpac execute --stdin

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 Tip: All examples assume you have the 'filesystem' server configured
    Run 'mcpac info' to see your configured servers
    Run 'mcpac tools list' to see available tools and their functions
`);
  });
