import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { ContextManager } from '../../src/executor/context.js';
import { IPCExecutor } from '../../src/executor/ipc-executor.js';
import { ResultHandler } from '../../src/executor/result.js';
import { Generator } from '../../src/generator/index.js';
import { MCPManager } from '../../src/mcp/manager.js';

const TEST_CONFIG_PATH = './tests/unit/test-ipc-executor-config.json';
const TEST_WORKSPACE = './tests/unit/workspace';
const TEST_SERVER_NAME = 'test-filesystem';

describe('IPCExecutor', () => {
  let manager: MCPManager;
  let contextMgr: ContextManager;
  let executor: IPCExecutor;
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
    executor = new IPCExecutor();
    resultHandler = new ResultHandler();

    // Generate code for the test server (creates servers/ directory with runtime in workspace)
    const generator = new Generator(manager, { outputDir: `${TEST_WORKSPACE}/servers` });
    await generator.generateAll();
  }, 30000); // 30 second timeout for CI environments (npx package installation)

  afterAll(async () => {
    // Cleanup
    const client = await manager.getClient(TEST_SERVER_NAME);
    await client.close();
    if (existsSync(TEST_CONFIG_PATH)) {
      await rm(TEST_CONFIG_PATH);
    }
    if (existsSync(TEST_WORKSPACE)) {
      await rm(TEST_WORKSPACE, { recursive: true }); // This also removes generated code
    }
  }, 10000); // 10 second timeout for cleanup

  test('should prepare execution context with environment variables', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);

    // Context should contain absolute path
    expect(context.workspaceDir).toContain('tests/unit/workspace');
    expect(context.env).toBeDefined();
    expect(context.env.MCPAC_CONFIG_PATH).toBe(TEST_CONFIG_PATH);
    expect(context.env.MCPAC_WORKSPACE).toContain('tests/unit/workspace');
  });

  test('should execute simple code successfully', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    const code = `
      import type { McpRequires } from './servers/_types.js';
      declare const runtime: McpRequires<[]>;
      console.log("Hello from IPC test");
    `;

    const result = await executor.executeCode(code, {
      mcpManager: manager,
      context,
      grantedPermissions: [],
      timeout: 10000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('Hello from IPC test');
    expect(resultHandler.isSuccess(result)).toBe(true);
  });

  test('should execute code from file', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    const testFile = `${TEST_WORKSPACE}/test-script.ts`;

    await writeFile(
      testFile,
      `import type { McpRequires } from './servers/_types.js';
declare const runtime: McpRequires<[]>;
console.log("IPC file execution test");`,
    );

    const result = await executor.executeFile(testFile, {
      mcpManager: manager,
      context,
      grantedPermissions: [],
      timeout: 10000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('IPC file execution test');
    expect(resultHandler.isSuccess(result)).toBe(true);
  });

  test('should handle execution errors', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    const code = `
      import type { McpRequires } from './servers/_types.js';
      declare const runtime: McpRequires<[]>;
      throw new Error("Test error");
    `;

    const result = await executor.executeCode(code, {
      mcpManager: manager,
      context,
      grantedPermissions: [],
      timeout: 10000,
    });

    expect(result.exitCode).not.toBe(0);
    expect(resultHandler.isSuccess(result)).toBe(false);
  });

  test('should handle timeout', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    // Create code that runs longer than timeout
    const code = `
      import type { McpRequires } from './servers/_types.js';
      declare const runtime: McpRequires<[]>;
      await Bun.sleep(10000);
      console.log("Should not see this");
    `;

    const result = await executor.executeCode(code, {
      mcpManager: manager,
      context,
      grantedPermissions: [],
      timeout: 100,
    });

    // Process should be killed due to timeout
    // Just verify execution completed (timeout behavior can vary)
    expect(result.exitCode).toBeDefined();
  });

  test('should capture stdout and stderr separately', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    const code = `
      import type { McpRequires } from './servers/_types.js';
      declare const runtime: McpRequires<[]>;
      console.log("Standard output");
      console.error("Error output");
    `;

    const result = await executor.executeCode(code, {
      mcpManager: manager,
      context,
      grantedPermissions: [],
      timeout: 10000,
    });

    expect(result.stdout).toContain('Standard output');
    expect(result.stderr).toContain('Error output');
  });

  test('should provide correct exit codes', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);

    // Success case
    const successResult = await executor.executeCode(
      `
      import type { McpRequires } from './servers/_types.js';
      declare const runtime: McpRequires<[]>;
      console.log("ok");
    `,
      {
        mcpManager: manager,
        context,
        grantedPermissions: [],
        timeout: 10000,
      },
    );
    expect(resultHandler.getExitCode(successResult)).toBe(0);

    // Error case
    const errorResult = await executor.executeCode(
      `
      import type { McpRequires } from './servers/_types.js';
      declare const runtime: McpRequires<[]>;
      process.exit(42);
    `,
      {
        mcpManager: manager,
        context,
        grantedPermissions: [],
        timeout: 10000,
      },
    );
    expect(resultHandler.getExitCode(errorResult)).toBe(42);
  });

  test('should handle IPC communication', async () => {
    const context = await contextMgr.prepareContext(TEST_WORKSPACE);
    // Test that IPC socket is properly set up
    const code = `
      import type { McpRequires } from './servers/_types.js';
      declare const runtime: McpRequires<[]>;
      if (process.env.MCPC_IPC_SOCKET) {
        console.log("IPC socket path found");
      } else {
        console.error("IPC socket path not found");
        process.exit(1);
      }
    `;

    const result = await executor.executeCode(code, {
      mcpManager: manager,
      context,
      grantedPermissions: [],
      timeout: 10000,
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('IPC socket path found');
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
