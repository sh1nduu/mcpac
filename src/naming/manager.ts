/**
 * Centralized naming manager for all MCP name conversions.
 *
 * This is the SINGLE SOURCE OF TRUTH for naming logic in MCPaC.
 * All naming conversions must go through this manager.
 *
 * Features:
 * - Immutable result objects
 * - Built-in validation
 * - Consistent conversion rules
 * - Memoization for performance
 *
 * @example
 * const naming = getNamingManager();
 * const ctx = naming.getToolContext('filesystem', 'read_file');
 * console.log(ctx.tool.mcp);        // 'read_file'
 * console.log(ctx.tool.property);   // 'read_file' (preserved)
 * console.log(ctx.tool.file);       // 'readFile' (camelCase for filesystem)
 * console.log(ctx.tool.type);       // 'ReadFile' (PascalCase for types)
 */

import { toCamelCase, toPascalCase, toSafeFileName } from './converters.js';
import type { PermissionNames, ServerNames, ToolNames, ToolNamingContext } from './types.js';
import { validateServerName, validateToolName } from './validators.js';

/**
 * Naming manager class - handles all name conversions
 */
export class NamingManager {
  private serverCache = new Map<string, ServerNames>();
  private toolCache = new Map<string, ToolNames>();
  private contextCache = new Map<string, ToolNamingContext>();

  /**
   * Generate all name variants for an MCP server
   *
   * @param mcpServerName - Original MCP server name (may contain hyphens)
   * @returns Immutable object with all name variants
   * @throws Error if server name is invalid
   *
   * @example
   * const names = manager.getServerNames('demo-filesystem');
   * // names.mcp = 'demo-filesystem'
   * // names.property = 'demoFilesystem'
   * // names.type = 'DemoFilesystem'
   * // names.directory = 'demo-filesystem'
   * // names.camelCase = 'demoFilesystem'
   */
  getServerNames(mcpServerName: string): ServerNames {
    // Check cache
    const cached = this.serverCache.get(mcpServerName);
    if (cached) return cached;

    // Validate
    const validation = validateServerName(mcpServerName);
    if (!validation.valid) {
      throw new Error(`Invalid server name '${mcpServerName}': ${validation.errors.join(', ')}`);
    }

    // Convert hyphens to underscores, then to camelCase
    const withUnderscores = mcpServerName.replace(/-/g, '_');
    const camelCase = toCamelCase(withUnderscores);
    const pascalCase = toPascalCase(withUnderscores);

    const result: ServerNames = Object.freeze({
      mcp: mcpServerName,
      property: camelCase,
      type: pascalCase,
      directory: mcpServerName,
      camelCase: camelCase,
    });

    // Cache and return
    this.serverCache.set(mcpServerName, result);
    return result;
  }

  /**
   * Generate all name variants for an MCP tool
   *
   * IMPORTANT: This preserves the original MCP tool name as-is.
   * No conversion from snake_case to camelCase or vice versa.
   *
   * @param mcpToolName - Original MCP tool name (preserved as-is)
   * @returns Immutable object with all name variants
   * @throws Error if tool name is invalid
   *
   * @example
   * // snake_case tool (traditional MCP)
   * const names1 = manager.getToolNames('read_file');
   * // names1.mcp = 'read_file'
   * // names1.property = 'read_file' (preserved!)
   * // names1.file = 'readFile' (camelCase for filesystem)
   * // names1.type = 'ReadFile' (PascalCase for types)
   *
   * // camelCase tool (e.g., everything server)
   * const names2 = manager.getToolNames('printEnv');
   * // names2.mcp = 'printEnv'
   * // names2.property = 'printEnv' (preserved!)
   * // names2.file = 'printEnv' (already safe)
   * // names2.type = 'PrintEnv'
   */
  getToolNames(mcpToolName: string): ToolNames {
    // Check cache
    const cached = this.toolCache.get(mcpToolName);
    if (cached) return cached;

    // Validate
    const validation = validateToolName(mcpToolName);
    if (!validation.valid) {
      throw new Error(`Invalid tool name '${mcpToolName}': ${validation.errors.join(', ')}`);
    }

    // CRITICAL: Preserve original MCP tool name
    // Do NOT convert from snake_case to camelCase
    const originalName = mcpToolName;

    // Generate safe filename (camelCase for filesystem)
    const fileName = toSafeFileName(mcpToolName);

    // Generate type name (PascalCase)
    const typeName = toPascalCase(mcpToolName);

    const result: ToolNames = Object.freeze({
      mcp: originalName,
      property: originalName, // Preserve original!
      file: fileName,
      type: typeName,
      permissionSuffix: originalName, // Preserve original!
    });

    // Cache and return
    this.toolCache.set(mcpToolName, result);
    return result;
  }

