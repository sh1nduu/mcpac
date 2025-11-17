/**
 * Type definitions for the centralized naming management system.
 *
 * This module defines all name variant types used throughout MCPaC.
 * All naming conversions produce immutable objects of these types.
 */

/**
 * All name variants for an MCP server
 */
export interface ServerNames {
  /** Original MCP server name (may contain hyphens): "demo-filesystem" */
  readonly mcp: string;

  /** TypeScript property name (camelCase): "demoFilesystem" */
  readonly property: string;

  /** TypeScript type name prefix (PascalCase): "DemoFilesystem" */
  readonly type: string;

  /** Directory name (same as MCP): "demo-filesystem" */
  readonly directory: string;

  /** Internal camelCase variant (underscores removed): "demoFilesystem" */
  readonly camelCase: string;
}

/**
 * All name variants for an MCP tool
 */
export interface ToolNames {
  /** Original MCP tool name (preserved as-is): "read_file" or "printEnv" */
  readonly mcp: string;

  /** TypeScript property name (same as MCP name): "read_file" or "printEnv" */
  readonly property: string;

  /** File name (camelCase for filesystem safety): "readFile" or "printEnv" */
  readonly file: string;

  /** Type name prefix (PascalCase): "ReadFile" or "PrintEnv" */
  readonly type: string;

  /** Permission ID suffix (same as MCP name): "read_file" or "printEnv" */
  readonly permissionSuffix: string;
}

/**
 * Combined server + tool name variants
 */
export interface PermissionNames {
  /** User/CLI format (original names): "filesystem.read_file" */
  readonly user: string;

  /** MCP/Internal format (same as user): "filesystem.read_file" */
  readonly mcp: string;

  /** Dotted path for nested access: "filesystem.read_file" */
  readonly path: string;
}

/**
 * Complete naming context for a tool
 */
export interface ToolNamingContext {
  readonly server: ServerNames;
  readonly tool: ToolNames;
  readonly permission: PermissionNames;
}

/**
 * Validation result
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
}
