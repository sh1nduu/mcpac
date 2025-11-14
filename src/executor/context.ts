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
  async prepareContext(workspaceDir: string = '.'): Promise<ExecutionContext> {
    // Validate that servers are configured (lazy initialization)
    // Servers will connect on-demand when tools are first called
    const servers = await this.manager.listServers();

    if (servers.length === 0) {
      output.warn('Warning: No MCP servers configured');
    } else {
      output.verbose(`Found ${servers.length} configured server(s): ${servers.join(', ')}`);
      output.verbose('Servers will connect on first use (lazy initialization)');
    }

    // Convert workspace directory to absolute path
    const { resolve } = await import('node:path');
    const absoluteWorkspaceDir = resolve(workspaceDir);

    // Set environment variables
    const env = {
      ...process.env,
      MCPAC_SERVERS_PATH: './servers',
      MCPAC_CONFIG_PATH: this.manager.getConfigPath(),
      MCPAC_WORKSPACE: absoluteWorkspaceDir,
    };

    return {
      workspaceDir: absoluteWorkspaceDir,
      serversDir: './servers',
      configPath: './config/mcp-servers.json',
      env,
    };
  }
}
