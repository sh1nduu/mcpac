/**
 * Centralized naming management system for MCPaC
 *
 * This module provides a single source of truth for all naming conversions.
 * Use the NamingManager to generate consistent name variants across the codebase.
 *
 * @example
 * import { getNamingManager } from './naming/index.js';
 *
 * const naming = getNamingManager();
 * const ctx = naming.getToolContext('filesystem', 'read_file');
 *
 * console.log(ctx.tool.mcp);        // 'read_file' (original MCP name)
 * console.log(ctx.tool.property);   // 'read_file' (preserved)
 * console.log(ctx.tool.file);       // 'readFile' (safe for filesystem)
 * console.log(ctx.tool.type);       // 'ReadFile' (PascalCase for types)
 */

// Conversion utilities (for advanced use cases)
export { toCamelCase, toPascalCase, toSafeFileName } from './converters.js';
// Core manager
export {
  getNamingManager,
  NamingManager,
  resetNamingManager,
} from './manager.js';
// Type definitions
export type {
  PermissionNames,
  ServerNames,
  ToolNames,
  ToolNamingContext,
  ValidationResult,
} from './types.js';

// Validation functions
export {
  isValidIdentifier,
  validateServerName,
  validateToolName,
  validateTypeScriptIdentifier,
} from './validators.js';
