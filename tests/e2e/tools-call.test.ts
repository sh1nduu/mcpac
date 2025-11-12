import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';

const TEST_CONFIG_PATH = './tests/e2e/test-tools-call-config.json';
const TEST_OUTPUT_DIR = './tests/e2e/servers-call';
const TEST_WORKSPACE = './tests/e2e/workspace-call';
const TEST_FIXTURES = './tests/e2e/fixtures-call';
const SERVER_NAME = 'test-fs-call';

describe.skip('E2E: tools call command', () => {
  // Skipped because it requires real MCP server connection which can be slow/flaky
  beforeAll(async () => {
    // Create test directories
    await mkdir('./tests/e2e', { recursive: true });
    await mkdir(TEST_WORKSPACE, { recursive: true });
    await mkdir(TEST_FIXTURES, { recursive: true });

    // Create test files
    await writeFile(`${TEST_FIXTURES}/test.txt`, 'Hello from tools call test!');
    await writeFile(`${TEST_FIXTURES}/data.json`, '{"key":"value","number":42}');

    // Clean up any existing test artifacts
    if (existsSync(TEST_CONFIG_PATH)) {
      await rm(TEST_CONFIG_PATH);
    }
    if (existsSync(TEST_OUTPUT_DIR)) {
      await rm(TEST_OUTPUT_DIR, { recursive: true });
    }

    // Add test MCP server
    const addProc = Bun.spawn({
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
        TEST_FIXTURES,
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    await addProc.exited;

    // Generate code
    const genProc = Bun.spawn({
      cmd: ['bun', 'run', 'src/cli.ts', 'generate', '-s', SERVER_NAME, '-o', TEST_OUTPUT_DIR],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [_genStdout, genStderr] = await Promise.all([
      genProc.stdout.text(),
      genProc.stderr.text(),
      genProc.exited,
    ]);

    if (genProc.exitCode !== 0) {
      console.error('Generate failed:', genStderr);
      throw new Error(`Code generation failed: ${genStderr}`);
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
    if (existsSync(TEST_FIXTURES)) {
      await rm(TEST_FIXTURES, { recursive: true });
    }
  });

  test('should call tool with named flags', async () => {
    const proc = Bun.spawn({
      cmd: [
        'bun',
        'run',
        'src/cli.ts',
        'tools',
        'call',
        'readFile',
        '--path',
        `${TEST_FIXTURES}/test.txt`,
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
        MCPAC_SERVERS_PATH: TEST_OUTPUT_DIR,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout, _stderr] = await Promise.all([
      proc.stdout.text(),
      proc.stderr.text(),
      proc.exited,
    ]);

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('Hello from tools call test!');
  });

  test('should call tool with JSON string', async () => {
    const proc = Bun.spawn({
      cmd: [
        'bun',
        'run',
        'src/cli.ts',
        'tools',
        'call',
        'readFile',
        '--json',
        JSON.stringify({ path: `${TEST_FIXTURES}/data.json` }),
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
        MCPAC_SERVERS_PATH: TEST_OUTPUT_DIR,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('key');
    expect(stdout).toContain('value');
  });

  test('should output JSON format', async () => {
    const proc = Bun.spawn({
      cmd: [
        'bun',
        'run',
        'src/cli.ts',
        'tools',
        'call',
        'readFile',
        '--path',
        `${TEST_FIXTURES}/test.txt`,
        '--output-format',
        'json',
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
        MCPAC_SERVERS_PATH: TEST_OUTPUT_DIR,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.success).toBe(true);
    expect(parsed.server).toBe(SERVER_NAME);
    expect(parsed.tool).toBe('read_file');
    expect(parsed.content).toBeDefined();
  });

  test('should output raw format', async () => {
    const proc = Bun.spawn({
      cmd: [
        'bun',
        'run',
        'src/cli.ts',
        'tools',
        'call',
        'readFile',
        '--path',
        `${TEST_FIXTURES}/test.txt`,
        '--output-format',
        'raw',
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
        MCPAC_SERVERS_PATH: TEST_OUTPUT_DIR,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.content).toBeDefined();
    expect(parsed.isError).toBe(false);
  });

  test('should fail with missing required argument', async () => {
    const proc = Bun.spawn({
      cmd: [
        'bun',
        'run',
        'src/cli.ts',
        'tools',
        'call',
        'readFile',
        // Missing --path argument
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
        MCPAC_SERVERS_PATH: TEST_OUTPUT_DIR,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [_stdout, stderr] = await Promise.all([
      proc.stdout.text(),
      proc.stderr.text(),
      proc.exited,
    ]);

    expect(proc.exitCode).toBe(1);
    expect(stderr).toContain('Invalid arguments');
    expect(stderr).toContain('path');
  });

  test('should fail with non-existent function', async () => {
    const proc = Bun.spawn({
      cmd: ['bun', 'run', 'src/cli.ts', 'tools', 'call', 'nonExistentFunction', '--arg', 'value'],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
        MCPAC_SERVERS_PATH: TEST_OUTPUT_DIR,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [_stdout2, stderr] = await Promise.all([
      proc.stdout.text(),
      proc.stderr.text(),
      proc.exited,
    ]);

    expect(proc.exitCode).toBe(1);
    expect(stderr).toContain('not found');
  });

  test('should work with --quiet flag', async () => {
    const proc = Bun.spawn({
      cmd: [
        'bun',
        'run',
        'src/cli.ts',
        'tools',
        'call',
        'readFile',
        '--path',
        `${TEST_FIXTURES}/test.txt`,
        '--quiet',
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
        MCPAC_SERVERS_PATH: TEST_OUTPUT_DIR,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    // In quiet mode, still outputs result
    expect(stdout).toContain('Hello from tools call test!');
  });

  test('should skip validation with --no-validate', async () => {
    const proc = Bun.spawn({
      cmd: [
        'bun',
        'run',
        'src/cli.ts',
        'tools',
        'call',
        'readFile',
        '--path',
        `${TEST_FIXTURES}/test.txt`,
        '--no-validate',
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
        MCPAC_SERVERS_PATH: TEST_OUTPUT_DIR,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout] = await Promise.all([proc.stdout.text(), proc.stderr.text(), proc.exited]);

    expect(proc.exitCode).toBe(0);
    expect(stdout).toContain('Hello from tools call test!');
  });

  test('should handle tool errors gracefully', async () => {
    const proc = Bun.spawn({
      cmd: [
        'bun',
        'run',
        'src/cli.ts',
        'tools',
        'call',
        'readFile',
        '--path',
        `${TEST_FIXTURES}/nonexistent.txt`,
      ],
      cwd: process.cwd(),
      env: {
        ...process.env,
        MCPAC_CONFIG_PATH: TEST_CONFIG_PATH,
        MCPAC_SERVERS_PATH: TEST_OUTPUT_DIR,
      },
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [_stdout3, stderr2] = await Promise.all([
      proc.stdout.text(),
      proc.stderr.text(),
      proc.exited,
    ]);

    expect(proc.exitCode).toBe(2);
    expect(stderr2).toContain('Error');
  });
});
