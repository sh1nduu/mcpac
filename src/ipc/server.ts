import { existsSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import type { MCPManager } from '../mcp/manager.js';
import {
  createErrorResponse,
  createSuccessResponse,
  IPCErrorCode,
  type IPCRequest,
  type IPCResponse,
} from './protocol.js';

const DEBUG = process.env.MCPC_DEBUG === '1';

function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    console.error('[IPC Server]', ...args);
  }
}

function debugError(...args: unknown[]): void {
  if (DEBUG) {
    console.error('[IPC Server ERROR]', ...args);
  }
}

/**
 * IPC Server that handles tool call requests from user code process
 */
export class IPCServer {
  private server: Server;
  private socketPath: string;
  private mcpManager: MCPManager;
  private clients: Set<Socket> = new Set();
  private isClosing: boolean = false;

  constructor(mcpManager: MCPManager, socketPath?: string) {
    this.mcpManager = mcpManager;
    this.socketPath = socketPath || `/tmp/mcpc-${process.pid}.sock`;
    this.server = createServer();
  }

  /**
   * Start the IPC server
   */
  async start(): Promise<void> {
    if (this.isClosing) {
      throw new Error('Cannot start server while closing');
    }

    // Remove existing socket file if it exists
    if (existsSync(this.socketPath)) {
      await unlink(this.socketPath);
    }

    return new Promise((resolve, reject) => {
      this.server.on('connection', (socket) => this.handleConnection(socket));

      this.server.on('error', (error) => {
        debugError('Server error:', error);
        reject(error);
      });

      this.server.listen(this.socketPath, () => {
        debugLog(`IPC server listening on ${this.socketPath}`);
        resolve();
      });
    });
  }

  /**
   * Get the socket path for clients to connect to
   */
  getSocketPath(): string {
    return this.socketPath;
  }

  /**
   * Handle new client connection
   */
  private handleConnection(socket: Socket): void {
    debugLog('Client connected');
    this.clients.add(socket);

    let buffer = '';

    socket.on('data', (data) => {
      buffer += data.toString();

      // Process complete JSON messages (newline-delimited)
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const message = buffer.substring(0, newlineIndex);
        buffer = buffer.substring(newlineIndex + 1);

        this.handleMessage(socket, message).catch((error) => {
          debugError('Error handling message:', error);
        });

        newlineIndex = buffer.indexOf('\n');
      }
    });

    socket.on('error', (error) => {
      debugError('Socket error:', error);
    });

    socket.on('close', () => {
      debugLog('Client disconnected');
      this.clients.delete(socket);
    });
  }

  /**
   * Handle a single IPC request message
   */
  private async handleMessage(socket: Socket, message: string): Promise<void> {
    let request: IPCRequest;

    // Parse JSON request
    try {
      request = JSON.parse(message);
    } catch (_error) {
      const response = createErrorResponse('unknown', IPCErrorCode.PARSE_ERROR, 'Invalid JSON', {
        originalMessage: message,
      });
      this.sendResponse(socket, response);
      return;
    }

    debugLog('Received request:', request);

    // Validate request format
    if (
      request.jsonrpc !== '2.0' ||
      typeof request.id === 'undefined' ||
      request.method !== 'callTool'
    ) {
      const response = createErrorResponse(
        request.id || 'unknown',
        IPCErrorCode.INVALID_REQUEST,
        'Invalid request format',
      );
      this.sendResponse(socket, response);
      return;
    }

    // Handle the tool call request
    try {
      const result = await this.callMCPTool(
        request.params.server,
        request.params.tool,
        request.params.arguments,
      );

      const response = createSuccessResponse(request.id, result);
      this.sendResponse(socket, response);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const response = createErrorResponse(
        request.id,
        IPCErrorCode.TOOL_EXECUTION_FAILED,
        errorMessage,
        { error: String(error) },
      );
      this.sendResponse(socket, response);
    }
  }

  /**
   * Call an MCP tool via MCPManager
   */
  private async callMCPTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<unknown> {
    debugLog(`Calling MCP tool: ${serverName}.${toolName}`);

    try {
      const client = await this.mcpManager.getClient(serverName);

      if (!client.isConnected()) {
        await client.connect();
      }

      const result = await client.callTool(toolName, args);
      debugLog(`Tool call successful: ${serverName}.${toolName}`);

      return result;
    } catch (error) {
      debugError(`Tool call failed: ${serverName}.${toolName}`, error);
      throw error;
    }
  }

  /**
   * Send response to client
   */
  private sendResponse(socket: Socket, response: IPCResponse): void {
    debugLog('Sending response:', response);
    socket.write(`${JSON.stringify(response)}\n`);
  }

  /**
   * Close the IPC server and all client connections
   */
  async close(): Promise<void> {
    if (this.isClosing) {
      return;
    }

    this.isClosing = true;
    debugLog('Closing IPC server...');

    // Close all client connections
    for (const client of this.clients) {
      client.destroy();
    }
    this.clients.clear();

    // Close the server
    return new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          debugError('Error closing server:', error);
          reject(error);
        } else {
          debugLog('Server closed');
          resolve();
        }
      });
    }).then(async () => {
      // Remove socket file
      try {
        if (existsSync(this.socketPath)) {
          await unlink(this.socketPath);
          debugLog('Socket file removed');
        }
      } catch (error) {
        debugError('Error removing socket file:', error);
      }
    });
  }
}
