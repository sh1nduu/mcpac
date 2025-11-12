import { describe, expect, test } from 'bun:test';
import { parseArguments } from '../../src/tools/argument-parser.js';

describe('parseArguments', () => {
  describe('stdin input', () => {
    test('should parse valid JSON from stdin', async () => {
      const mockStdin = async () => JSON.stringify({ path: './test.txt', encoding: 'utf8' });

      // Mock Bun.stdin
      const originalStdin = Bun.stdin;
      // @ts-expect-error - mocking stdin
      Bun.stdin = {
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield Buffer.from(await mockStdin());
          },
        }),
      };

      const result = await parseArguments({
        useStdin: true,
        commanderOpts: {},
      });

      expect(result.source).toBe('stdin');
      expect(result.args).toEqual({ path: './test.txt', encoding: 'utf8' });

      // Restore stdin
      // @ts-expect-error
      Bun.stdin = originalStdin;
    });

    test('should reject non-object JSON from stdin', async () => {
      const originalStdin = Bun.stdin;
      // @ts-expect-error
      Bun.stdin = {
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield Buffer.from(JSON.stringify(['array', 'not', 'object']));
          },
        }),
      };

      await expect(
        parseArguments({
          useStdin: true,
          commanderOpts: {},
        }),
      ).rejects.toThrow('stdin must contain a JSON object');

      // @ts-expect-error
      Bun.stdin = originalStdin;
    });
  });

  describe('JSON string input', () => {
    test('should parse valid JSON string', async () => {
      const result = await parseArguments({
        jsonString: '{"key":"value","num":42}',
        commanderOpts: {},
      });

      expect(result.source).toBe('json');
      expect(result.args).toEqual({ key: 'value', num: 42 });
    });

    test('should reject invalid JSON string', async () => {
      await expect(
        parseArguments({
          jsonString: '{invalid json}',
          commanderOpts: {},
        }),
      ).rejects.toThrow('Failed to parse --json argument');
    });

    test('should reject non-object JSON string', async () => {
      await expect(
        parseArguments({
          jsonString: '"just a string"',
          commanderOpts: {},
        }),
      ).rejects.toThrow('--json must contain a JSON object');
    });
  });

  describe('named flags input', () => {
    test('should convert string flags', async () => {
      const result = await parseArguments({
        commanderOpts: {
          path: './test.txt',
          name: 'test',
          validate: true, // known option, should be filtered
        },
      });

      expect(result.source).toBe('flags');
      expect(result.args).toEqual({
        path: './test.txt',
        name: 'test',
      });
    });

    test('should convert boolean flags with schema hints', async () => {
      const schema = {
        properties: {
          recursive: { type: 'boolean' },
          count: { type: 'number' },
        },
      };

      const result = await parseArguments({
        commanderOpts: {
          recursive: 'true',
          count: '42',
        },
        inputSchema: schema,
      });

      expect(result.source).toBe('flags');
      expect(result.args).toEqual({
        recursive: true,
        count: 42,
      });
    });

    test('should convert number flags with schema hints', async () => {
      const schema = {
        properties: {
          maxDepth: { type: 'integer' },
          threshold: { type: 'number' },
        },
      };

      const result = await parseArguments({
        commanderOpts: {
          maxDepth: '10',
          threshold: '3.14',
        },
        inputSchema: schema,
      });

      expect(result.source).toBe('flags');
      expect(result.args).toEqual({
        maxDepth: 10,
        threshold: 3.14,
      });
    });

    test('should handle false boolean values', async () => {
      const schema = {
        properties: {
          enabled: { type: 'boolean' },
        },
      };

      const result = await parseArguments({
        commanderOpts: {
          enabled: 'false',
        },
        inputSchema: schema,
      });

      expect(result.source).toBe('flags');
      expect(result.args).toEqual({
        enabled: false,
      });
    });

    test('should filter known command options', async () => {
      const result = await parseArguments({
        commanderOpts: {
          json: '{}',
          stdin: false,
          server: 'test',
          validate: true,
          outputFormat: 'json',
          quiet: false,
          verbose: true,
          customArg: 'value',
        },
      });

      expect(result.source).toBe('flags');
      expect(result.args).toEqual({
        customArg: 'value',
      });
    });

    test('should handle array values', async () => {
      const result = await parseArguments({
        commanderOpts: {
          tags: ['tag1', 'tag2', 'tag3'],
        },
      });

      expect(result.source).toBe('flags');
      expect(result.args).toEqual({
        tags: ['tag1', 'tag2', 'tag3'],
      });
    });

    test('should return empty object when only known options present', async () => {
      const result = await parseArguments({
        commanderOpts: {
          server: 'test',
          quiet: true,
        },
      });

      expect(result.source).toBe('flags');
      expect(result.args).toEqual({});
    });
  });

  describe('priority order', () => {
    test('should prioritize stdin over JSON string', async () => {
      const originalStdin = Bun.stdin;
      // @ts-expect-error
      Bun.stdin = {
        stream: () => ({
          async *[Symbol.asyncIterator]() {
            yield Buffer.from(JSON.stringify({ from: 'stdin' }));
          },
        }),
      };

      const result = await parseArguments({
        useStdin: true,
        jsonString: '{"from":"json"}',
        commanderOpts: { from: 'flags' },
      });

      expect(result.source).toBe('stdin');
      expect(result.args).toEqual({ from: 'stdin' });

      // @ts-expect-error
      Bun.stdin = originalStdin;
    });

    test('should prioritize JSON string over named flags', async () => {
      const result = await parseArguments({
        jsonString: '{"from":"json"}',
        commanderOpts: { from: 'flags' },
      });

      expect(result.source).toBe('json');
      expect(result.args).toEqual({ from: 'json' });
    });
  });
});
