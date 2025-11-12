import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import type { MCPClient } from '../../src/mcp/client.js';
import { MCPManager } from '../../src/mcp/manager.js';

const TEST_CONFIG_PATH = './tests/unit/test-mcp-config.json';
const TEST_SERVER_NAME = 'test-filesystem';

describe('MCPClient', () => {
  let manager: MCPManager;
  let client: MCPClient;

  beforeAll(async () => {
    // Create test config directory
    await mkdir('./tests/unit', { recursive: true });
    await mkdir('./tests/fixtures', { recursive: true });

    // Create test MCP server configuration (nested in mcpServers)
    const config = {
      mcpServers: {
        [TEST_SERVER_NAME]: {
          command: 'npx',
          args: ['-y', '@modelcontextprotocol/server-filesystem', './tests/fixtures'],
        },
      },
    };

    await writeFile(TEST_CONFIG_PATH, JSON.stringify(config, null, 2));

    // Reset singleton for testing
    // @ts-expect-error - Accessing private static field for testing
    MCPManager.instance = null;

    // Initialize manager and client
    manager = MCPManager.getInstance(TEST_CONFIG_PATH);
    client = await manager.getClient(TEST_SERVER_NAME);
  }, 30000); // 30 second timeout for CI environments (npx package installation)

  afterAll(async () => {
    // Cleanup
    if (client) {
      await client.close();
    }
    if (existsSync(TEST_CONFIG_PATH)) {
      await rm(TEST_CONFIG_PATH);
    }
  }, 10000); // 10 second timeout for cleanup

  test('should connect to MCP server', () => {
    expect(client.isConnected()).toBe(true);
  });

  test('should list available tools', async () => {
    const tools = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);

    // Filesystem server should have these tools
    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('write_file');
    expect(toolNames).toContain('list_directory');
  });

  test('should get tool details with schema', async () => {
    const tools = await client.listTools();
    const readFileTool = tools.find((t) => t.name === 'read_file');

    expect(readFileTool).toBeDefined();
    expect(readFileTool?.inputSchema).toBeDefined();
    expect((readFileTool?.inputSchema as { type?: string })?.type).toBe('object');
  });

  test('should call tool successfully', async () => {
    // Ensure test file exists
    await mkdir('./tests/fixtures', { recursive: true });
    await writeFile('./tests/fixtures/test.txt', 'Hello, MCP!');

    const result = await client.callTool('read_file', {
      path: './tests/fixtures/test.txt',
    });

    expect(result.isError).toBe(false);
    // Content is an array of content objects
    expect(JSON.stringify(result.content)).toContain('Hello, MCP!');
  });

  test('should handle tool errors gracefully', async () => {
    const result = await client.callTool('read_file', {
      path: './nonexistent-file.txt',
    });

    expect(result.isError).toBe(true);
  });

  test('should close cleanly', async () => {
    await client.close();
    expect(client.isConnected()).toBe(false);
  });
});
