import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';

const TEST_CONFIG_PATH = './tests/e2e/test-config.json';
const TEST_OUTPUT_DIR = './tests/e2e/servers';
const TEST_WORKSPACE = './tests/e2e/workspace';
const SERVER_NAME = 'test-fs';

describe('E2E: CLI Workflow', () => {
  beforeAll(async () => {
    // Create test directories
    await mkdir('./tests/e2e', { recursive: true });
    await mkdir(TEST_WORKSPACE, { recursive: true });
    await mkdir('./tests/fixtures', { recursive: true });

    // Create test file
    await writeFile('./tests/fixtures/test.txt', 'Hello from E2E test!');

    // Clean up any existing test artifacts
    if (existsSync(TEST_CONFIG_PATH)) {
      await rm(TEST_CONFIG_PATH);
    }
    if (existsSync(TEST_OUTPUT_DIR)) {
      await rm(TEST_OUTPUT_DIR, { recursive: true });
    }
  });

  afterAll(async () => {
    // Cleanup
    if (existsSync(TEST_CONFIG_PATH)) {
      await rm(TEST_CONFIG_PATH);
    }
    if (existsSync(TEST_OUTPUT_DIR)) {
      await rm(TEST_OUTPUT_DIR, { recursive: true });
    }
    if (existsSync(TEST_WORKSPACE)) {
      await rm(TEST_WORKSPACE, { recursive: true });
    }
  });

  test('should add an MCP server', async () => {
    const proc = Bun.spawn({
      cmd: [
        'bun',
        'run',
        'src/cli.ts',
        'server',
        'add',
        SERVER_NAME,
        '--command',
        'npx',
        '--args',
        '-y',
        '@modelcontextprotocol/server-filesystem',
        './tests/fixtures',
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('added successfully');
    expect(existsSync(TEST_CONFIG_PATH)).toBe(true);
  });

  test('should list MCP servers', async () => {
    const proc = Bun.spawn({
      cmd: ['bun', 'run', 'src/cli.ts', 'server', 'list'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain(SERVER_NAME);
  });

  test.skip('should test MCP server connection', async () => {
    // Skipping because MCP server connection can be slow/flaky in CI
    const proc = Bun.spawn({
      cmd: ['bun', 'run', 'src/cli.ts', 'server', 'test', SERVER_NAME],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('successfully');
  }, 15000); // Increase timeout for MCP server connection

  test.skip('should generate code from MCP server', async () => {
    // Skipping because it depends on MCP server connection
    const proc = Bun.spawn({
      cmd: ['bun', 'run', 'src/cli.ts', 'generate', '-o', TEST_OUTPUT_DIR],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('complete');
    expect(existsSync(`${TEST_OUTPUT_DIR}/${SERVER_NAME}/index.ts`)).toBe(true);
  }, 15000); // Increase timeout for code generation

  test.skip('should execute code using generated functions', async () => {
    // Skipping because it depends on generated code from previous test
    // Create a test script that uses the generated code
    const testScript = `
import { readFile } from '../${TEST_OUTPUT_DIR}/${SERVER_NAME}/index.js';

const content = await readFile({ path: './tests/fixtures/test.txt' });
console.log('SUCCESS:', content);
`;

    const scriptPath = `${TEST_WORKSPACE}/test-read.ts`;
    await writeFile(scriptPath, testScript);

    const proc = Bun.spawn({
      cmd: ['bun', 'run', 'src/cli.ts', 'execute', '-f', scriptPath],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('SUCCESS');
    expect(stdout).toContain('Hello from E2E test');
  }, 15000); // Increase timeout for execution

  test('should execute code from stdin', async () => {
    const code = `console.log("Inline execution works!");`;

    const proc = Bun.spawn({
      cmd: ['bun', 'run', 'src/cli.ts', 'execute', '--stdin'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
      },
      stdin: 'pipe',
      stdout: 'pipe',
      stderr: 'pipe',
    });

    proc.stdin.write(code);
    proc.stdin.end();

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('Execution completed successfully');
  }, 30000); // Increase timeout for stdin execution

  test('should remove MCP server', async () => {
    const proc = Bun.spawn({
      cmd: ['bun', 'run', 'src/cli.ts', 'server', 'remove', SERVER_NAME],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('removed');
  });
});
