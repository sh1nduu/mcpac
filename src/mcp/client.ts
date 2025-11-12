import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import type { ContentBlock } from '@modelcontextprotocol/sdk/types.js';
import { debugError, debugLog, debugVerbose, sanitizeEnvKeys } from '../utils/debug.js';
import { output } from '../utils/output.js';
import { VERSION } from '../version.js';

// Base config with common properties
interface BaseServerConfig {
  env?: Record<string, string>;
}

// STDIO transport config (process-based)
export interface StdioServerConfig extends BaseServerConfig {
  type: 'stdio';
  command: string;
  args: string[];
}

// HTTP transport config (REST-based)
export interface HttpServerConfig extends BaseServerConfig {
  type: 'http';
  url: string;
  headers?: Record<string, string>;
}

// Discriminated union for all transport types
export type MCPServerConfig = StdioServerConfig | HttpServerConfig;

/**
 * Normalize legacy config format (without 'type' field) to new format
 * Auto-detects transport type based on config properties
 */
export function normalizeMCPServerConfig(config: any): MCPServerConfig {
  // If already has type field, return as-is
  if ('type' in config) {
    return config as MCPServerConfig;
  }

  // Auto-detect based on presence of key fields
  if ('url' in config) {
    return {
      type: 'http',
      url: config.url,
      headers: config.headers,
      env: config.env,
    } as HttpServerConfig;
  }

  if ('command' in config) {
    return {
      type: 'stdio',
      command: config.command,
      args: config.args || [],
      env: config.env,
    } as StdioServerConfig;
  }

  throw new Error('Invalid MCP server config: must have either "command" (stdio) or "url" (http)');
}

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface MCPToolResult {
  content: ContentBlock[];
  isError: boolean;
}

export class MCPClient {
  private client: Client;
  private transport: StdioClientTransport | StreamableHTTPClientTransport | null = null;
  private connected: boolean = false;
  private config: MCPServerConfig;

  constructor(
    private serverName: string,
    config: MCPServerConfig,
  ) {
    // Normalize config to ensure it has the 'type' field
    this.config = normalizeMCPServerConfig(config);

    this.client = new Client(
      {
        name: 'mcpac',
        version: VERSION,
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );
  }

  /**
   * Check if a line contains error-like content
   */
  private isErrorLine(line: string): boolean {
    const lowerLine = line.toLowerCase();
    return (
      lowerLine.includes('error') ||
      lowerLine.includes('fatal') ||
      lowerLine.includes('exception') ||
      lowerLine.includes('failed') ||
      lowerLine.includes('failure') ||
      lowerLine.includes('panic') ||
      lowerLine.includes('critical')
    );
  }

  /**
   * Setup filtered stderr stream for normal mode
   */
  private setupFilteredStderr(stderrStream: any): void {
    let buffer = '';

    stderrStream.on('data', (chunk: Buffer) => {
      const text = chunk.toString();
      buffer += text;

      // Process complete lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (this.isErrorLine(line)) {
          process.stderr.write(`${line}\n`);
        }
      }
    });

    stderrStream.on('end', () => {
      // Flush any remaining buffer
      if (buffer.length > 0 && this.isErrorLine(buffer)) {
        process.stderr.write(buffer);
        if (!buffer.endsWith('\n')) {
          process.stderr.write('\n');
        }
      }
    });
  }

  /**
   * Get appropriate stderr handling based on output level
   */
  private getStderrMode(): 'inherit' | 'ignore' | 'pipe' {
    if (output.isQuiet()) {
      return 'ignore';
    } else if (output.isVerbose()) {
      return 'inherit';
    } else {
      // Normal mode: use pipe so we can filter
      return 'pipe';
    }
  }

  async connect(): Promise<void> {
    if (this.connected) return;

    debugLog(`Connecting to server: ${this.serverName}`);

    // Log transport-specific details
    if (this.config.type === 'stdio') {
      debugVerbose(`  Transport: STDIO`);
      debugVerbose(`  Command: ${this.config.command}`);
      debugVerbose(`  Args: ${this.config.args.join(' ')}`);
    } else if (this.config.type === 'http') {
      debugVerbose(`  Transport: HTTP`);
      debugVerbose(`  URL: ${this.config.url}`);
      if (this.config.headers) {
        const headerKeys = Object.keys(this.config.headers);
        debugVerbose(`  Header keys: ${headerKeys.join(', ')}`);
      }
    }

    const envKeys = sanitizeEnvKeys(this.config.env);
    if (envKeys.length > 0) {
      debugVerbose(`  Env keys: ${envKeys.join(', ')}`);
    }

    try {
      // Create transport based on config type
      if (this.config.type === 'stdio') {
        const stderrMode = this.getStderrMode();

        this.transport = new StdioClientTransport({
          command: this.config.command,
          args: this.config.args,
          env: this.config.env,
          stderr: stderrMode,
        });

        // Setup filtered stderr for normal mode (STDIO only)
        if (stderrMode === 'pipe' && this.transport.stderr) {
          this.setupFilteredStderr(this.transport.stderr);
        }
      } else if (this.config.type === 'http') {
        const url = new URL(this.config.url);
        this.transport = new StreamableHTTPClientTransport(url, {
          requestInit: {
            headers: this.config.headers,
          },
        });
      }

      if (!this.transport) {
        throw new Error('Failed to create transport');
      }

      debugLog(`Initializing connection to ${this.serverName}...`);
      await this.client.connect(this.transport);
      this.connected = true;
      debugLog(`✓ Connected to ${this.serverName}`);
    } catch (error) {
      debugError(`Failed to connect to ${this.serverName}`, error);
      throw new Error(
        `Failed to connect to MCP server '${this.serverName}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.connected) {
      await this.connect();
    }

    debugLog(`Listing tools from ${this.serverName}...`);
    try {
      const result = await this.client.listTools();
      debugLog(`✓ Received ${result.tools.length} tools from ${this.serverName}`);
      return result.tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
      }));
    } catch (error) {
      debugError(`Failed to list tools from ${this.serverName}`, error);
      throw new Error(
        `Failed to list tools from '${this.serverName}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async callTool(toolName: string, args: Record<string, unknown>): Promise<MCPToolResult> {
    if (!this.connected) {
      await this.connect();
    }

    debugVerbose(`Calling tool ${toolName} on ${this.serverName}`);
    try {
      const result = await this.client.callTool({
        name: toolName,
        arguments: args,
      });

      debugVerbose(`✓ Tool ${toolName} returned ${result.isError ? 'error' : 'success'}`);
      return {
        content: result.content as ContentBlock[],
        isError: Boolean(result.isError),
      };
    } catch (error) {
      debugError(`Failed to call tool ${toolName}`, error);
      throw new Error(
        `Failed to call tool '${toolName}' on '${this.serverName}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  async close(): Promise<void> {
    if (!this.connected) return;

    debugLog(`Closing connection to ${this.serverName}...`);
    try {
      await this.client.close();
      this.connected = false;
      this.transport = null;
      debugLog(`✓ Connection to ${this.serverName} closed`);
    } catch (error) {
      debugError(`Error closing connection to ${this.serverName}`, error);
      console.error(`Warning: Error closing connection to '${this.serverName}':`, error);
    }
  }

  isConnected(): boolean {
    return this.connected;
  }

  getServerName(): string {
    return this.serverName;
  }
}
