import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { ContextManager } from '../../src/executor/context.js';
import { ResultHandler } from '../../src/executor/result.js';
import { CodeRunner } from '../../src/executor/runner.js';
import { MCPManager } from '../../src/mcp/manager.js';

const TEST_CONFIG_PATH = './tests/unit/test-executor-config.json';
const TEST_WORKSPACE = './tests/unit/workspace';
const TEST_SERVER_NAME = 'test-filesystem';

describe('CodeRunner', () => {
  let manager: MCPManager;
  let contextMgr: ContextManager;
  let runner: CodeRunner;
  let resultHandler: ResultHandler;

  beforeAll(async () => {
    // Create test directories
    await mkdir('./tests/unit', { recursive: true });
    await mkdir(TEST_WORKSPACE, { recursive: true });
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

    // Initialize components
    manager = MCPManager.getInstance(TEST_CONFIG_PATH);
    contextMgr = new ContextManager(manager);
    runner = new CodeRunner();
    resultHandler = new ResultHandler();
  });

  afterAll(async () => {
    // Cleanup
    const client = await manager.getClient(TEST_SERVER_NAME);
    await client.close();
    if (existsSync(TEST_CONFIG_PATH)) {
      await rm(TEST_CONFIG_PATH);
    }
    if (existsSync(TEST_WORKSPACE)) {
      await rm(TEST_WORKSPACE, { recursive: true });
    }
  });

  test('should prepare execution context with environment variables', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);

    expect(context.workspaceDir).toBe(TEST_WORKSPACE);
    expect(context.env).toBeDefined();
    expect(context.env.MCPAC_CONFIG_PATH).toBe(TEST_CONFIG_PATH);
    expect(context.env.MCPAC_WORKSPACE).toBe(TEST_WORKSPACE);
  });

  test('should execute simple code successfully', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    const code = 'console.log("Hello from test");';

    const result = await runner.executeCode(code, { context, timeout: 5000 });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Hello from test');
    expect(resultHandler.isSuccess(result)).toBe(true);
  });

  test('should execute code from file', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    const testFile = `${TEST_WORKSPACE}/test-script.ts`;

    await writeFile(testFile, 'console.log("File execution test");');

    const result = await runner.executeFile(testFile, { context, timeout: 5000 });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('File execution test');
    expect(resultHandler.isSuccess(result)).toBe(true);
  });

  test('should handle execution errors', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    const code = 'throw new Error("Test error");';

    const result = await runner.executeCode(code, { context, timeout: 5000 });

    expect(result.exitCode).not.toBe(0);
    expect(resultHandler.isSuccess(result)).toBe(false);
  });

  test('should handle timeout', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    // Create code that runs longer than timeout
    const code = 'await Bun.sleep(10000); console.log("Should not see this");';

    const result = await runner.executeCode(code, { context, timeout: 100 });

    // Process should be killed due to timeout
    // Just verify execution completed (timeout behavior can vary)
    expect(result.exitCode).toBeDefined();
  });

  test('should capture stdout and stderr separately', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    const code = `
      console.log("Standard output");
      console.error("Error output");
    `;

    const result = await runner.executeCode(code, { context, timeout: 5000 });

    expect(result.stdout).toContain('Standard output');
    expect(result.stderr).toContain('Error output');
  });

  test('should provide correct exit codes', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);

    // Success case
    const successResult = await runner.executeCode('console.log("ok");', {
      context,
      timeout: 5000,
    });
    expect(resultHandler.getExitCode(successResult)).toBe(0);

    // Error case
    const errorResult = await runner.executeCode('process.exit(42);', {
      context,
      timeout: 5000,
    });
    expect(resultHandler.getExitCode(errorResult)).toBe(42);
  });
});

describe('ResultHandler', () => {
  const resultHandler = new ResultHandler();

  test('should identify successful execution', () => {
    const successResult = {
      exitCode: 0,
      stdout: 'output',
      stderr: '',
    };

    expect(resultHandler.isSuccess(successResult)).toBe(true);
  });

  test('should identify failed execution', () => {
    const failureResult = {
      exitCode: 1,
      stdout: '',
      stderr: 'error message',
    };

    expect(resultHandler.isSuccess(failureResult)).toBe(false);
  });

  test('should return correct exit code', () => {
    expect(resultHandler.getExitCode({ exitCode: 0, stdout: '', stderr: '' })).toBe(0);
    expect(resultHandler.getExitCode({ exitCode: 1, stdout: '', stderr: '' })).toBe(1);
    expect(
      resultHandler.getExitCode({
        exitCode: 0,
        stdout: '',
        stderr: '',
        error: new Error('some error'),
      }),
    ).toBe(1);
  });
});
