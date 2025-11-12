import type { MCPManager } from '../mcp/manager.js';
import { output } from '../utils/output.js';
import { CodeGenerator } from './codegen.js';
import { FilesystemManager, type GenerateOptions } from './filesystem.js';
import { SchemaParser } from './parser.js';

export class Generator {
  private parser: SchemaParser;
  private codegen: CodeGenerator;
  private fs: FilesystemManager;

  constructor(
    private manager: MCPManager,
    options: GenerateOptions = {},
  ) {
    this.parser = new SchemaParser(manager);
    this.codegen = new CodeGenerator();
    this.fs = new FilesystemManager(options);
  }

  /**
   * Generate code for the specified server
   */
  async generateServer(serverName: string): Promise<void> {
    output.info(`Generating code for ${serverName}...`);

    // Get tool definitions
    const tools = await this.parser.parseServer(serverName);

    if (tools.length === 0) {
      output.warn(`  ⚠ No tools found for ${serverName}`);
      return;
    }

    // Generate code for each tool
    const toolNames: string[] = [];
    for (const tool of tools) {
      try {
        const code = await this.codegen.generateToolCode(tool);
        await this.fs.writeToolFile(serverName, tool.toolName, code);
        toolNames.push(tool.toolName);
        output.verbose(`  ✓ ${tool.toolName}`);
      } catch (error) {
        output.error(
          `  ✗ ${tool.toolName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Generate index.ts
    if (toolNames.length > 0) {
      const indexCode = this.codegen.generateServerIndex(toolNames);
      await this.fs.writeServerIndex(serverName, indexCode);
      output.info(`✓ Generated ${toolNames.length} tools for ${serverName}`);
    }
  }

  /**
   * Generate code for all servers
   */
  async generateAll(): Promise<void> {
    const servers = await this.manager.listServers();

    if (servers.length === 0) {
      output.warn('No servers configured');
      output.info('Use "mcpac server add <name>" to add a server first');
      return;
    }

    output.info(`Generating code for ${servers.length} server(s)...\n`);

    await this.fs.ensureOutputDir();
    await this.fs.ensureRuntimeShim();

    const successfulServers: string[] = [];
    for (const serverName of servers) {
      try {
        await this.generateServer(serverName);
        successfulServers.push(serverName);
        if (!output.isQuiet()) {
          console.log(); // Empty line
        }
      } catch (error) {
        output.error(
          `✗ Failed to generate ${serverName}: ${error instanceof Error ? error.message : String(error)}\n`,
        );
      }
    }

    if (successfulServers.length > 0) {
      // Generate root index.ts
      const rootIndexCode = this.codegen.generateRootIndex(successfulServers);
      await this.fs.writeRootIndex(rootIndexCode);
    } else {
      output.error('✗ No servers were successfully generated');
      throw new Error('No servers were successfully generated');
    }
  }
}

export type { GeneratedCode } from './codegen.js';
// Export for external use
export type { GenerateOptions } from './filesystem.js';
export type { ToolDefinition } from './parser.js';
