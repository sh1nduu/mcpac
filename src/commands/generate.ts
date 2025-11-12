import type { Command } from 'commander';
import { Generator } from '../generator/index.js';
import { MCPManager } from '../mcp/manager.js';
import { output } from '../utils/output.js';

export function generateCommand(program: Command): void {
  program
    .command('generate')
    .description('Generate TypeScript code from MCP servers')
    .option('-s, --server <name>', 'Generate code for specific server only')
    .option('-f, --force', 'Force overwrite existing files')
    .option('-o, --output <dir>', 'Output directory', './servers')
    .option('-q, --quiet', 'Suppress non-critical output')
    .option('-v, --verbose', 'Show detailed output')
    .addHelpText(
      'after',
      `
Examples:
  $ mcpac generate                    # Generate code for all servers
  $ mcpac generate -s filesystem      # Generate code for specific server
  $ mcpac generate --force            # Overwrite existing code

Prerequisites:
  • At least one server must be configured
    Run 'mcpac server list' to check configured servers
  • MCP servers must be accessible
    Run 'mcpac server test <name>' to verify connectivity

Output:
  Generated files will be placed in ./servers/ directory:
    • _mcpc_runtime.ts       - Runtime library for MCP communication
    • <server-name>/<tool>.ts  - Type-safe tool functions
    • index.ts                 - Main exports

Next Steps:
  • Explore tools: mcpac tools list
  • View function details: mcpac tools describe <function_name>
  • Run examples: mcpac examples
`,
    )
    .action(async (options) => {
      // Set output level based on flags
      if (options.quiet) {
        output.setLevel('quiet');
      } else if (options.verbose) {
        output.setLevel('verbose');
      }

      const configPath = process.env.MCPC_CONFIG_PATH;
      const manager = MCPManager.getInstance(configPath);

      try {
        const generator = new Generator(manager, {
          outputDir: options.output,
          force: options.force,
        });

        if (options.server) {
          // Specific server only
          output.info(`Generating code for '${options.server}'...\n`);
          await generator.generateServer(options.server);
          output.success('\n✓ Code generation complete');
          output.info(`  Output: ${options.output}`);
          output.info(
            `\n💡 Next: Run 'mcpac tools list -s ${options.server}' to explore available tools`,
          );
        } else {
          // All servers
          const servers = await manager.listServers();

          if (servers.length === 0) {
            output.error('No MCP servers configured.\n');
            output.error('Run these commands to get started:');
            output.error('  1. mcpac server add <name> --command <cmd> --args <args...>');
            output.error('  2. mcpac generate\n');
            output.error('Or run: mcpac getting-started');
            process.exit(1);
          }

          output.info(`Generating code for ${servers.length} server(s)...\n`);
          await generator.generateAll();
          output.success('\n✓ Code generation complete');
          output.info(`  Generated code for ${servers.length} server(s)`);
          output.info(`  Output: ${options.output}`);
          output.info(`  Runtime: ${options.output}/_mcpc_runtime.ts`);
          output.info(`\n💡 Next: Run 'mcpac tools list' to explore available tools`);
        }
      } catch (error) {
        output.error(`\nError: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      } finally {
        // Always close connections
        await manager.closeAll();
      }
    });
}
