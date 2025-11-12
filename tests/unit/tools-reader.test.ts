import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { ToolsReader } from '../../src/tools/reader.js';

const TEST_OUTPUT_DIR = './tests/unit/test-generated-code';

describe('ToolsReader', () => {
  beforeAll(async () => {
    // Create test directory structure
    await mkdir(`${TEST_OUTPUT_DIR}/demo-filesystem`, { recursive: true });

    // Create root index.ts
    await writeFile(
      `${TEST_OUTPUT_DIR}/index.ts`,
      `// Auto-generated - do not edit

import * as demoFilesystem from './demo-filesystem/index.js';

export { demoFilesystem };
`,
    );

    // Create server index.ts
    await writeFile(
      `${TEST_OUTPUT_DIR}/demo-filesystem/index.ts`,
      `// Auto-generated - do not edit

export * from './read_file.js';
export * from './write_file.js';
`,
    );

    // Create tool file: read_file.ts
    await writeFile(
      `${TEST_OUTPUT_DIR}/demo-filesystem/read_file.ts`,
      `// Auto-generated - do not edit

import { callMCPTool, type MCPToolResult } from '../_mcpc_runtime.js';

export interface ReadFileInput {
  path: string;
  tail?: number;
  head?: number;
}

export interface ReadFileOutput extends MCPToolResult {}

/**
 * Read the complete contents of a file as text.
 */
export async function readFile(
  input: ReadFileInput
): Promise<ReadFileOutput> {
  return callMCPTool<ReadFileOutput>('demo-filesystem', 'read_file', input);
}
`,
    );

    // Create tool file: write_file.ts
    await writeFile(
      `${TEST_OUTPUT_DIR}/demo-filesystem/write_file.ts`,
      `// Auto-generated - do not edit

import { callMCPTool, type MCPToolResult } from '../_mcpc_runtime.js';

export interface WriteFileInput {
  path: string;
  content: string;
}

export interface WriteFileOutput extends MCPToolResult {}

/**
 * Write content to a file.
 */
export async function writeFile(
  input: WriteFileInput
): Promise<WriteFileOutput> {
  return callMCPTool<WriteFileOutput>('demo-filesystem', 'write_file', input);
}
`,
    );
  });

  afterAll(async () => {
    // Cleanup
    if (existsSync(TEST_OUTPUT_DIR)) {
      await rm(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  test('exists() should return true for existing directory', () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);
    expect(reader.exists()).toBe(true);
  });

  test('exists() should return false for non-existing directory', () => {
    const reader = new ToolsReader('./nonexistent-dir');
    expect(reader.exists()).toBe(false);
  });

  test('discoverServers() should return all server names', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);
    const servers = await reader.discoverServers();

    expect(servers).toEqual(['demo-filesystem']);
  });

  test('discoverServers() should return empty array if index.ts does not exist', async () => {
    const reader = new ToolsReader('./nonexistent-dir');
    const servers = await reader.discoverServers();

    expect(servers).toEqual([]);
  });

  test('listTools() should return all tool names for a server', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);
    const tools = await reader.listTools('demo-filesystem');

    expect(tools).toEqual(['read_file', 'write_file']);
  });

  test('listTools() should throw error for non-existing server', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);

    expect(async () => {
      await reader.listTools('nonexistent-server');
    }).toThrow();
  });

  test('getToolInfo() should return detailed tool information', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);
    const info = await reader.getToolInfo('demo-filesystem', 'read_file');

    expect(info.serverName).toBe('demo-filesystem');
    expect(info.toolName).toBe('read_file');
    expect(info.functionName).toBe('readFile');
    expect(info.description).toBe('Read the complete contents of a file as text.');
    expect(info.inputType).toBe('ReadFileInput');
    expect(info.outputType).toBe('ReadFileOutput');
    expect(info.filePath).toContain('read_file.ts');
    expect(info.fullContent).toContain('export async function readFile');
  });

  test('getToolInfo() should throw error for non-existing tool', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);

    expect(async () => {
      await reader.getToolInfo('demo-filesystem', 'nonexistent_tool');
    }).toThrow();
  });

  test('searchTool() should find tool by function name', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);
    const location = await reader.searchTool('readFile');

    expect(location).not.toBeNull();
    expect(location?.serverName).toBe('demo-filesystem');
    expect(location?.toolName).toBe('read_file');
  });

  test('searchTool() should return null for non-existing function', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);
    const location = await reader.searchTool('nonexistentFunction');

    expect(location).toBeNull();
  });

  test('searchTool() should respect server filter', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);
    const location = await reader.searchTool('writeFile', 'demo-filesystem');

    expect(location).not.toBeNull();
    expect(location?.serverName).toBe('demo-filesystem');
    expect(location?.toolName).toBe('write_file');
  });

  test('getAllTools() should return all tools grouped by server', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);
    const toolsMap = await reader.getAllTools();

    expect(toolsMap.size).toBe(1);
    expect(toolsMap.get('demo-filesystem')).toEqual(['read_file', 'write_file']);
  });

  test('getAllTools() should filter by server name', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);
    const toolsMap = await reader.getAllTools('demo-filesystem');

    expect(toolsMap.size).toBe(1);
    expect(toolsMap.get('demo-filesystem')).toEqual(['read_file', 'write_file']);
  });

  test('getFunctionNames() should return camelCase function names', async () => {
    const reader = new ToolsReader(TEST_OUTPUT_DIR);
    const functionNames = await reader.getFunctionNames('demo-filesystem');

    expect(functionNames).toEqual(['readFile', 'writeFile']);
  });
});
