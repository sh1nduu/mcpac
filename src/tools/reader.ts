import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ToolInfo {
  serverName: string;
  toolName: string; // Original MCP tool name (file name, e.g., 'read_file', 'printEnv')
  functionName: string; // Same as toolName (original MCP name)
  description?: string;
  inputType: string;
  outputType: string;
  filePath: string;
  fullContent: string;
}

export interface ToolLocation {
  serverName: string;
  toolName: string;
  filePath: string;
}

/**
 * Utility to read and parse generated TypeScript tool files
 */
export class ToolsReader {
  constructor(private outputDir: string) {}

  /**
   * Check if the output directory exists
   */
  exists(): boolean {
    return existsSync(this.outputDir);
  }

  /**
   * Discover all server names from the _types.d.ts file
   * Returns server names in kebab-case (e.g., 'demo-filesystem')
   */
  async discoverServers(): Promise<string[]> {
    const typesPath = join(this.outputDir, '_types.d.ts');

    if (!existsSync(typesPath)) {
      return [];
    }

    const content = await readFile(typesPath, 'utf-8');

    // Extract server names from import statements
    // Example: import type { DemoFilesystemServer } from './demo-filesystem/index.d.ts';
    const importPattern = /import type \{[^}]+\} from '\.\/([^/]+)\/index\.d\.ts';/g;
    const matches = [...content.matchAll(importPattern)];

    return matches.map((match) => match[1]).filter((name): name is string => name !== undefined);
  }

  /**
   * List all tool names for a given server
   * Returns original MCP tool names (e.g., 'read_file', 'printEnv')
   */
  async listTools(serverName: string): Promise<string[]> {
    const serverDir = join(this.outputDir, serverName);
    const indexPath = join(serverDir, 'index.d.ts');

    if (!existsSync(indexPath)) {
      throw new Error(`Server '${serverName}' not found in generated code`);
    }

    const content = await readFile(indexPath, 'utf-8');

    // Extract tool file names from type export statements
    // Example: export type { ReadFileInput, ReadFileOutput, ReadFileMethod } from './read_file.d.ts';
    const exportPattern = /export type \{[^}]+\} from '\.\/([^']+)\.d\.ts';/g;
    const matches = [...content.matchAll(exportPattern)];

    return matches.map((match) => match[1]).filter((name): name is string => name !== undefined);
  }

  /**
   * Get detailed information about a specific tool
   */
  async getToolInfo(serverName: string, toolName: string): Promise<ToolInfo> {
    const serverDir = join(this.outputDir, serverName);
    const toolPath = join(serverDir, `${toolName}.d.ts`);

    if (!existsSync(toolPath)) {
      throw new Error(`Tool '${toolName}' not found in server '${serverName}'`);
    }

    const content = await readFile(toolPath, 'utf-8');

    // Tool name is the original MCP name (matches function name)
    const functionName = toolName;

    // Extract JSDoc description from the Method interface
    const jsdocMatch = content.match(/\/\*\*\n \* (.*?)\n \*\//);
    const description = jsdocMatch?.[1];

    // Extract Input interface name
    const inputMatch = content.match(/export interface (\w+Input)/);
    const inputType = inputMatch?.[1] || 'unknown';

    // Extract Output interface name
    const outputMatch = content.match(/export interface (\w+Output)/);
    const outputType = outputMatch?.[1] || 'unknown';

    return {
      serverName,
      toolName,
      functionName,
      description,
      inputType,
      outputType,
      filePath: toolPath,
      fullContent: content,
    };
  }

  /**
   * Search for a tool by function name across all servers
   * If serverName is provided, search only in that server
   */
  async searchTool(functionName: string, serverName?: string): Promise<ToolLocation | null> {
    const servers = serverName ? [serverName] : await this.discoverServers();

    for (const server of servers) {
      try {
        const tools = await this.listTools(server);

        for (const tool of tools) {
          const info = await this.getToolInfo(server, tool);

          if (info.functionName === functionName) {
            return {
              serverName: server,
              toolName: tool,
              filePath: info.filePath,
            };
          }
        }
      } catch {}
    }

    return null;
  }

  /**
   * Get all tools across all servers
   * Returns a map of server names to tool names
   */
  async getAllTools(serverName?: string): Promise<Map<string, string[]>> {
    const servers = serverName ? [serverName] : await this.discoverServers();
    const result = new Map<string, string[]>();

    for (const server of servers) {
      try {
        const tools = await this.listTools(server);
        result.set(server, tools);
      } catch {}
    }

    return result;
  }

  /**
   * Extract function names from tool files
   * Returns original MCP tool names (no conversion)
   */
  async getFunctionNames(serverName: string): Promise<string[]> {
    const tools = await this.listTools(serverName);
    const functionNames: string[] = [];

    for (const tool of tools) {
      try {
        const info = await this.getToolInfo(serverName, tool);
        functionNames.push(info.functionName);
      } catch {}
    }

    return functionNames;
  }
}
