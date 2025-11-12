import type { Command } from 'commander';
import { ToolsReader } from '../tools/reader.js';
import { createToolCallCommand } from './tool-call.js';

export function toolsCommand(program: Command): void {
  const tools = program.command('tools');
  tools.description('Explore generated TypeScript tools');

  // tools call - call a tool directly
  tools.addCommand(createToolCallCommand());

  // tools list [--server <name>] [--output <dir>]
  tools
    .command('list')
    .description('List all exported functions from generated code')
    .option('-s, --server <name>', 'Filter by specific server')
    .option('-o, --output <dir>', 'Generated code directory', './servers')
    .action(async (options) => {
      try {
        const reader = new ToolsReader(options.output);

        // Check if output directory exists
        if (!reader.exists()) {
          console.error(`Error: Generated code directory '${options.output}' not found`);
          console.error('Hint: Run "mcpac generate" first to generate TypeScript code');
          process.exit(1);
        }

        // Get all tools
        const toolsMap = await reader.getAllTools(options.server);

        if (toolsMap.size === 0) {
          if (options.server) {
            console.error(`Error: Server '${options.server}' not found in generated code`);
          } else {
            console.error('Error: No generated servers found');
            console.error('Hint: Run "mcpac generate" first');
          }
          process.exit(1);
        }

        // Calculate total tool count
        let totalTools = 0;
        for (const tools of toolsMap.values()) {
          totalTools += tools.length;
        }

        // Display results
        console.log(`Available tools (${totalTools}):`);

        for (const [serverName, tools] of toolsMap) {
          console.log(`  ${serverName} (${tools.length} tools):`);

          // Get function names for display
          const functionNames = await reader.getFunctionNames(serverName);

          for (const funcName of functionNames) {
            console.log(`    • ${funcName}`);
          }
        }
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // tools describe <function_name> [--server <name>] [--output <dir>]
  tools
    .command('describe <function_name>')
    .description('Show detailed function signature and types')
    .option('-s, --server <name>', 'Filter by specific server')
    .option('-o, --output <dir>', 'Generated code directory', './servers')
    .action(async (functionName, options) => {
      try {
        const reader = new ToolsReader(options.output);

        // Check if output directory exists
        if (!reader.exists()) {
          console.error(`Error: Generated code directory '${options.output}' not found`);
          console.error('Hint: Run "mcpac generate" first to generate TypeScript code');
          process.exit(1);
        }

        // Search for the tool
        const location = await reader.searchTool(functionName, options.server);

        if (!location) {
          if (options.server) {
            console.error(
              `Error: Function '${functionName}' not found in server '${options.server}'`,
            );
          } else {
            console.error(`Error: Function '${functionName}' not found in any server`);
          }
          console.error('Hint: Use "mcpac tools list" to see available functions');
          process.exit(1);
        }

        // Get detailed tool information
        const info = await reader.getToolInfo(location.serverName, location.toolName);

        // Display detailed information
        console.log(`Function: ${info.functionName}`);
        console.log(`Server: ${info.serverName}`);
        console.log(`File: ${info.filePath}`);
        console.log('');

        if (info.description) {
          console.log('Description:');
          console.log(`  ${info.description}`);
          console.log('');
        }

        console.log('Generated code:');
        console.log('────────────────────────────────────────');
        console.log(info.fullContent);
        console.log('────────────────────────────────────────');
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
}
