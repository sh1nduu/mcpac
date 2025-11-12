import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { MCPClient, type MCPServerConfig } from './client.js';

export interface ServerRegistry {
  [serverName: string]: MCPServerConfig;
}

export class MCPManager {
  private static instance: MCPManager | null = null;
  private clients: Map<string, MCPClient> = new Map();
  private configPath: string;
  private isClosing: boolean = false;
  private isClosed: boolean = false;

  private constructor(configPath: string = './config/mcp-servers.json') {
    this.configPath = configPath;
  }

  static getInstance(configPath?: string): MCPManager {
    if (!MCPManager.instance) {
      MCPManager.instance = new MCPManager(configPath);
    }
    return MCPManager.instance;
  }

  /**
   * Get config file path
   */
  getConfigPath(): string {
    return this.configPath;
  }

  /**
   * Load config file
   */
  async loadConfig(): Promise<ServerRegistry> {
    if (!existsSync(this.configPath)) {
      await this.ensureConfigDir();
      await this.saveConfig({});
      return {};
    }

    try {
      const content = await readFile(this.configPath, 'utf-8');
      const config = JSON.parse(content);
      return config.mcpServers || {};
    } catch (error) {
      throw new Error(
        `Failed to load config from '${this.configPath}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Save to config file
   */
  async saveConfig(config: ServerRegistry): Promise<void> {
    try {
      await this.ensureConfigDir();
      const wrappedConfig = { mcpServers: config };
      await writeFile(this.configPath, JSON.stringify(wrappedConfig, null, 2), 'utf-8');
    } catch (error) {
      throw new Error(
        `Failed to save config to '${this.configPath}': ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Ensure config directory exists
   */
  private async ensureConfigDir(): Promise<void> {
    const dir = dirname(this.configPath);
    if (!existsSync(dir)) {
      await mkdir(dir, { recursive: true });
    }
  }

  /**
   * Add server
   */
  async addServer(name: string, config: MCPServerConfig): Promise<void> {
    const registry = await this.loadConfig();

    if (registry[name]) {
      throw new Error(`Server '${name}' already exists`);
    }

    registry[name] = config;
    await this.saveConfig(registry);
  }

  /**
   * Remove server
   */
  async removeServer(name: string): Promise<void> {
    const registry = await this.loadConfig();

    if (!registry[name]) {
      throw new Error(`Server '${name}' not found`);
    }

    delete registry[name];
    await this.saveConfig(registry);

    // Disconnect connected client if exists
    const client = this.clients.get(name);
    if (client) {
      await client.close();
      this.clients.delete(name);
    }
  }

  /**
   * Get server list
   */
  async listServers(): Promise<string[]> {
    const registry = await this.loadConfig();
    return Object.keys(registry);
  }

  /**
   * Get server config
   */
  async getServerConfig(name: string): Promise<MCPServerConfig> {
    const registry = await this.loadConfig();
    const config = registry[name];

    if (!config) {
      throw new Error(`Server '${name}' not found`);
    }

    return config;
  }

  /**
   * Get MCP client (create and connect if not exists)
   */
  async getClient(serverName: string): Promise<MCPClient> {
    // Reuse existing client if available
    let client = this.clients.get(serverName);
    if (client?.isConnected()) {
      return client;
    }

    // Create client from config
    const config = await this.getServerConfig(serverName);
    client = new MCPClient(serverName, config);

    try {
      await client.connect();
      this.clients.set(serverName, client);
      return client;
    } catch (error) {
      // Remove client on connection failure
      this.clients.delete(serverName);
      throw error;
    }
  }

  /**
   * Test server connection
   */
  async testConnection(serverName: string): Promise<boolean> {
    try {
      const client = await this.getClient(serverName);
      await client.listTools();
      return true;
    } catch (error) {
      console.error(`Connection test failed for '${serverName}':`, error);
      return false;
    }
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    // Do nothing if already closed
    if (this.isClosed || this.isClosing) {
      return;
    }

    this.isClosing = true;

    try {
      const closePromises: Promise<void>[] = [];

      for (const [name, client] of this.clients) {
        closePromises.push(
          client.close().catch((error) => {
            console.error(`Error closing connection to '${name}':`, error);
          }),
        );
      }

      await Promise.all(closePromises);
      this.clients.clear();
      this.isClosed = true;
    } finally {
      this.isClosing = false;
    }
  }

  /**
   * Cleanup on process exit
   */
  setupCleanup(): void {
    const cleanup = async () => {
      await this.closeAll();
      process.exit(0);
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
  }
}
