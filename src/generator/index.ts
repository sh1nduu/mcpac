import type { MCPManager } from '../mcp/manager.js';
import { output } from '../utils/output.js';
import { CodeGenerator } from './codegen.js';
import { FilesystemManager, type GenerateOptions } from './filesystem.js';
import { SchemaParser, type ToolDefinition } from './parser.js';

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
   * Returns the tool definitions that were successfully generated
   */
  async generateServer(serverName: string): Promise<ToolDefinition[]> {
    output.info(`Generating code for ${serverName}...`);

    // Get tool definitions
    const tools = await this.parser.parseServer(serverName);

    if (tools.length === 0) {
      output.warn(`  ⚠ No tools found for ${serverName}`);
      return [];
    }

    // Generate .d.ts type definitions for each tool
    const successfulTools: ToolDefinition[] = [];
    for (const tool of tools) {
      try {
        const typeCode = await this.codegen.generateToolTypeDefinition(tool);
        await this.fs.writeToolTypeDefinition(serverName, tool.toolName, typeCode);
        successfulTools.push(tool);
        output.verbose(`  ✓ ${tool.toolName}`);
      } catch (error) {
        output.error(
          `  ✗ ${tool.toolName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    // Generate server index.d.ts (type aggregation)
    if (successfulTools.length > 0) {
      const indexTypeCode = this.codegen.generateServerIndexTypes(serverName, successfulTools);
      await this.fs.writeServerIndexTypes(serverName, indexTypeCode);
      output.info(`✓ Generated ${successfulTools.length} tools for ${serverName}`);
    }

    return successfulTools;
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

    const successfulServers: string[] = [];
    const allTools: ToolDefinition[] = [];

    // Generate code for each server and collect tool definitions
    for (const serverName of servers) {
      try {
        const tools = await this.generateServer(serverName);
        if (tools.length > 0) {
          successfulServers.push(serverName);
          allTools.push(...tools);
        }
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
      // Generate runtime shim with all tools for createRuntime implementation
      output.info('Generating runtime with capability system...');
      await this.fs.writeRuntimeShim(allTools);
      output.info('✓ Generated runtime\n');

      // Generate type definitions file (_types.d.ts) for capability system
      output.info('Generating type definitions for capability system...');
      const typeDefinitionsCode = this.codegen.generateTypeDefinitions(allTools);
      await this.fs.writeTypeDefinitions(typeDefinitionsCode);
      output.info('✓ Generated type definitions\n');

      // Generate global.d.ts with MCPaC ambient namespace
      output.info('Generating global types (MCPaC namespace)...');
      const globalTypesCode = this.codegen.generateGlobalTypes();
      await this.fs.writeGlobalTypes(globalTypesCode);
      output.info('✓ Generated global types\n');
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
