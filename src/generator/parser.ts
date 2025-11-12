import type { MCPManager } from '../mcp/manager.js';

export interface ToolDefinition {
  serverName: string;
  toolName: string;
  description?: string;
  inputSchema: unknown;
}

export class SchemaParser {
  constructor(private manager: MCPManager) {}

  /**
   * Get tool definitions for specified server
   */
  async parseServer(serverName: string): Promise<ToolDefinition[]> {
    const client = await this.manager.getClient(serverName);
    const tools = await client.listTools();

    return tools.map((tool) => ({
      serverName,
      toolName: tool.name,
      description: tool.description,
      inputSchema: this.normalizeSchema(tool.inputSchema),
    }));
  }

  /**
   * Get tool definitions for all servers
   */
  async parseAll(): Promise<Map<string, ToolDefinition[]>> {
    const servers = await this.manager.listServers();
    const result = new Map<string, ToolDefinition[]>();

    for (const serverName of servers) {
      try {
        const tools = await this.parseServer(serverName);
        result.set(serverName, tools);
        console.log(`  ✓ ${serverName} (${tools.length} tools)`);
      } catch (error) {
        console.error(
          `  ✗ ${serverName}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    return result;
  }

  /**
   * Normalize JSON Schema to Draft 2020-12
   */
  normalizeSchema(schema: unknown): unknown {
    if (typeof schema !== 'object' || schema === null) {
      return schema;
    }

    const normalized = { ...(schema as Record<string, unknown>) };

    // Set Draft 2020-12 if $schema is not present
    if (!normalized.$schema) {
      normalized.$schema = 'https://json-schema.org/draft/2020-12/schema';
    }

    // Convert Draft-07 array definition
    // If items is an array → convert to prefixItems
    if (Array.isArray(normalized.items)) {
      normalized.prefixItems = normalized.items;
      delete normalized.items;
    }

    // Normalize nested properties recursively
    if (normalized.properties && typeof normalized.properties === 'object') {
      const props = normalized.properties as Record<string, unknown>;
      for (const key of Object.keys(props)) {
        props[key] = this.normalizeSchema(props[key]);
      }
    }

    // Normalize additionalProperties
    if (normalized.additionalProperties && typeof normalized.additionalProperties === 'object') {
      normalized.additionalProperties = this.normalizeSchema(normalized.additionalProperties);
    }

    // Normalize items (single schema)
    if (
      normalized.items &&
      typeof normalized.items === 'object' &&
      !Array.isArray(normalized.items)
    ) {
      normalized.items = this.normalizeSchema(normalized.items);
    }

    return normalized;
  }
}
