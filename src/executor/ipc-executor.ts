import { IPCServer } from '../ipc/server.js';
import type { MCPManager } from '../mcp/manager.js';
import type { ExecutionContext } from './context.js';
import { PermissionChecker } from './permission-checker.js';
import { PermissionExtractor } from './permission-extractor.js';
import { RuntimeInjector } from './runtime-injector.js';

export interface ExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

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

/**
 * Convert camelCase to kebab-case (hyphenated)
 * e.g., "testFs" -> "test-fs"
 */
function toKebabCase(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

/**
 * Convert camelCase permission IDs to MCP format
 * e.g., "testFs.readFile" -> "test-fs.read_file"
 *
 * This is needed because:
 * - CLI and user code use camelCase: testFs.readFile
 * - MCP server names may have hyphens: test-fs
 * - MCP tool names are snake_case: read_file
 * - IPCServer constructs permission IDs from MCP names: test-fs.read_file
 *
 * @param permission - Permission ID in camelCase format
 * @param serverNameMap - Mapping from camelCase server names to original MCP server names
 */
function permissionToMcpFormat(permission: string, serverNameMap: Map<string, string>): string {
  const parts = permission.split('.');
  if (parts.length < 2) return permission;

  const [serverCamel, ...toolParts] = parts;
  if (!serverCamel || toolParts.length === 0) return permission;

  // Try to find the original server name from the map
  const originalServerName = serverNameMap.get(serverCamel) || toKebabCase(serverCamel);

  const camelTool = toolParts.join('.');
  const snakeTool = camelTool.replace(/([A-Z])/g, '_$1').toLowerCase();
  return `${originalServerName}.${snakeTool}`;
}

export interface IPCExecuteOptions {
  mcpManager: MCPManager;
  context: ExecutionContext;
  grantedPermissions?: string[];
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

    // Read user code
    const { readFile } = await import('node:fs/promises');
    const userCode = await readFile(filePath, 'utf-8');

    // Extract required permissions from code
    const extractor = new PermissionExtractor();
    const extractionResult = extractor.extract(userCode, filePath);

    if (!extractionResult.success) {
      // Permission validation failed
      const errorMessage = [
        'Permission validation failed:',
        '',
        ...extractionResult.errors.map((err) => `  ✗ ${err.location}: ${err.reason}`),
      ].join('\n');

      return {
        exitCode: 1,
        stdout: '',
        stderr: errorMessage,
        error: new Error('Permission validation failed'),
      };
    }

    // Check permissions
    const grantedPermissions = options.grantedPermissions ?? [];
    const checker = new PermissionChecker();
    const permissionCheck = checker.check(extractionResult.permissions, grantedPermissions);

    if (!permissionCheck.allowed) {
      // Permission check failed
      return {
        exitCode: 1,
        stdout: '',
        stderr: permissionCheck.detailedMessage,
        error: new Error('Permission denied'),
      };
    }

    // Inject runtime initialization with granted permissions
    const injector = new RuntimeInjector();
    const modifiedCode = injector.inject(userCode, {
      grantedPermissions,
    });

    // Write modified code to temp file in workspace
    const { writeFile, unlink } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const tempFile = join(dirname(filePath), `.mcpac-temp-${Date.now()}.ts`);

    try {
      await writeFile(tempFile, modifiedCode, 'utf-8');
      debugLog(`Modified code written to ${tempFile}`);

      // Build server name mapping (camelCase -> original MCP server name)
      const serverNames = await options.mcpManager.listServers();
      const serverNameMap = new Map<string, string>();
      for (const serverName of serverNames) {
        // Convert server name to camelCase for mapping
        const camelName = serverName
          .replace(/-/g, '_')
          .replace(/_([a-z])/g, (_: string, letter: string) => letter.toUpperCase());
        serverNameMap.set(camelName, serverName);
        debugLog(`Server name mapping: ${camelName} -> ${serverName}`);
      }

      // Convert permissions to MCP format (original server name + snake_case tool name)
      const mcpFormatPermissions = grantedPermissions.map((p) =>
        permissionToMcpFormat(p, serverNameMap),
      );
      debugLog(`Converted permissions to MCP format:`, mcpFormatPermissions);

      // Create IPC server with trusted permissions from host side
      const ipcServer = new IPCServer(options.mcpManager, undefined, mcpFormatPermissions);

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
          cmd: ['bun', 'run', tempFile],
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
    } finally {
      // Cleanup temp file
      try {
        await unlink(tempFile);
        debugLog(`Temp file removed: ${tempFile}`);
      } catch (error) {
        debugError('Error removing temp file:', error);
      }
    }
  }

  /**
   * Execute TypeScript code string with IPC-based MCP communication
   */
  async executeCode(code: string, options: IPCExecuteOptions): Promise<ExecutionResult> {
    // Create temporary file in workspace directory (not tmpdir) to ensure relative imports work
    const { writeFile, unlink } = await import('node:fs/promises');
    const { join } = await import('node:path');

    const tempFile = join(
      options.context.workspaceDir,
      `.mcpac-temp-${process.pid}-${Date.now()}.ts`,
    );

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

    // Read user code
    const { readFile, writeFile, unlink } = await import('node:fs/promises');
    const { join, dirname } = await import('node:path');
    const userCode = await readFile(filePath, 'utf-8');

    // Extract required permissions from code
    const extractor = new PermissionExtractor();
    const extractionResult = extractor.extract(userCode, filePath);

    if (!extractionResult.success) {
      // Permission validation failed
      console.error('Permission validation failed:');
      console.error('');
      for (const err of extractionResult.errors) {
        console.error(`  ✗ ${err.location}: ${err.reason}`);
      }
      return 1;
    }

    // Check permissions
    const grantedPermissions = options.grantedPermissions ?? [];
    const checker = new PermissionChecker();
    const permissionCheck = checker.check(extractionResult.permissions, grantedPermissions);

    if (!permissionCheck.allowed) {
      // Permission check failed
      console.error(permissionCheck.detailedMessage);
      return 1;
    }

    // Inject runtime initialization with granted permissions
    const injector = new RuntimeInjector();
    const modifiedCode = injector.inject(userCode, {
      grantedPermissions,
    });

    // Write modified code to temp file in workspace
    const tempFile = join(dirname(filePath), `.mcpac-temp-${Date.now()}.ts`);

    try {
      await writeFile(tempFile, modifiedCode, 'utf-8');
      debugLog(`Modified code written to ${tempFile}`);

      // Build server name mapping (camelCase -> original MCP server name)
      const serverNames = await options.mcpManager.listServers();
      const serverNameMap = new Map<string, string>();
      for (const serverName of serverNames) {
        // Convert server name to camelCase for mapping
        const camelName = serverName
          .replace(/-/g, '_')
          .replace(/_([a-z])/g, (_: string, letter: string) => letter.toUpperCase());
        serverNameMap.set(camelName, serverName);
        debugLog(`Server name mapping: ${camelName} -> ${serverName}`);
      }

      // Convert permissions to MCP format (original server name + snake_case tool name)
      const mcpFormatPermissions = grantedPermissions.map((p) =>
        permissionToMcpFormat(p, serverNameMap),
      );
      debugLog(`Converted permissions to MCP format:`, mcpFormatPermissions);

      const ipcServer = new IPCServer(options.mcpManager, undefined, mcpFormatPermissions);

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
          cmd: ['bun', 'run', tempFile],
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
    } finally {
      // Cleanup temp file
      try {
        await unlink(tempFile);
        debugLog(`Temp file removed: ${tempFile}`);
      } catch (error) {
        debugError('Error removing temp file:', error);
      }
    }
  }
}
