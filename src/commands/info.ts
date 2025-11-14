import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Command } from 'commander';
import type { MCPServerConfig } from '../mcp/client.js';
import { MCPManager } from '../mcp/manager.js';
import { VERSION } from '../version.js';

export const infoCommand = new Command('info')
  .description('Show mcpac status and configuration')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      const configPath = process.env.MCPAC_CONFIG_PATH;
      const manager = MCPManager.getInstance(configPath);
      const config = await manager.loadConfig();
      const serverNames = Object.keys(config);

      const outputDir = './servers';
      const workspaceDir = process.env.MCPAC_WORKSPACE || './workspace';

      // Check generated code status
      const hasRuntime = existsSync(join(outputDir, '_mcpac_runtime.ts'));
      const generatedServers: string[] = [];

      if (existsSync(outputDir)) {
        const entries = await readdir(outputDir, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.isDirectory() && serverNames.includes(entry.name)) {
            generatedServers.push(entry.name);
          }
        }
      }

      // Count tools for each server
      const serverInfo: Record<
        string,
        { config: MCPServerConfig; toolCount?: number; generated: boolean }
      > = {};

      for (const name of serverNames) {
        const serverConfig = config[name];
        if (!serverConfig) continue;

        serverInfo[name] = {
          config: serverConfig,
          generated: generatedServers.includes(name),
        };

        // Try to count tools if generated
        const info = serverInfo[name];
        if (info?.generated) {
          try {
            const serverDir = join(outputDir, name);
            const files = await readdir(serverDir);
            // Count .ts files except index.ts
            info.toolCount = files.filter((f) => f.endsWith('.ts') && f !== 'index.ts').length;
          } catch {
            // Ignore errors counting tools
          }
        }
      }

      const isReady = hasRuntime && generatedServers.length === serverNames.length;

      if (options.json) {
        console.log(
          JSON.stringify(
            {
              version: VERSION,
              configPath: manager.getConfigPath(),
              outputDir,
              workspaceDir,
              configuredServers: serverNames.length,
              servers: serverInfo,
              generatedCodeExists: hasRuntime,
              generatedServers: generatedServers.length,
              ready: isReady,
            },
            null,
            2,
          ),
        );
      } else {
        console.log(`
📊 mcpac Status

Version: ${VERSION}
Config: ${manager.getConfigPath()}
Generated Code: ${outputDir}/
Workspace: ${workspaceDir}/

Configured Servers: ${serverNames.length}`);

        if (serverNames.length > 0) {
          for (const name of serverNames) {
            const info = serverInfo[name];
            if (!info) continue;
            const status = info.generated ? '✓' : '✗';
            const toolInfo = info.toolCount ? ` (${info.toolCount} tools)` : '';
            console.log(`  ${status} ${name}${toolInfo}`);
          }
        } else {
          console.log('  (none)');
        }

        console.log('\nGenerated Code Status:');
        if (hasRuntime) {
          console.log(`  ✓ ${outputDir}/_mcpac_runtime.ts`);
        } else {
          console.log(`  ✗ ${outputDir}/_mcpac_runtime.ts`);
        }

        if (generatedServers.length > 0) {
          for (const name of generatedServers) {
            const info = serverInfo[name];
            const toolCount = info?.toolCount || 0;
            console.log(`  ✓ ${outputDir}/${name}/ (${toolCount} tools)`);
          }
        }

        if (generatedServers.length < serverNames.length) {
          const missing = serverNames.filter((n) => !generatedServers.includes(n));
          for (const name of missing) {
            console.log(`  ✗ ${outputDir}/${name}/ (not generated)`);
          }
        }

        console.log(`\nReady to execute: ${isReady ? '✓' : '✗'}`);

        if (!isReady) {
          console.log('\n💡 Next steps:');
          if (serverNames.length === 0) {
            console.log(
              '  1. Add a server: mcpac server add <name> --command <cmd> --args <args...>',
            );
            console.log('  2. Generate code: mcpac generate');
          } else if (generatedServers.length === 0) {
            console.log('  Run: mcpac generate');
          } else if (generatedServers.length < serverNames.length) {
            console.log('  Run: mcpac generate');
          }
        } else {
          console.log("\n💡 Next: Run 'mcpac tools list -s <server>' to explore server tools");
          console.log("   Or: 'mcpac tools list' to see all available tools");
          console.log("   Try: 'mcpac tools call <name>' for quick tool invocation");
          console.log("   Guide: 'mcpac getting-started' for complete usage guide");
        }
      }
    } catch (error) {
      console.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
  });
