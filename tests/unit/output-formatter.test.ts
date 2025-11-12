import { describe, expect, test } from 'bun:test';
import type { MCPToolResult } from '../../src/mcp/client.js';
import { formatOutput } from '../../src/tools/output-formatter.js';

describe('formatOutput', () => {
  const defaultOptions = {
    format: 'text' as const,
    serverName: 'test-server',
    toolName: 'test_tool',
  };

  describe('text format', () => {
    test('should extract text content from text blocks', () => {
      const result: MCPToolResult = {
        content: [{ type: 'text', text: 'Hello, world!' }],
        isError: false,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(0);
      expect(output.content).toBe('Hello, world!');
    });

    test('should join multiple text blocks', () => {
      const result: MCPToolResult = {
        content: [
          { type: 'text', text: 'Line 1' },
          { type: 'text', text: 'Line 2' },
          { type: 'text', text: 'Line 3' },
        ],
        isError: false,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(0);
      expect(output.content).toBe('Line 1\nLine 2\nLine 3');
    });

    test('should handle resource blocks with text', () => {
      const result: MCPToolResult = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'file://test.txt',
              text: 'Resource content',
            },
          },
        ],
        isError: false,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(0);
      expect(output.content).toBe('Resource content');
    });

    test('should handle resource blocks with blob', () => {
      const result: MCPToolResult = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'file://image.png',
              blob: 'base64data',
              mimeType: 'image/png',
            },
          },
        ],
        isError: false,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(0);
      expect(output.content).toBe('[Binary data: image/png]');
    });

    test('should handle image blocks', () => {
      const result: MCPToolResult = {
        content: [
          {
            type: 'image',
            data: 'base64data',
            mimeType: 'image/jpeg',
          },
        ],
        isError: false,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(0);
      expect(output.content).toBe('[Image: image/jpeg]');
    });

    test('should handle empty content', () => {
      const result: MCPToolResult = {
        content: [],
        isError: false,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(0);
      expect(output.content).toBe('[No text content]');
    });

    test('should handle mixed content types', () => {
      const result: MCPToolResult = {
        content: [
          { type: 'text', text: 'Text content' },
          {
            type: 'resource',
            resource: {
              uri: 'file://data.txt',
              text: 'Resource text',
            },
          },
          {
            type: 'image',
            data: 'base64',
            mimeType: 'image/png',
          },
        ],
        isError: false,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(0);
      expect(output.content).toBe('Text content\nResource text\n[Image: image/png]');
    });
  });

  describe('json format', () => {
    test('should format as JSON with metadata', () => {
      const result: MCPToolResult = {
        content: [{ type: 'text', text: 'Result data' }],
        isError: false,
      };

      const output = formatOutput(result, {
        ...defaultOptions,
        format: 'json',
      });

      expect(output.exitCode).toBe(0);
      const parsed = JSON.parse(output.content);
      expect(parsed.success).toBe(true);
      expect(parsed.server).toBe('test-server');
      expect(parsed.tool).toBe('test_tool');
      expect(parsed.content).toEqual(result.content);
    });

    test('should include all content blocks in JSON', () => {
      const result: MCPToolResult = {
        content: [
          { type: 'text', text: 'Text 1' },
          { type: 'text', text: 'Text 2' },
        ],
        isError: false,
      };

      const output = formatOutput(result, {
        ...defaultOptions,
        format: 'json',
      });

      const parsed = JSON.parse(output.content);
      expect(parsed.content).toHaveLength(2);
    });
  });

  describe('raw format', () => {
    test('should output raw MCP response', () => {
      const result: MCPToolResult = {
        content: [{ type: 'text', text: 'Raw content' }],
        isError: false,
      };

      const output = formatOutput(result, {
        ...defaultOptions,
        format: 'raw',
      });

      expect(output.exitCode).toBe(0);
      const parsed = JSON.parse(output.content);
      expect(parsed).toEqual(result);
    });

    test('should preserve isError flag', () => {
      const result: MCPToolResult = {
        content: [{ type: 'text', text: 'Error message' }],
        isError: true,
      };

      const output = formatOutput(result, {
        ...defaultOptions,
        format: 'raw',
      });

      const parsed = JSON.parse(output.content);
      expect(parsed.isError).toBe(true);
    });
  });

  describe('error handling', () => {
    test('should format error in text mode', () => {
      const result: MCPToolResult = {
        content: [{ type: 'text', text: 'File not found' }],
        isError: true,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(2);
      expect(output.content).toContain('Error: Tool execution failed');
      expect(output.content).toContain('test-server.test_tool');
      expect(output.content).toContain('File not found');
    });

    test('should format error in json mode', () => {
      const result: MCPToolResult = {
        content: [{ type: 'text', text: 'Invalid input' }],
        isError: true,
      };

      const output = formatOutput(result, {
        ...defaultOptions,
        format: 'json',
      });

      expect(output.exitCode).toBe(2);
      const parsed = JSON.parse(output.content);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toBe('Invalid input');
      expect(parsed.server).toBe('test-server');
      expect(parsed.tool).toBe('test_tool');
    });

    test('should format error in raw mode', () => {
      const result: MCPToolResult = {
        content: [{ type: 'text', text: 'Error details' }],
        isError: true,
      };

      const output = formatOutput(result, {
        ...defaultOptions,
        format: 'raw',
      });

      expect(output.exitCode).toBe(2);
      const parsed = JSON.parse(output.content);
      expect(parsed.isError).toBe(true);
      expect(parsed.content[0].text).toBe('Error details');
    });

    test('should handle multiple error messages', () => {
      const result: MCPToolResult = {
        content: [
          { type: 'text', text: 'Error 1' },
          { type: 'text', text: 'Error 2' },
        ],
        isError: true,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(2);
      expect(output.content).toContain('Error 1');
      expect(output.content).toContain('Error 2');
    });
  });

  describe('edge cases', () => {
    test('should handle empty error content', () => {
      const result: MCPToolResult = {
        content: [],
        isError: true,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(2);
      expect(output.content).toContain('Error: Tool execution failed');
    });

    test('should handle resource without text or blob', () => {
      const result: MCPToolResult = {
        content: [
          {
            type: 'resource',
            resource: {
              uri: 'file://test.txt',
              text: '',
            },
          },
        ],
        isError: false,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(0);
      expect(output.content).toBe('[No text content]');
    });

    test('should handle missing mimeType', () => {
      const result: MCPToolResult = {
        content: [
          {
            type: 'image',
            data: 'base64data',
            mimeType: '',
          },
        ],
        isError: false,
      };

      const output = formatOutput(result, defaultOptions);
      expect(output.exitCode).toBe(0);
      expect(output.content).toBe('[Image: unknown]');
    });
  });
});
