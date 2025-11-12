import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExecutionContext } from '../../src/executor/context.js';
import { TypeChecker } from '../../src/executor/type-checker.js';

describe('TypeChecker', () => {
  // Use './servers' as serversDir to match real usage
  const serversDir = './servers';
  let checker: TypeChecker;
  let context: ExecutionContext;

  beforeEach(() => {
    // Clean up and create test servers directory in project root
    rmSync(serversDir, { recursive: true, force: true });
    mkdirSync(serversDir, { recursive: true });

    // Create mock server files
    writeFileSync(join(serversDir, 'index.ts'), `export * from './filesystem/index.js';`);

    mkdirSync(join(serversDir, 'filesystem'), { recursive: true });
    writeFileSync(
      join(serversDir, 'filesystem', 'index.ts'),
      `
export interface ListDirectoryInput {
  path: string;
}

export interface ListDirectoryOutput {
  content: Array<{ type: 'text'; text: string }>;
  isError: boolean;
}

export async function listDirectory(input: ListDirectoryInput): Promise<ListDirectoryOutput> {
  return { content: [{ type: 'text', text: 'mock' }], isError: false };
}
`,
    );

    checker = new TypeChecker();
    context = {
      workspaceDir: './workspace',
      serversDir,
      configPath: './config/mcp-servers.json',
      env: {},
    };
  });

  afterEach(() => {
    rmSync(serversDir, { recursive: true, force: true });
  });

  test('valid code passes type check', async () => {
    const code = `
import { listDirectory } from './servers/index.js';

const result = await listDirectory({ path: '.' });
console.log(result.content[0].text);
`;

    const result = await checker.checkCode(code, context);
    if (result.hasErrors) {
      console.log('Errors:', JSON.stringify(result.errors, null, 2));
    }
    expect(result.hasErrors).toBe(false);
    expect(result.errors).toHaveLength(0);
  });

  test('type error is detected - wrong argument type', async () => {
    const code = `
import { listDirectory } from './servers/index.js';

const result = await listDirectory({ path: 123 });
`;

    const result = await checker.checkCode(code, context);
    expect(result.hasErrors).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain('number');
  });

  test('type error is detected - missing property', async () => {
    const code = `
import { listDirectory } from './servers/index.js';

const result = await listDirectory({});
`;

    const result = await checker.checkCode(code, context);
    expect(result.hasErrors).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]?.message).toContain('path');
  });

  test('type error is detected - incorrect return type access', async () => {
    const code = `
import { listDirectory } from './servers/index.js';

const result = await listDirectory({ path: '.' });
const text: number = result.content[0].text;
`;

    const result = await checker.checkCode(code, context);
    expect(result.hasErrors).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('multiple type errors are detected', async () => {
    const code = `
import { listDirectory } from './servers/index.js';

const result = await listDirectory({ path: 123 });
const text: number = result.content[0].text;
`;

    const result = await checker.checkCode(code, context);
    expect(result.hasErrors).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  test('checkFile works with file path', async () => {
    const testFile = './test-script.ts';
    const code = `
import { listDirectory } from './servers/index.js';

const result = await listDirectory({ path: '.' });
console.log(result.content[0].text);
`;
    writeFileSync(testFile, code);

    try {
      const result = await checker.checkFile(testFile, context);
      expect(result.hasErrors).toBe(false);
      expect(result.errors).toHaveLength(0);
    } finally {
      rmSync(testFile, { force: true });
    }
  });

  test('checkFile detects type errors in file', async () => {
    const testFile = './test-script.ts';
    const code = `
import { listDirectory } from './servers/index.js';

const result = await listDirectory({ path: 123 });
`;
    writeFileSync(testFile, code);

    try {
      const result = await checker.checkFile(testFile, context);
      expect(result.hasErrors).toBe(true);
      expect(result.errors.length).toBeGreaterThan(0);
    } finally {
      rmSync(testFile, { force: true });
    }
  });

  test('formatErrors produces readable output', async () => {
    const code = `
import { listDirectory } from './servers/index.js';

const result = await listDirectory({ path: 123 });
`;

    const result = await checker.checkCode(code, context);
    if (result.hasErrors) {
      const formatted = checker.formatErrors(result.errors);

      expect(formatted).toContain('error TS');
      expect(formatted).toContain('.mcpac-typecheck-');
    }
  });

  test('import errors are detected', async () => {
    const code = `
import { nonExistentFunction } from './servers/index.js';

await nonExistentFunction();
`;

    const result = await checker.checkCode(code, context);
    expect(result.hasErrors).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
