/**
 * Runtime template for generated MCP code
 * This template contains the IPC client implementation that will be
 * embedded in the generated servers/ directory as _mcpac_runtime.ts
 *
 * Note: The version string below will be replaced by generateRuntimeShim()
 * with the current package version at code generation time.
 */

export const RUNTIME_TEMPLATE = `// Auto-generated MCPaC runtime - do not edit
// This file contains the runtime implementation for MCP tool calls via IPC
// Version: x.x.x

import { connect as netConnect, type Socket } from 'node:net';

// Debug utilities
const DEBUG_LEVEL = parseInt(process.env.MCPC_DEBUG || '0', 10);

function debugLog(message: string, ...args: unknown[]): void {
  if (DEBUG_LEVEL > 0) {
    console.error(\`[MCPC] \${message}\`, ...args);
  }
}

function debugVerbose(message: string, ...args: unknown[]): void {
  if (DEBUG_LEVEL >= 2) {
    console.error(\`[MCPC:VERBOSE] \${message}\`, ...args);
  }
}

function debugError(message: string, error: unknown): void {
  if (DEBUG_LEVEL > 0) {
    console.error(\`[MCPC:ERROR] \${message}\`);
    if (error instanceof Error) {
      console.error(\`  Message: \${error.message}\`);
      if (DEBUG_LEVEL >= 2 && error.stack) {
        console.error(\`  Stack: \${error.stack}\`);
      }
    } else {
      console.error(\`  Error: \${String(error)}\`);
    }
  }
}

// MCP ContentBlock type definitions (from @modelcontextprotocol/sdk)
export type MCPTextContent = {
  type: "text";
  text: string;
  annotations?: {
    audience?: ("user" | "assistant")[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

export type MCPImageContent = {
  type: "image";
  data: string;
  mimeType: string;
  annotations?: {
    audience?: ("user" | "assistant")[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

export type MCPAudioContent = {
  type: "audio";
  data: string;
  mimeType: string;
  annotations?: {
    audience?: ("user" | "assistant")[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

export type MCPResourceLink = {
  type: "resource_link";
  uri: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: ("user" | "assistant")[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

export type MCPEmbeddedResource = {
  type: "resource";
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    _meta?: Record<string, unknown>;
  };
  annotations?: {
    audience?: ("user" | "assistant")[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

export type ContentBlock =
  | MCPTextContent
  | MCPImageContent
  | MCPAudioContent
  | MCPResourceLink
  | MCPEmbeddedResource;

export interface MCPToolResult {
  content: ContentBlock[];
  isError: boolean;
}

/**
 * IPC Client implementation
 * Communicates with parent process via Unix Domain Socket for tool calls
 */
class IPCClient {
  private socket: Socket | null = null;
  private requestId: number = 0;
  private pendingRequests: Map<
    number | string,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  > = new Map();
  private connected: boolean = false;
  private buffer: string = '';

  constructor(private socketPath: string) {}

  async connect(): Promise<void> {
    if (this.connected) return;

    debugLog(\`Connecting to IPC socket: \${this.socketPath}\`);

    return new Promise((resolve, reject) => {
      this.socket = netConnect(this.socketPath);

      this.socket.on('connect', () => {
        debugLog('✓ Connected to IPC server');
        this.connected = true;
        // Allow process to exit even with open socket
        this.socket?.unref();
        resolve();
      });

      this.socket.on('data', (data) => {
        this.handleData(data);
      });

      this.socket.on('error', (error) => {
        debugError('IPC socket error', error);
        if (!this.connected) {
          reject(error);
        }
      });

      this.socket.on('close', () => {
        debugLog('IPC connection closed');
        this.connected = false;
        // Reject all pending requests
        for (const [, { reject }] of this.pendingRequests) {
          reject(new Error('IPC connection closed'));
        }
        this.pendingRequests.clear();
      });
    });
  }

  private handleData(data: Buffer): void {
    this.buffer += data.toString();

    // Process complete JSON messages (newline-delimited)
    let newlineIndex: number;
    while ((newlineIndex = this.buffer.indexOf('\\n')) !== -1) {
      const message = this.buffer.substring(0, newlineIndex);
      this.buffer = this.buffer.substring(newlineIndex + 1);

      try {
        const response = JSON.parse(message);
        this.handleResponse(response);
      } catch (error) {
        debugError('Failed to parse IPC response', error);
      }
    }
  }

  private handleResponse(response: any): void {
    const pending = this.pendingRequests.get(response.id);
    if (pending) {
      if (response.error) {
        pending.reject(new Error(response.error.message));
      } else {
        pending.resolve(response.result);
      }
      this.pendingRequests.delete(response.id);
    }
  }

  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<MCPToolResult> {
    if (!this.connected) {
      await this.connect();
    }

    const id = this.requestId++;
    const request = {
      jsonrpc: '2.0' as const,
      id,
      method: 'callTool' as const,
      params: {
        server: serverName,
        tool: toolName,
        arguments: args,
      },
    };

    debugVerbose(\`Sending IPC request: \${serverName}.\${toolName}\`);

    // Keep process alive while waiting for response
    this.socket?.ref();

    // Create timeout promise
    const timeoutMs = 30000; // 30 seconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        debugError(\`IPC call timeout after \${timeoutMs}ms: \${serverName}.\${toolName}\`, new Error('Timeout'));
        this.pendingRequests.delete(id);
        if (this.pendingRequests.size === 0) {
          this.socket?.unref();
        }
        reject(new Error(\`IPC call timeout after \${timeoutMs}ms: \${serverName}.\${toolName}\`));
      }, timeoutMs);
    });

    // Create IPC call promise
    const ipcPromise = new Promise<MCPToolResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          debugVerbose(\`Received IPC response: \${serverName}.\${toolName}\`);
          // Remove this request from pending
          this.pendingRequests.delete(id);
          // Allow process to exit if no more pending requests
          if (this.pendingRequests.size === 0) {
            this.socket?.unref();
          }
          resolve({ content: value as ContentBlock[], isError: false });
        },
        reject: (error: Error) => {
          debugError(\`IPC call failed: \${serverName}.\${toolName}\`, error);
          // Remove this request from pending
          this.pendingRequests.delete(id);
          // Allow process to exit if no more pending requests
          if (this.pendingRequests.size === 0) {
            this.socket?.unref();
          }
          reject(error);
        },
      });

      if (!this.socket) {
        reject(new Error('IPC socket not connected'));
        return;
      }

      this.socket.write(JSON.stringify(request) + '\\n');
    });

    // Race between timeout and actual IPC call
    return Promise.race([ipcPromise, timeoutPromise]);
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * MCP Manager implementation
 * Singleton wrapper for IPC client
 */
class MCPManager {
  private static instance: MCPManager | null = null;
  private ipcClient: IPCClient | null = null;

  private constructor() {
    const ipcSocket = process.env.MCPC_IPC_SOCKET;
    if (!ipcSocket) {
      throw new Error('MCPC_IPC_SOCKET environment variable is not set');
    }
    debugLog(\`Initializing IPC client with socket: \${ipcSocket}\`);
    this.ipcClient = new IPCClient(ipcSocket);
  }

  static getInstance(): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager();
    }
    return MCPManager.instance;
  }

  async getClient(): Promise<IPCClient> {
    if (!this.ipcClient) {
      throw new Error('IPC client not initialized');
    }
    if (!this.ipcClient.isConnected()) {
      await this.ipcClient.connect();
    }
    return this.ipcClient;
  }
}

/**
 * Call an MCP tool via IPC
 * This is the main function used by generated code to invoke MCP tools
 *
 * @param serverName - Name of the MCP server
 * @param toolName - Name of the tool to call
 * @param input - Input parameters for the tool
 * @returns The tool's response
 * @throws Error if the tool call fails
 */
export async function callMCPTool<T = unknown>(
  serverName: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<T> {
  const manager = MCPManager.getInstance();

  try {
    const client = await manager.getClient();
    const result = await client.callTool(serverName, toolName, input);

    if (result.isError) {
      throw new Error(
        \`MCP Tool Error [\${serverName}.\${toolName}]: \${JSON.stringify(result.content)}\`,
      );
    }

    return result.content as T;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(\`Unknown error calling \${serverName}.\${toolName}: \${String(error)}\`);
  }
}
`;
