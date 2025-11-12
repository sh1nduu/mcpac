import type { MCPManager } from '../mcp/manager.js';
import { output } from '../utils/output.js';

export interface ExecutionContext {
  workspaceDir: string;
  serversDir: string;
  configPath: string;
  env: Record<string, string>;
}

export class ContextManager {
  constructor(private manager: MCPManager) {}

  /**
   * Prepare execution context
   */
  async prepareContext(workspaceDir: string = './workspace'): Promise<ExecutionContext> {
    // Establish MCP server connections in advance
    // This ensures connections are already established when code executes
    const servers = await this.manager.listServers();
    const connectedServers: string[] = [];

    for (const serverName of servers) {
      try {
        await this.manager.getClient(serverName);
        connectedServers.push(serverName);
      } catch (error) {
        output.warn(
          `Warning: Failed to connect to ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    if (connectedServers.length > 0) {
      output.verbose(
        `Connected to ${connectedServers.length} MCP server(s): ${connectedServers.join(', ')}`,
      );
    } else if (servers.length > 0) {
      output.warn('Warning: No MCP servers could be connected');
    }

    // Set environment variables
    const env = {
      ...process.env,
      MCPC_SERVERS_PATH: './servers',
      MCPC_CONFIG_PATH: this.manager.getConfigPath(),
      MCPC_WORKSPACE: workspaceDir,
    };

    return {
      workspaceDir,
      serversDir: './servers',
      configPath: './config/mcp-servers.json',
      env,
    };
  }
}
