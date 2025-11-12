/**
 * Output formatter for tool call results
 * Supports multiple output formats: text, json, raw
 */

import type { MCPToolResult } from '../mcp/client.js';

export type OutputFormat = 'text' | 'json' | 'raw';

export interface FormattedOutput {
  content: string;
  exitCode: number;
}

export interface FormatOptions {
  format: OutputFormat;
  serverName: string;
  toolName: string;
}

/**
 * Format tool call result based on output format
 */
export function formatOutput(result: MCPToolResult, options: FormatOptions): FormattedOutput {
  // Handle error results
  if (result.isError) {
    return formatError(result, options);
  }

  // Format based on output format
  switch (options.format) {
    case 'text':
      return formatAsText(result);
    case 'json':
      return formatAsJson(result, options);
    case 'raw':
      return formatAsRaw(result);
    default:
      return formatAsText(result);
  }
}

/**
 * Format as plain text (default)
 * Extracts text content from content blocks
 */
function formatAsText(result: MCPToolResult): FormattedOutput {
  const textBlocks: string[] = [];

  for (const block of result.content) {
    if (block.type === 'text') {
      textBlocks.push(block.text);
    } else if (block.type === 'resource') {
      // Format resource content
      const resource = block.resource as { text?: string; blob?: string; mimeType?: string };
      if (resource.text) {
        textBlocks.push(resource.text);
      } else if (resource.blob) {
        textBlocks.push(`[Binary data: ${resource.mimeType || 'unknown'}]`);
      }
    } else if (block.type === 'image') {
      textBlocks.push(`[Image: ${block.mimeType || 'unknown'}]`);
    }
  }

  const content = textBlocks.join('\n');
  return {
    content: content || '[No text content]',
    exitCode: 0,
  };
}

/**
 * Format as JSON with metadata
 */
function formatAsJson(result: MCPToolResult, options: FormatOptions): FormattedOutput {
  const output = {
    success: !result.isError,
    server: options.serverName,
    tool: options.toolName,
    content: result.content,
  };

  return {
    content: JSON.stringify(output, null, 2),
    exitCode: 0,
  };
}

/**
 * Format as raw MCP response
 */
function formatAsRaw(result: MCPToolResult): FormattedOutput {
  return {
    content: JSON.stringify(result, null, 2),
    exitCode: 0,
  };
}

/**
 * Format error result
 */
function formatError(result: MCPToolResult, options: FormatOptions): FormattedOutput {
  const errorMessages: string[] = [];

  for (const block of result.content) {
    if (block.type === 'text') {
      errorMessages.push(block.text);
    }
  }

  const errorText = errorMessages.join('\n');

  // For text format, use simple error message
  if (options.format === 'text') {
    return {
      content: `Error: Tool execution failed [${options.serverName}.${options.toolName}]\n${errorText}`,
      exitCode: 2,
    };
  }

  // For JSON/raw format, include structured error
  const output =
    options.format === 'json'
      ? {
          success: false,
          server: options.serverName,
          tool: options.toolName,
          error: errorText,
          content: result.content,
        }
      : result;

  return {
    content: JSON.stringify(output, null, 2),
    exitCode: 2,
  };
}
