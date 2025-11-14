import type { Command } from 'commander';
import { ContextManager } from '../executor/context.js';
import type { ExecutionResult } from '../executor/ipc-executor.js';
import { IPCExecutor } from '../executor/ipc-executor.js';
import { ResultHandler } from '../executor/result.js';
import { TypeChecker } from '../executor/type-checker.js';
import { MCPManager } from '../mcp/manager.js';
import { output } from '../utils/output.js';

export function executeCommand(program: Command): void {
  program
    .command('execute')
    .description('Execute code with MCP servers as libraries')
    .option('-f, --file <path>', 'Execute code from file')
    .option('-c, --code <code>', 'Execute code string')
    .option('--stdin', 'Read code from stdin')
    .option('-w, --workspace <dir>', 'Workspace directory', './workspace')
    .option(
      '--grant <permissions>',
      'Grant permissions (comma-separated, e.g., "filesystem.read_file,filesystem.write_file")',
    )
    .option('--dry-run', 'Validate without executing')
    .option('--timeout <ms>', 'Execution timeout in milliseconds', '120000')
    .option('--typecheck', 'Type-check code before execution (default: true)')
    .option('--no-typecheck', 'Skip type checking')
    .option('-q, --quiet', 'Suppress non-critical output')
    .option('-v, --verbose', 'Show detailed output including MCP server logs')
    .addHelpText(
      'after',
      `
Examples:
  $ mcpac execute -f script.ts --grant filesystem.read_file    # Execute with permissions
  $ mcpac execute -f script.ts --grant filesystem.read_file,filesystem.write_file
  $ mcpac execute -c "import {filesystem} from './servers'; ..."  # Execute inline
  $ cat script.ts | mcpac execute --stdin     # Execute from stdin

Prerequisites:
  • Code must be generated first
    Run 'mcpac generate' to generate code from configured servers
  • Import generated code from './servers/' directory
    Example: import { filesystem } from './servers/index.js';
  • Discover available functions
    Run 'mcpac tools list' to see all available tools

Code Structure:
  Your code must:
    • Import from './servers/index.js' or './servers/<server-name>/index.js'
    • Use top-level await for async operations
    • Handle MCP response structure (result.content is an array)

Example Code:
  import { filesystem } from './servers/index.js';
  const result = await filesystem.listDirectory({ path: '.' });
  const text = result.content.find(c => c.type === 'text')?.text;
  console.log(text);
`,
    )
    .action(async (options) => {
      try {
        // Set output level based on flags
        if (options.quiet) {
          output.setLevel('quiet');
        } else if (options.verbose) {
          output.setLevel('verbose');
        }

        // Verify input source
        const sources = [options.file, options.code, options.stdin].filter(Boolean);
        if (sources.length === 0) {
          output.error('Error: Specify one of --file, --code, or --stdin');
          output.error('Hint: mcpac execute --file script.ts');
          process.exit(1);
        }
        if (sources.length > 1) {
          output.error('Error: Specify only one of --file, --code, or --stdin');
          process.exit(1);
        }

        // Initialize
        const configPath = process.env.MCPAC_CONFIG_PATH;
        const manager = MCPManager.getInstance(configPath);

        const contextMgr = new ContextManager(manager);
        const resultHandler = new ResultHandler();
        const typeChecker = new TypeChecker();

        // Parse granted permissions
        const grantedPermissions: string[] = [];
        if (options.grant) {
          const perms = options.grant
            .split(',')
            .map((p: string) => p.trim())
            .filter((p: string) => p.length > 0);
          grantedPermissions.push(...perms);

          if (grantedPermissions.length > 0) {
            output.verbose(`Granted permissions: ${grantedPermissions.join(', ')}`);
          }
        }

        // Prepare context
        output.info('Preparing execution context...');
        const context = await contextMgr.prepareContext(options.workspace);
        if (!output.isQuiet()) {
          console.log();
        }

        // Read stdin once if needed (stdin can only be read once)
        let stdinCode: string | undefined;
        if (options.stdin) {
          stdinCode = await Bun.stdin.text();
        }

        // Type checking (if enabled)
        const shouldTypeCheck = options.typecheck !== false && process.env.MCPAC_TYPECHECK !== '0';

        if (shouldTypeCheck) {
          output.verbose('Type checking code...');
          let typeCheckResult: Awaited<ReturnType<typeof typeChecker.checkFile>> | undefined;

          if (options.file) {
            typeCheckResult = await typeChecker.checkFile(options.file, context);
          } else if (options.code) {
            typeCheckResult = await typeChecker.checkCode(options.code, context);
          } else if (stdinCode !== undefined) {
            typeCheckResult = await typeChecker.checkCode(stdinCode, context);
          }

          if (typeCheckResult?.hasErrors) {
            output.error('\nType check failed:');
            output.error(typeChecker.formatErrors(typeCheckResult.errors));
            output.error('\nHint: Fix type errors or use --no-typecheck to skip validation');
            process.exit(1);
          }

          output.verbose('✓ Type check passed');
        }

        let result: ExecutionResult | undefined;

        const ipcExecutor = new IPCExecutor();
        const timeout = parseInt(options.timeout, 10);

        if (options.file) {
          output.info(`Executing: ${options.file}`);
          result = await ipcExecutor.executeFile(options.file, {
            mcpManager: manager,
            context,
            grantedPermissions,
            timeout,
            dryRun: options.dryRun,
          });
        } else if (options.code) {
          output.info('Executing code...');
          result = await ipcExecutor.executeCode(options.code, {
            mcpManager: manager,
            context,
            grantedPermissions,
            timeout,
            dryRun: options.dryRun,
          });
        } else if (stdinCode !== undefined) {
          output.info('Executing code from stdin...');
          result = await ipcExecutor.executeCode(stdinCode, {
            mcpManager: manager,
            context,
            grantedPermissions,
            timeout,
            dryRun: options.dryRun,
          });
        }

        if (result) {
          // Display result
          resultHandler.displayResult(result);
          resultHandler.displaySummary(result);

          process.exit(resultHandler.getExitCode(result));
        }
      } catch (error) {
        output.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });
}
