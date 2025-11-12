import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ToolInfo {
  serverName: string;
  toolName: string; // snake_case (file name)
  functionName: string; // camelCase (function name)
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
   * Discover all server names from the root index.ts
   * Returns server names in kebab-case (e.g., 'demo-filesystem')
   */
  async discoverServers(): Promise<string[]> {
    const indexPath = join(this.outputDir, 'index.ts');

    if (!existsSync(indexPath)) {
      return [];
    }

    const content = await readFile(indexPath, 'utf-8');

    // Extract server names from import statements
    // Example: import * as demoFilesystem from './demo-filesystem/index.js';
    const importPattern = /import \* as \w+ from '\.\/([^/]+)\/index\.js';/g;
    const matches = [...content.matchAll(importPattern)];

    return matches.map((match) => match[1]).filter((name): name is string => name !== undefined);
  }

  /**
   * List all tool names for a given server
   * Returns tool names in snake_case (e.g., 'read_file')
   */
  async listTools(serverName: string): Promise<string[]> {
    const serverDir = join(this.outputDir, serverName);
    const indexPath = join(serverDir, 'index.ts');

    if (!existsSync(indexPath)) {
      throw new Error(`Server '${serverName}' not found in generated code`);
    }

    const content = await readFile(indexPath, 'utf-8');

    // Extract tool file names from export statements
    // Example: export * from './read_file.js';
    const exportPattern = /export \* from '\.\/([^']+)\.js';/g;
    const matches = [...content.matchAll(exportPattern)];

    return matches.map((match) => match[1]).filter((name): name is string => name !== undefined);
  }

  /**
   * Get detailed information about a specific tool
   */
  async getToolInfo(serverName: string, toolName: string): Promise<ToolInfo> {
    const serverDir = join(this.outputDir, serverName);
    const toolPath = join(serverDir, `${toolName}.ts`);

    if (!existsSync(toolPath)) {
      throw new Error(`Tool '${toolName}' not found in server '${serverName}'`);
    }

    const content = await readFile(toolPath, 'utf-8');

    // Extract function name (camelCase)
    const functionMatch = content.match(/export async function (\w+)\(/);
    const functionName = functionMatch?.[1] || toolName;

    // Extract JSDoc description
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
   * Converts snake_case tool names to camelCase function names
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
