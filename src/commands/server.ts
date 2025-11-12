import type { Command } from 'commander';
import { MCPManager } from '../mcp/manager.js';

export function serverCommand(program: Command): void {
  const server = program.command('server');
  server.description('Manage MCP servers');

  // server add
  server
    .command('add <name>')
    .description('Add a new MCP server')
    .option('--type <type>', 'Transport type: stdio or http (default: stdio)')
    // STDIO options
    .option('--command <cmd>', 'Command to run the server (required for stdio)')
    .option('--args <args...>', 'Arguments for the command (stdio only)')
    // HTTP options
    .option('--url <url>', 'Server URL (required for http)')
    .option('--headers <pairs...>', 'HTTP headers as KEY=VALUE pairs (http only)')
    // Common options
    .option('--env <pairs...>', 'Environment variables (KEY=VALUE)')
    .addHelpText(
      'after',
      `
Examples (STDIO):
  $ mcpac server add filesystem --command npx \\
      --args @modelcontextprotocol/server-filesystem \\
      --args ./workspace

  $ mcpac server add github --command npx \\
      --args @modelcontextprotocol/server-github \\
      --env GITHUB_TOKEN=your_token_here

Examples (HTTP):
  $ mcpac server add github-server --type http \\
      --url https://api.githubcopilot.com/mcp \\
      --headers "Authorization=Bearer your_token_here"

  $ mcpac server add custom-server --type http \\
      --url https://example.com/mcp \\
      --headers "X-API-Key=key123" \\
      --headers "X-Custom-Header=value"
`,
    )
    .action(async (name, options) => {
      try {
        const configPath = process.env.MCPC_CONFIG_PATH;
        const manager = MCPManager.getInstance(configPath);

        const transportType = options.type || 'stdio';

        // Parse environment variables (common to both transports)
        const env: Record<string, string> = {};
        if (options.env) {
          for (const pair of options.env) {
            const [key, ...valueParts] = pair.split('=');
            if (key && valueParts.length > 0) {
              env[key] = valueParts.join('=');
            }
          }
        }

        if (transportType === 'stdio') {
          // Validate STDIO required options
          if (!options.command) {
            throw new Error('--command is required for stdio transport');
          }

          await manager.addServer(name, {
            type: 'stdio',
            command: options.command,
            args: options.args || [],
            env: Object.keys(env).length > 0 ? env : undefined,
          });
        } else if (transportType === 'http') {
          // Validate HTTP required options
          if (!options.url) {
            throw new Error('--url is required for http transport');
          }

          // Parse headers
          const headers: Record<string, string> = {};
          if (options.headers) {
            for (const pair of options.headers) {
              const [key, ...valueParts] = pair.split('=');
              if (key && valueParts.length > 0) {
                headers[key] = valueParts.join('=');
              }
            }
          }

          await manager.addServer(name, {
            type: 'http',
            url: options.url,
            headers: Object.keys(headers).length > 0 ? headers : undefined,
            env: Object.keys(env).length > 0 ? env : undefined,
          });
        } else {
          throw new Error(`Invalid transport type: ${transportType}. Must be 'stdio' or 'http'`);
        }

        console.log(`✓ Server '${name}' added successfully (${transportType} transport)`);
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // server list
  server
    .command('list')
    .description('List all configured servers')
    .action(async () => {
      try {
        const configPath = process.env.MCPC_CONFIG_PATH;
        const manager = MCPManager.getInstance(configPath);
        const servers = await manager.listServers();

        if (servers.length === 0) {
          console.log('No servers configured');
          console.log('Hint: Use "mcpac server add" to add a server');
          return;
        }

        console.log(`Configured servers (${servers.length}):`);
        for (const name of servers) {
          const config = await manager.getServerConfig(name);
          console.log(`  • ${name}`);

          if (config.type === 'stdio' || 'command' in config) {
            const configTyped = config as any;
            console.log(`    Type: STDIO`);
            console.log(`    Command: ${configTyped.command} ${configTyped.args?.join(' ') || ''}`);
          } else if (config.type === 'http' || 'url' in config) {
            const configTyped = config as any;
            console.log(`    Type: HTTP`);
            console.log(`    URL: ${configTyped.url}`);
            if (configTyped.headers) {
              const headerKeys = Object.keys(configTyped.headers);
              console.log(`    Headers: ${headerKeys.join(', ')}`);
            }
          }
        }
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // server remove
  server
    .command('remove <name>')
    .description('Remove a server')
    .action(async (name) => {
      try {
        const configPath = process.env.MCPC_CONFIG_PATH;
        const manager = MCPManager.getInstance(configPath);
        await manager.removeServer(name);
        console.log(`✓ Server '${name}' removed`);
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      }
    });

  // server test
  server
    .command('test <name>')
    .description('Test connection to a server')
    .action(async (name) => {
      const configPath = process.env.MCPC_CONFIG_PATH;
      const manager = MCPManager.getInstance(configPath);

      try {
        console.log(`Testing connection to '${name}'...`);

        const success = await manager.testConnection(name);

        if (success) {
          const client = await manager.getClient(name);
          const tools = await client.listTools();
          console.log(`✓ Connection successful`);
          console.log(`  Available tools: ${tools.length}`);
        } else {
          console.error(`✗ Connection failed`);
          process.exit(1);
        }
      } catch (error) {
        console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
        process.exit(1);
      } finally {
        // Always close the connection
        await manager.closeAll();
      }
    });
}
