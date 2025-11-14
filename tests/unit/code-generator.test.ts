import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { CodeGenerator } from '../../src/generator/codegen.js';
import { MCPManager } from '../../src/mcp/manager.js';
import type { MCPTool } from '../../src/mcp/types.js';

const TEST_CONFIG_PATH = './tests/unit/test-codegen-config.json';
const TEST_SERVER_NAME = 'test-filesystem';

describe('CodeGenerator', () => {
  let manager: MCPManager;
  let generator: CodeGenerator;
  let tools: MCPTool[];

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

    // Initialize manager and get tools
    manager = MCPManager.getInstance(TEST_CONFIG_PATH);
    const client = await manager.getClient(TEST_SERVER_NAME);
    tools = await client.listTools();

    generator = new CodeGenerator();
  }, 30000); // 30 second timeout for CI environments (npx package installation)

  afterAll(async () => {
    // Cleanup
    const client = await manager.getClient(TEST_SERVER_NAME);
    await client.close();
    if (existsSync(TEST_CONFIG_PATH)) {
      await rm(TEST_CONFIG_PATH);
    }
  }, 10000); // 10 second timeout for cleanup

  test('should generate code for a tool', async () => {
    const readFileTool = tools.find((t) => t.name === 'read_file');
    expect(readFileTool).toBeDefined();

    if (!readFileTool) return;

    // Convert MCPTool to ToolDefinition format
    const toolDef = {
      serverName: TEST_SERVER_NAME,
      toolName: readFileTool.name,
      description: readFileTool.description,
      inputSchema: readFileTool.inputSchema,
    };

    const generatedCode = await generator.generateToolCode(toolDef);

    // Check structure
    expect(generatedCode.imports).toBeDefined();
    expect(generatedCode.typeDefinitions).toBeDefined();
    expect(generatedCode.functionCode).toBeDefined();

    // Check imports contain callMCPTool and MCPToolResult type from runtime
    expect(generatedCode.imports).toContain('callMCPTool');
    expect(generatedCode.imports).toContain('type MCPToolResult');
    expect(generatedCode.imports).toContain('../_mcpac_runtime.js');

    // Check type definitions contain input and output types
    expect(generatedCode.typeDefinitions).toContain('ReadFileInput');
    expect(generatedCode.typeDefinitions).toContain('ReadFileOutput');
    expect(generatedCode.typeDefinitions).toContain('extends MCPToolResult');

    // Check function code contains the function declaration
    expect(generatedCode.functionCode).toContain('export async function readFile');
    expect(generatedCode.functionCode).toContain('callMCPTool');
  });

  test('should handle JSON Schema to TypeScript conversion', async () => {
    const listDirTool = tools.find((t) => t.name === 'list_directory');
    expect(listDirTool).toBeDefined();

    if (!listDirTool) return;

    const toolDef = {
      serverName: TEST_SERVER_NAME,
      toolName: listDirTool.name,
      description: listDirTool.description,
      inputSchema: listDirTool.inputSchema,
    };

    const generatedCode = await generator.generateToolCode(toolDef);

    // Check that schema properties are converted to TypeScript
    expect(generatedCode.typeDefinitions).toContain('path');
  });

  test('should generate valid TypeScript syntax', async () => {
    const writeFileTool = tools.find((t) => t.name === 'write_file');
    expect(writeFileTool).toBeDefined();

    if (!writeFileTool) return;

    const toolDef = {
      serverName: TEST_SERVER_NAME,
      toolName: writeFileTool.name,
      description: writeFileTool.description,
      inputSchema: writeFileTool.inputSchema,
    };

    const generatedCode = await generator.generateToolCode(toolDef);

    // Check for basic TypeScript syntax elements
    expect(generatedCode.functionCode).toContain('async function');
    expect(generatedCode.functionCode).toContain(': Promise<');
    expect(generatedCode.functionCode).toContain('return');
  });

  test('should include proper type annotations', async () => {
    const readFileTool = tools.find((t) => t.name === 'read_file');
    expect(readFileTool).toBeDefined();

    if (!readFileTool) return;

    const toolDef = {
      serverName: TEST_SERVER_NAME,
      toolName: readFileTool.name,
      description: readFileTool.description,
      inputSchema: readFileTool.inputSchema,
    };

    const generatedCode = await generator.generateToolCode(toolDef);

    // Function should have typed parameters and return type
    expect(generatedCode.functionCode).toContain('input: ReadFileInput');
    expect(generatedCode.functionCode).toContain('Promise<ReadFileOutput>');
  });

  test('should generate runtime shim', () => {
    const runtime = generator.generateRuntimeShim([]);

    // Check runtime contains necessary components for IPC mode
    expect(runtime).toContain('export async function callMCPTool');
    expect(runtime).toContain('class MCPManager');
    expect(runtime).toContain('class IPCClient');
    expect(runtime).toContain('Auto-generated MCPaC runtime');

    // Check runtime contains MCP ContentBlock type definitions
    expect(runtime).toContain('export type MCPTextContent');
    expect(runtime).toContain('export type MCPImageContent');
    expect(runtime).toContain('export type MCPAudioContent');
    expect(runtime).toContain('export type MCPResourceLink');
    expect(runtime).toContain('export type MCPEmbeddedResource');
    expect(runtime).toContain('export type ContentBlock');
    expect(runtime).toContain('export interface MCPToolResult');
    expect(runtime).toContain('content: ContentBlock[]');
  });
});