  /**
   * Generate permission ID variants for server + tool combination
   *
   * IMPORTANT: User and MCP formats are now identical (no conversion).
   *
   * @param mcpServerName - Original MCP server name
   * @param mcpToolName - Original MCP tool name
   * @returns Immutable object with permission ID variants
   *
   * @example
   * const perms = manager.getPermissionNames('filesystem', 'read_file');
   * // perms.user = 'filesystem.read_file'
   * // perms.mcp = 'filesystem.read_file'
   * // perms.path = 'filesystem.read_file'
   */
  getPermissionNames(mcpServerName: string, mcpToolName: string): PermissionNames {
    const server = this.getServerNames(mcpServerName);
    const tool = this.getToolNames(mcpToolName);

    // User, MCP, and path formats are all the same now
    // No conversion between formats!
    const permissionId = `${server.mcp}.${tool.mcp}`;

    const result: PermissionNames = Object.freeze({
      user: permissionId,
      mcp: permissionId,
      path: permissionId,
    });

    return result;
  }

  /**
   * Generate complete naming context for a tool
   *
   * @param mcpServerName - Original MCP server name
   * @param mcpToolName - Original MCP tool name
   * @returns Complete naming context with all variants
   *
   * @example
   * const ctx = manager.getToolContext('filesystem', 'read_file');
   * // ctx.server.mcp = 'filesystem'
   * // ctx.server.property = 'filesystem'
   * // ctx.tool.mcp = 'read_file'
   * // ctx.tool.property = 'read_file' (preserved!)
   * // ctx.permission.user = 'filesystem.read_file'
   * // ctx.permission.mcp = 'filesystem.read_file'
   */
  getToolContext(mcpServerName: string, mcpToolName: string): ToolNamingContext {
    const cacheKey = `${mcpServerName}::${mcpToolName}`;

    // Check cache
    const cached = this.contextCache.get(cacheKey);
    if (cached) return cached;

    const result: ToolNamingContext = Object.freeze({
      server: this.getServerNames(mcpServerName),
      tool: this.getToolNames(mcpToolName),
      permission: this.getPermissionNames(mcpServerName, mcpToolName),
    });

    // Cache and return
    this.contextCache.set(cacheKey, result);
    return result;
  }

  /**
   * Clear all caches (useful for testing)
   */
  clearCache(): void {
    this.serverCache.clear();
    this.toolCache.clear();
    this.contextCache.clear();
  }
}

/**
 * Global singleton instance
 */
let globalInstance: NamingManager | undefined;

/**
 * Get global NamingManager instance
 *
 * @returns Global naming manager singleton
 *
 * @example
 * const naming = getNamingManager();
 * const ctx = naming.getToolContext('filesystem', 'read_file');
 */
export function getNamingManager(): NamingManager {
  if (!globalInstance) {
    globalInstance = new NamingManager();
  }
  return globalInstance;
}

/**
 * Reset global instance (for testing)
 */
export function resetNamingManager(): void {
  globalInstance = undefined;
}
