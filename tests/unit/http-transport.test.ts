import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import type { MCPClient } from '../../src/mcp/client.js';
import { normalizeMCPServerConfig } from '../../src/mcp/client.js';
import { MCPManager } from '../../src/mcp/manager.js';

const TEST_CONFIG_PATH = './tests/unit/test-http-config.json';

describe('HTTP Transport', () => {
  beforeAll(async () => {
    // Create test config directory
    await mkdir('./tests/unit', { recursive: true });
  });

  afterAll(async () => {
    // Cleanup
    if (existsSync(TEST_CONFIG_PATH)) {
      await rm(TEST_CONFIG_PATH);
    }
  });

  test('normalizeMCPServerConfig should detect HTTP config', () => {
    const httpConfig = {
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer token' },
    };

    const normalized = normalizeMCPServerConfig(httpConfig);

    expect(normalized.type).toBe('http');
    expect(normalized).toHaveProperty('url', 'https://example.com/mcp');
    if (normalized.type === 'http') {
      expect(normalized.headers).toEqual({ Authorization: 'Bearer token' });
    }
  });

  test('normalizeMCPServerConfig should detect STDIO config', () => {
    const stdioConfig = {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem'],
    };

    const normalized = normalizeMCPServerConfig(stdioConfig);

    expect(normalized.type).toBe('stdio');
    if (normalized.type === 'stdio') {
      expect(normalized.command).toBe('npx');
      expect(normalized.args).toEqual(['@modelcontextprotocol/server-filesystem']);
    }
  });

  test('normalizeMCPServerConfig should preserve type field if present', () => {
    const httpConfig = {
      type: 'http' as const,
      url: 'https://example.com/mcp',
    };

    const normalized = normalizeMCPServerConfig(httpConfig);

    expect(normalized.type).toBe('http');
  });

  test('normalizeMCPServerConfig should throw for invalid config', () => {
    const invalidConfig = {
      foo: 'bar',
    };

    expect(() => normalizeMCPServerConfig(invalidConfig)).toThrow(
      'Invalid MCP server config: must have either "command" (stdio) or "url" (http)',
    );
  });

  test('MCPManager should accept HTTP config', async () => {
    // Reset singleton for testing
    // @ts-expect-error - Accessing private static field for testing
    MCPManager.instance = null;

    const manager = MCPManager.getInstance(TEST_CONFIG_PATH);

    await manager.addServer('test-http-server', {
      type: 'http',
      url: 'https://example.com/mcp',
      headers: { Authorization: 'Bearer test-token' },
    });

    const config = await manager.getServerConfig('test-http-server');
    expect(config.type).toBe('http');
    if (config.type === 'http') {
      expect(config.url).toBe('https://example.com/mcp');
      expect(config.headers?.Authorization).toBe('Bearer test-token');
    }
  });

  test('MCPManager should support mixed STDIO and HTTP configs', async () => {
    // Reset singleton for testing
    // @ts-expect-error - Accessing private static field for testing
    MCPManager.instance = null;

    const manager = MCPManager.getInstance(TEST_CONFIG_PATH);

    // Add STDIO server
    await manager.addServer('stdio-server', {
      type: 'stdio',
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem'],
    });

    // Add HTTP server
    await manager.addServer('http-server', {
      type: 'http',
      url: 'https://example.com/mcp',
    });

    const servers = await manager.listServers();
    expect(servers).toContain('stdio-server');
    expect(servers).toContain('http-server');

    const stdioConfig = await manager.getServerConfig('stdio-server');
    const httpConfig = await manager.getServerConfig('http-server');

    expect(stdioConfig.type).toBe('stdio');
    expect(httpConfig.type).toBe('http');
  });

  // Note: Testing actual HTTP connection requires a real HTTP MCP server
  // which is difficult to set up in unit tests. For E2E testing with real
  // HTTP servers, use the examples from the issue:
  // https://github.com/sh1nduu/mcpac/issues/3
  test.skip('should connect to real HTTP MCP server', async () => {
    // This test is skipped because it requires a real HTTP MCP server
    // To test manually:
    // 1. Set up an HTTP MCP server (e.g., GitHub Copilot MCP)
    // 2. Configure with proper URL and authentication
    // 3. Run this test

    const TEST_HTTP_CONFIG_PATH = './tests/unit/test-real-http-config.json';
    const TEST_HTTP_SERVER = 'github-server';

    const config = {
      mcpServers: {
        [TEST_HTTP_SERVER]: {
          type: 'http',
          url: 'https://api.githubcopilot.com/mcp',
          headers: {
            Authorization: 'Bearer YOUR_TOKEN_HERE',
          },
        },
      },
    };

    await writeFile(TEST_HTTP_CONFIG_PATH, JSON.stringify(config, null, 2));

    // @ts-expect-error - Accessing private static field for testing
    MCPManager.instance = null;

    const manager = MCPManager.getInstance(TEST_HTTP_CONFIG_PATH);
    const client: MCPClient = await manager.getClient(TEST_HTTP_SERVER);

    expect(client.isConnected()).toBe(true);

    const tools = await client.listTools();
    expect(tools.length).toBeGreaterThan(0);

    await client.close();
    await rm(TEST_HTTP_CONFIG_PATH);
  });
});
