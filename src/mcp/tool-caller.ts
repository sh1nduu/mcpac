import { MCPManager } from './manager.js';

/**
 * Common function to call MCP tools
 * Used by generated code
 *
 * @param serverName MCP server name
 * @param toolName Tool name
 * @param input Input parameters for the tool
 * @returns Tool execution result
 * @throws Tool execution error or connection error
 */
export async function callMCPTool<T = unknown>(
  serverName: string,
  toolName: string,
  input: Record<string, unknown>,
): Promise<T> {
  // Get config path from environment variable
  const configPath = process.env.MCPAC_CONFIG_PATH || './config/mcp-servers.json';
  const manager = MCPManager.getInstance(configPath);

  try {
    const client = await manager.getClient(serverName);
    const result = await client.callTool(toolName, input);

    if (result.isError) {
      // Tool execution error
      throw new Error(
        `MCP Tool Error [${serverName}.${toolName}]: ${JSON.stringify(result.content)}`,
      );
    }

    return result.content as T;
  } catch (error) {
    // Re-throw error with more details
    if (error instanceof Error) {
      throw error;
    }
    throw new Error(`Unknown error calling ${serverName}.${toolName}: ${String(error)}`);
  }
}
