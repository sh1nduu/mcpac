import { describe, expect, test } from 'bun:test';
import { parseArguments } from '../../src/tools/argument-parser.js';

describe('parseArguments - commanderArgs array', () => {
  test('should parse args array with --key value format', async () => {
    const result = await parseArguments({
      commanderOpts: {},
      commanderArgs: ['--path', 'test.txt', '--encoding', 'utf8'],
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({
      path: 'test.txt',
      encoding: 'utf8',
    });
  });

  test('should parse args array with --key=value format', async () => {
    const result = await parseArguments({
      commanderOpts: {},
      commanderArgs: ['--path=test.txt', '--encoding=utf8'],
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({
      path: 'test.txt',
      encoding: 'utf8',
    });
  });

  test('should parse mixed formats', async () => {
    const result = await parseArguments({
      commanderOpts: {},
      commanderArgs: ['--path=test.txt', '--enabled', '--count', '42'],
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({
      path: 'test.txt',
      enabled: true,
      count: '42', // String until type conversion
    });
  });

  test('should handle values with = in them', async () => {
    const result = await parseArguments({
      commanderOpts: {},
      commanderArgs: ['--query=SELECT * FROM users WHERE id=123'],
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({
      query: 'SELECT * FROM users WHERE id=123',
    });
  });

  test('should merge with commanderOpts', async () => {
    const result = await parseArguments({
      commanderOpts: { existingOpt: 'value' },
      commanderArgs: ['--path', 'test.txt'],
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({
      existingOpt: 'value',
      path: 'test.txt',
    });
  });

  test('should filter known options', async () => {
    const result = await parseArguments({
      commanderOpts: {
        json: '{}',
        quiet: true,
        verbose: false,
      },
      commanderArgs: ['--path', 'test.txt'],
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({
      path: 'test.txt',
    });
  });

  test('should convert types with schema hints', async () => {
    const schema = {
      properties: {
        count: { type: 'number' },
        enabled: { type: 'boolean' },
      },
    };

    const result = await parseArguments({
      commanderOpts: {},
      commanderArgs: ['--count', '42', '--enabled', 'true'],
      inputSchema: schema,
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({
      count: 42,
      enabled: true,
    });
  });

  test('should handle short flags', async () => {
    const result = await parseArguments({
      commanderOpts: {},
      commanderArgs: ['-p', 'test.txt', '-v'],
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({
      p: 'test.txt',
      v: true,
    });
  });

  test('should skip non-flag arguments', async () => {
    const result = await parseArguments({
      commanderOpts: {},
      commanderArgs: ['positional', '--path', 'test.txt', 'another'],
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({
      path: 'test.txt',
    });
  });

  test('should handle empty args array', async () => {
    const result = await parseArguments({
      commanderOpts: {},
      commanderArgs: [],
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({});
  });

  test('should handle undefined args array', async () => {
    const result = await parseArguments({
      commanderOpts: {},
    });

    expect(result.source).toBe('flags');
    expect(result.args).toEqual({});
  });

  test('should prioritize stdin over args', async () => {
    const originalStdin = Bun.stdin;
    // @ts-expect-error - mocking stdin
    Bun.stdin = {
      stream: () => ({
        async *[Symbol.asyncIterator]() {
          yield Buffer.from(JSON.stringify({ from: 'stdin' }));
        },
      }),
    };

    const result = await parseArguments({
      useStdin: true,
      commanderOpts: {},
      commanderArgs: ['--from', 'args'],
    });

    expect(result.source).toBe('stdin');
    expect(result.args).toEqual({ from: 'stdin' });

    // @ts-expect-error
    Bun.stdin = originalStdin;
  });

  test('should prioritize json over args', async () => {
    const result = await parseArguments({
      jsonString: '{"from":"json"}',
      commanderOpts: {},
      commanderArgs: ['--from', 'args'],
    });

    expect(result.source).toBe('json');
    expect(result.args).toEqual({ from: 'json' });
  });
});
