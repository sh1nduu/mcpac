import { Command } from 'commander';

export const examplesCommand = new Command('examples')
  .description('Show code examples')
  .action(() => {
    console.log(`
📝 MCPaC Code Examples

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 1: List Files in Directory

import { filesystem } from './servers/index.js';

const result = await filesystem.listDirectory({ path: '.' });
const text = result.content.find(c => c.type === 'text')?.text;
console.log(text);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 2: Read File Content

import { filesystem } from './servers/index.js';

const result = await filesystem.readFile({ path: './data.txt' });
const text = result.content.find(c => c.type === 'text')?.text;

if (text) {
  console.log('File content:', text);
} else {
  console.error('No text content found');
}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 3: Write to File

import { filesystem } from './servers/index.js';

const result = await filesystem.writeFile({
  path: './output.txt',
  content: 'Hello from MCPaC!'
});

console.log('File written:', result.isError ? 'Failed' : 'Success');

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 4: Multiple Operations

import { filesystem } from './servers/index.js';

// Create directory
await filesystem.createDirectory({ path: './output' });

// Write file
await filesystem.writeFile({
  path: './output/result.txt',
  content: 'Processing complete'
});

// List directory contents
const list = await filesystem.listDirectory({ path: './output' });
console.log(list.content.find(c => c.type === 'text')?.text);

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 5: Working with MCP Response Structure

import { filesystem } from './servers/index.js';

const result = await filesystem.readFile({ path: './data.json' });

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

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

## Example 6: Error Handling

import { filesystem } from './servers/index.js';

try {
  const result = await filesystem.readFile({ path: './nonexistent.txt' });

  if (result.isError) {
    console.error('Tool returned error:', result.content);
  } else {
    const text = result.content.find(c => c.type === 'text')?.text;
    console.log('Success:', text);
  }
} catch (error) {
  console.error('Exception occurred:', error.message);
}

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
