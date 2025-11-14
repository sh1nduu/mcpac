// Auto-generated MCPaC runtime - do not edit
// This file contains the runtime implementation for MCP tool calls via IPC
// Version: x.x.x

import { connect as netConnect, type Socket } from 'node:net';

// Debug utilities
const DEBUG_LEVEL = parseInt(process.env.MCPC_DEBUG || '0', 10);

function debugLog(message: string, ...args: unknown[]): void {
  if (DEBUG_LEVEL > 0) {
    console.error(`[MCPC] ${message}`, ...args);
  }
}

function debugVerbose(message: string, ...args: unknown[]): void {
  if (DEBUG_LEVEL >= 2) {
    console.error(`[MCPC:VERBOSE] ${message}`, ...args);
  }
}

function debugError(message: string, error: unknown): void {
  if (DEBUG_LEVEL > 0) {
    console.error(`[MCPC:ERROR] ${message}`);
    if (error instanceof Error) {
      console.error(`  Message: ${error.message}`);
      if (DEBUG_LEVEL >= 2 && error.stack) {
        console.error(`  Stack: ${error.stack}`);
      }
    } else {
      console.error(`  Error: ${String(error)}`);
    }
  }
}

// MCP ContentBlock type definitions (from @modelcontextprotocol/sdk)
export type MCPTextContent = {
  type: 'text';
  text: string;
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

export type MCPImageContent = {
  type: 'image';
  data: string;
  mimeType: string;
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

export type MCPAudioContent = {
  type: 'audio';
  data: string;
  mimeType: string;
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

export type MCPResourceLink = {
  type: 'resource_link';
  uri: string;
  description?: string;
  mimeType?: string;
  annotations?: {
    audience?: ('user' | 'assistant')[];
    priority?: number;
    lastModified?: string;
  };
  _meta?: Record<string, unknown>;
};

export type MCPEmbeddedResource = {
  type: 'resource';
  resource: {
    uri: string;
    mimeType?: string;
    text?: string;
    blob?: string;
    _meta?: Record<string, unknown>;
  };
  annotations?: {
    audience?: ('user' | 'assistant')[];
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

    debugLog(`Connecting to IPC socket: ${this.socketPath}`);

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
    let newlineIndex = this.buffer.indexOf('\n');
    while (newlineIndex !== -1) {
      const message = this.buffer.substring(0, newlineIndex);
      this.buffer = this.buffer.substring(newlineIndex + 1);

      try {
        const response = JSON.parse(message);
        this.handleResponse(response);
      } catch (error) {
        debugError('Failed to parse IPC response', error);
      }

      newlineIndex = this.buffer.indexOf('\n');
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

    debugVerbose(`Sending IPC request: ${serverName}.${toolName}`);

    // Keep process alive while waiting for response
    this.socket?.ref();

    // Create timeout promise
    const timeoutMs = 30000; // 30 seconds
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        debugError(
          `IPC call timeout after ${timeoutMs}ms: ${serverName}.${toolName}`,
          new Error('Timeout'),
        );
        this.pendingRequests.delete(id);
        if (this.pendingRequests.size === 0) {
          this.socket?.unref();
        }
        reject(new Error(`IPC call timeout after ${timeoutMs}ms: ${serverName}.${toolName}`));
      }, timeoutMs);
    });

    // Create IPC call promise
    const ipcPromise = new Promise<MCPToolResult>((resolve, reject) => {
      this.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          debugVerbose(`Received IPC response: ${serverName}.${toolName}`);
          // Remove this request from pending
          this.pendingRequests.delete(id);
          // Allow process to exit if no more pending requests
          if (this.pendingRequests.size === 0) {
            this.socket?.unref();
          }
          resolve({ content: value as ContentBlock[], isError: false });
        },
        reject: (error: Error) => {
          debugError(`IPC call failed: ${serverName}.${toolName}`, error);
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

      this.socket.write(`${JSON.stringify(request)}\n`);
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
    debugLog(`Initializing IPC client with socket: ${ipcSocket}`);
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
 * Permission checks are performed by the host-side IPCServer, not here.
 * This simplifies the user-side code while maintaining security through
 * the trust boundary (parent process enforces permissions).
 *
 * @param serverName - Name of the MCP server
 * @param toolName - Name of the tool to call
 * @param input - Input parameters for the tool
 * @returns The tool's response
 * @throws Error if the tool call fails or permission is denied
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
        `MCP Tool Error [${serverName}.${toolName}]: ${JSON.stringify(result.content)}`,
      );
    }

    return result.content as T;
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unknown error calling ${serverName}.${toolName}: ${String(error)}`);
  }
}

// ============================================================================
// Capability-Based Permission System
// ============================================================================

/**
 * Full runtime interface with utility methods for permission inspection.
 */
export interface FullRuntime<
  P extends string,
  _Methods extends Record<P, (...args: any[]) => any>,
> {
  getPermissions(): readonly P[];
  has<Perm extends P>(perm: Perm): boolean;
}

/**
 * Helper type to flatten one server's methods into "server.tool" format
 */
type FlattenServer<ServerName extends string, Tools> = {
  [Tool in keyof Tools & string as `${ServerName}.${Tool}`]: Tools[Tool];
};

/**
 * Union to Intersection helper type
 */
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

/**
 * Convert nested server/tool structure to flat "server.tool" method map.
 */
export type MethodsFromServers<Servers> = UnionToIntersection<
  {
    [Server in keyof Servers & string]: FlattenServer<Server, Servers[Server]>;
  }[keyof Servers & string]
>;

/**
 * Extract server names from flat "server.tool" keys
 */
type ServerNames<M> = keyof M & string extends infer K
  ? K extends `${infer S}.${string}`
    ? S
    : never
  : never;

/**
 * Extract tool names for a specific server from "server.tool" keys
 */
type MethodsForServer<M, S extends string> = keyof M & string extends infer K
  ? K extends `${S}.${infer Tool}`
    ? Tool
    : never
  : never;

/**
 * Filter Methods to only include keys that are in the Perms array
 */
type FilterMethods<M extends Record<string, any>, Perms extends readonly string[]> = {
  [K in keyof M as K extends Perms[number] ? K : never]: M[K];
};

/**
 * Transform flat "server.tool" methods into nested { server: { tool: method } } structure
 */
type GroupByServer<M extends Record<string, any>> = {
  [S in ServerNames<M>]: {
    [Tool in MethodsForServer<M, S>]: M[`${S}.${Tool}`];
  };
};

/**
 * Create a namespaced runtime type with nested server.tool() access.
 */
export type PickNamespacedRuntime<
  Perms extends readonly string[],
  P extends string,
  Methods extends Record<string, (...args: any[]) => any>,
> = GroupByServer<FilterMethods<Methods, Perms>> &
  FullRuntime<P, Methods & Record<P, (...args: any[]) => any>>;

/**
 * Secret symbol for runtime verification
 */
const RuntimeSecret = Symbol('RuntimeSecret');

/**
 * NamespacedRuntimeAuthority manages namespaced permission grants with MCP-style syntax.
 * Permission IDs are flat strings ("server.tool") but runtime provides nested access.
 */
export class NamespacedRuntimeAuthority<
  P extends string,
  Methods extends Record<P, (...args: any[]) => any>,
> {
  private readonly secretKey: string;
  private readonly methodImplementations: Methods;

  constructor(methodImplementations: Methods) {
    this.secretKey = crypto.randomUUID();
    this.methodImplementations = methodImplementations;
  }

  grant<T extends readonly P[]>(...permissions: T): PickNamespacedRuntime<T, P, Methods> {
    return this.createNamespacedRuntime([...permissions]);
  }

  verify(obj: any): boolean {
    return obj && obj[RuntimeSecret] === this.secretKey;
  }

  private createNamespacedRuntime(
    permissions: P[],
  ): PickNamespacedRuntime<readonly P[], P, Methods> {
    const baseObj: any = {
      [RuntimeSecret]: this.secretKey,

      getPermissions(): readonly P[] {
        return permissions;
      },

      has<Perm extends P>(perm: Perm): boolean {
        return permissions.includes(perm);
      },
    };

    // Validate granted permissions format
    for (const perm of permissions) {
      const permStr = String(perm);
      if (permStr.indexOf('.') === -1) {
        throw new Error(
          `Invalid namespaced permission: "${permStr}". Expected format: "server.tool"`,
        );
      }
    }

    // Create nested structure for ALL methods (not just granted ones)
    for (const [permStr, implementation] of Object.entries(this.methodImplementations)) {
      const perm = permStr as P;
      const dotIndex = permStr.indexOf('.');

      if (dotIndex === -1) {
        continue; // Skip methods without proper namespace format
      }

      const server = permStr.slice(0, dotIndex);
      const tool = permStr.slice(dotIndex + 1);

      // Create server namespace if it doesn't exist
      if (!baseObj[server]) {
        baseObj[server] = {};
      }

      // Add the method wrapper (with permission check)
      baseObj[server][tool] = (...args: any[]) => {
        // Verify runtime integrity
        if (!this.verify(runtimeObj)) {
          throw new Error('Invalid runtime: verification failed');
        }

        // Check permission
        if (!permissions.includes(perm)) {
          throw new Error(
            `Missing permission: ${String(perm)} (granted: [${permissions.join(', ')}])`,
          );
        }

        // Call the actual implementation
        return (implementation as (...args: any[]) => any)(...args);
      };
    }

    // Freeze all nested server objects
    for (const key of Object.keys(baseObj)) {
      if (
        key !== RuntimeSecret.toString() &&
        typeof baseObj[key] === 'object' &&
        baseObj[key] !== null
      ) {
        Object.freeze(baseObj[key]);
      }
    }

    // Freeze the root object
    const runtimeObj = Object.freeze(baseObj) as PickNamespacedRuntime<readonly P[], P, Methods>;

    return runtimeObj;
  }
}

/**
 * Create a capability runtime with granted permissions.
 * This function is called by the runtime injector with permissions extracted from user code.
 *
 * Permission enforcement happens on the host side (IPCServer), not here.
 * This function creates a runtime object that provides type-safe access to tools,
 * but actual permission checks occur when tools are called via IPC.
 *
 * Implementation requirements:
 * 1. Create methodImplementations mapping "server.tool" to callMCPTool wrappers
 * 2. Create NamespacedRuntimeAuthority instance with methodImplementations
 * 3. Call authority.grant(...permissions) to create the runtime object
 * 4. Return the runtime object
 *
 * Note: This is a placeholder that will be replaced by generated code that knows
 * about the specific servers and tools available.
 */
export function createRuntime(_permissions: string[]): any {
  throw new Error(
    'createRuntime() must be called after code generation. Run "mcpac generate" first.',
  );
}
