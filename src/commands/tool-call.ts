/**
 * Command to call a specific MCP tool directly from CLI
 */

import { Command } from 'commander';
import { MCPManager } from '../mcp/manager.js';
import { parseArguments } from '../tools/argument-parser.js';
import { formatOutput, type OutputFormat } from '../tools/output-formatter.js';
import { ToolsReader } from '../tools/reader.js';
import { validateArguments } from '../tools/schema-validator.js';
import { debugLog, debugVerbose } from '../utils/debug.js';
import { output } from '../utils/output.js';

interface CallOptions {
  json?: string;
  stdin?: boolean;
  server?: string;
  validate: boolean;
  outputFormat: OutputFormat;
  quiet?: boolean;
  verbose?: boolean;
}

/**
 * Create the 'tools call' command
 */
export function createToolCallCommand(): Command {
  const command = new Command('call')
    .description('Call a generated tool function directly')
    .argument(
      '<function_name>',
      'Name of the MCP tool (original format, e.g., read_file or printEnv)',
    )
    .option('--json <string>', 'Arguments as JSON string')
    .option('--stdin', 'Read arguments from stdin as JSON')
    .option('-s, --server <name>', 'Specify server if function name is ambiguous')
    .option('--no-validate', 'Skip schema validation')
    .option('--output-format <format>', 'Output format: text|json|raw', 'text')
    .option('-q, --quiet', 'Suppress non-error output')
    .option('-v, --verbose', 'Verbose output')
    .allowUnknownOption() // Allow named flags for arguments
    .action(async (functionName: string, options: CallOptions, command) => {
      try {
        await executeToolCall(functionName, options, command);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        output.error(errorMsg);

        // Clean up: close all MCP connections before exit
        const configPath = process.env.MCPAC_CONFIG_PATH || './config/mcp-servers.json';
        const manager = MCPManager.getInstance(configPath);
        await manager.closeAll();

        process.exit(1);
      }
    });

  return command;
}

/**
 * Execute a tool call with the provided arguments
 */
async function executeToolCall(
  functionName: string,
  options: CallOptions,
  command: Command,
): Promise<void> {
  // Set debug levels
  if (options.verbose) {
    process.env.MCPAC_DEBUG = 'verbose';
  } else if (options.quiet) {
    process.env.MCPAC_DEBUG = 'quiet';
  }

  debugVerbose(`Calling tool function: ${functionName}`);
  debugVerbose(`Options: ${JSON.stringify(options, null, 2)}`);

  // 1. Find the tool by function name
  const outputDir = process.env.MCPAC_SERVERS_PATH || './servers';
  const reader = new ToolsReader(outputDir);

  if (!reader.exists()) {
    throw new Error('Generated code not found. Run "mcpac generate" first.');
  }

  debugLog(`Searching for function: ${functionName}`);
  const toolLocation = await reader.searchTool(functionName, options.server);

  if (!toolLocation) {
    if (options.server) {
      throw new Error(`Function '${functionName}' not found in server '${options.server}'`);
    }
    throw new Error(
      `Function '${functionName}' not found. Run "mcpac tools list" to see available tools.`,
    );
  }

  const { serverName, toolName } = toolLocation;
  debugLog(`Found tool: ${serverName}.${toolName}`);

  // 2. Connect to MCP server and get schema
  const configPath = process.env.MCPAC_CONFIG_PATH || './config/mcp-servers.json';
  const manager = MCPManager.getInstance(configPath);

  debugLog(`Connecting to server: ${serverName}`);
  const client = await manager.getClient(serverName);

  debugLog(`Fetching tool schema for: ${toolName}`);
  const tools = await client.listTools();

  // No conversion needed - use original MCP tool name directly
  // The naming system ensures tool names are preserved as-is
  const toolDef = tools.find((t) => t.name === toolName);

  if (!toolDef) {
    throw new Error(`Tool '${toolName}' not found in server '${serverName}'`);
  }

  // 3. Parse arguments
  debugLog('Parsing arguments');
  const commanderOpts = command.opts();
  const commanderArgs = command.args;
  const { args, source } = await parseArguments({
    jsonString: options.json,
    useStdin: options.stdin,
    commanderOpts,
    commanderArgs,
    inputSchema: toolDef.inputSchema,
  });

  debugVerbose(`Arguments source: ${source}`);
  debugVerbose(`Parsed arguments: ${JSON.stringify(args, null, 2)}`);

  // 4. Validate arguments (if not disabled)
  if (options.validate && toolDef.inputSchema) {
    debugLog('Validating arguments against schema');
    const validation = validateArguments(args, toolDef.inputSchema);

    if (!validation.valid) {
      throw new Error(
        `Invalid arguments for tool '${functionName}':\n${validation.errors?.map((e) => `  - ${e}`).join('\n')}`,
      );
    }
    debugLog('Arguments validated successfully');
  }

  // 5. Execute tool
  debugLog(`Executing tool: ${serverName}.${toolName}`);
  const result = await client.callTool(toolName, args);
  debugVerbose(`Raw result: ${JSON.stringify(result, null, 2)}`);

  // 6. Format and output result
  const formatted = formatOutput(result, {
    format: options.outputFormat,
    serverName,
    toolName,
  });

  if (!options.quiet || formatted.exitCode !== 0) {
    if (formatted.exitCode === 0) {
      output.info(formatted.content);
    } else {
      output.error(formatted.content);
    }
  }

  // 7. Clean up: close all MCP connections
  await manager.closeAll();

  // Exit with appropriate code
  if (formatted.exitCode !== 0) {
    process.exit(formatted.exitCode);
  }
}
