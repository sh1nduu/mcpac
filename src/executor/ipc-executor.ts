import { IPCServer } from '../ipc/server.js';
import type { MCPManager } from '../mcp/manager.js';
import type { ExecutionContext } from './context.js';
import type { ExecutionResult } from './runner.js';

const DEBUG = process.env.MCPAC_DEBUG === '1';

function debugLog(...args: unknown[]): void {
  if (DEBUG) {
    console.error('[IPC Executor]', ...args);
  }
}

function debugError(...args: unknown[]): void {
  if (DEBUG) {
    console.error('[IPC Executor ERROR]', ...args);
  }
}

export interface IPCExecuteOptions {
  mcpManager: MCPManager;
  context: ExecutionContext;
  timeout?: number;
  dryRun?: boolean;
}

/**
 * Executor that manages MCP servers and user code communication via IPC
 */
export class IPCExecutor {
  /**
   * Execute a TypeScript file with IPC-based MCP communication
   */
  async executeFile(filePath: string, options: IPCExecuteOptions): Promise<ExecutionResult> {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would execute with IPC: ${filePath}`);
      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    }

    debugLog(`Executing file with IPC: ${filePath}`);

    // Create IPC server
    const ipcServer = new IPCServer(options.mcpManager);

    try {
      // Start IPC server
      await ipcServer.start();
      const socketPath = ipcServer.getSocketPath();
      debugLog(`IPC server started at ${socketPath}`);

      // Spawn user code with IPC socket path in environment
      const env = {
        ...options.context.env,
        MCPC_IPC_SOCKET: socketPath,
      };

      debugLog('Spawning user code process...');
      const proc = Bun.spawn({
        cmd: ['bun', 'run', filePath],
        cwd: process.cwd(),
        env,
        stdout: 'pipe',
        stderr: 'pipe',
        stdin: 'ignore',
      });

      // Setup timeout if specified
      let timeoutId: Timer | undefined;
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          debugLog('Execution timeout, killing process');
          proc.kill();
        }, options.timeout);
      }

      try {
        // Wait for user code to complete
        const [stdout, stderr] = await Promise.all([
          proc.stdout.text(),
          proc.stderr.text(),
          proc.exited,
        ]);

        debugLog(`User code exited with code ${proc.exitCode}`);

        return {
          exitCode: proc.exitCode ?? 0,
          stdout,
          stderr,
        };
      } catch (error) {
        debugError('Error during execution:', error);
        return {
          exitCode: null,
          stdout: '',
          stderr: '',
          error: error as Error,
        };
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } finally {
      // Always cleanup IPC server and MCP connections
      debugLog('Cleaning up IPC server and MCP connections...');
      try {
        await ipcServer.close();
        debugLog('IPC server closed');
      } catch (error) {
        debugError('Error closing IPC server:', error);
      }

      try {
        await options.mcpManager.closeAll();
        debugLog('MCP connections closed');
      } catch (error) {
        debugError('Error closing MCP connections:', error);
      }
    }
  }

  /**
   * Execute TypeScript code string with IPC-based MCP communication
   */
  async executeCode(code: string, options: IPCExecuteOptions): Promise<ExecutionResult> {
    // Create temporary file
    const { writeFile, unlink } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const { tmpdir } = await import('node:os');

    const tempFile = join(tmpdir(), `.mcpac-temp-${process.pid}-${Date.now()}.ts`);

    try {
      await writeFile(tempFile, code, 'utf-8');

      if (options.dryRun) {
        console.log(`[DRY RUN] Would execute code with IPC:\n${code}`);
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };
      }

      return await this.executeFile(tempFile, options);
    } finally {
      // Cleanup temporary file
      try {
        await unlink(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Execute with streaming output (stdout/stderr inherit from parent)
   */
  async executeFileStreaming(filePath: string, options: IPCExecuteOptions): Promise<number | null> {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would execute with IPC (streaming): ${filePath}`);
      return 0;
    }

    debugLog(`Executing file with IPC (streaming): ${filePath}`);

    const ipcServer = new IPCServer(options.mcpManager);

    try {
      await ipcServer.start();
      const socketPath = ipcServer.getSocketPath();
      debugLog(`IPC server started at ${socketPath}`);

      const env = {
        ...options.context.env,
        MCPC_IPC_SOCKET: socketPath,
      };

      debugLog('Spawning user code process (streaming)...');
      const proc = Bun.spawn({
        cmd: ['bun', 'run', filePath],
        cwd: process.cwd(),
        env,
        stdout: 'inherit',
        stderr: 'inherit',
        stdin: 'ignore',
      });

      let timeoutId: Timer | undefined;
      if (options.timeout) {
        timeoutId = setTimeout(() => {
          debugLog('Execution timeout, killing process');
          proc.kill();
        }, options.timeout);
      }

      try {
        await proc.exited;
        debugLog(`User code exited with code ${proc.exitCode}`);
        return proc.exitCode;
      } finally {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      }
    } finally {
      debugLog('Cleaning up IPC server and MCP connections...');
      try {
        await ipcServer.close();
        debugLog('IPC server closed');
      } catch (error) {
        debugError('Error closing IPC server:', error);
      }

      try {
        await options.mcpManager.closeAll();
        debugLog('MCP connections closed');
      } catch (error) {
        debugError('Error closing MCP connections:', error);
      }
    }
  }
}
