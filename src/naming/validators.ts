/**
 * Validation functions for MCP names and TypeScript identifiers.
 *
 * These validators ensure that names conform to expected formats
 * before they are processed by the NamingManager.
 */

import type { ValidationResult } from './types.js';

/**
 * Validate MCP server name
 *
 * Rules:
 * - Must not be empty
 * - May contain lowercase letters, numbers, hyphens, underscores
 * - Should not start or end with hyphen or underscore
 *
 * @param name - Server name to validate
 * @returns Validation result with error messages
 *
 * @example
 * validateServerName('demo-filesystem')  // { valid: true, errors: [] }
 * validateServerName('Invalid!')         // { valid: false, errors: [...] }
 */
export function validateServerName(name: string): ValidationResult {
  const errors: string[] = [];

  if (!name || name.length === 0) {
    errors.push('Server name cannot be empty');
  }

  if (!/^[a-z0-9_-]+$/i.test(name)) {
    errors.push('Server name must contain only letters, numbers, hyphens, and underscores');
  }

  if (name.startsWith('-') || name.startsWith('_') || name.endsWith('-') || name.endsWith('_')) {
    errors.push('Server name should not start or end with hyphen or underscore');
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

/**
 * Validate MCP tool name
 *
 * Rules:
 * - Must not be empty
 * - May contain letters, numbers, underscores (relaxed validation)
 * - Accepts both snake_case and camelCase (as MCP servers use various conventions)
 *
 * @param name - Tool name to validate
 * @returns Validation result with error messages
 *
 * @example
 * validateToolName('read_file')  // { valid: true, errors: [] }
 * validateToolName('printEnv')   // { valid: true, errors: [] }
 * validateToolName('')           // { valid: false, errors: [...] }
 */
export function validateToolName(name: string): ValidationResult {
  const errors: string[] = [];

  if (!name || name.length === 0) {
    errors.push('Tool name cannot be empty');
  }

  // Relaxed validation: allow letters, numbers, underscores
  // This supports both snake_case (read_file) and camelCase (printEnv)
  if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(name)) {
    errors.push(
      'Tool name must start with a letter and contain only letters, numbers, and underscores',
    );
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}

/**
 * Check if a string is a valid TypeScript identifier
 *
 * Rules:
 * - Must start with letter, underscore, or dollar sign
 * - May contain letters, numbers, underscores, dollar signs
 * - Must not be a reserved keyword
 *
 * @param name - Identifier to check
 * @returns true if valid identifier, false otherwise
 *
 * @example
 * isValidIdentifier('readFile')  // true
 * isValidIdentifier('read_file') // true
 * isValidIdentifier('test-tool') // false (hyphen not allowed)
 * isValidIdentifier('class')     // false (reserved keyword)
 */
export function isValidIdentifier(name: string): boolean {
  if (!name || name.length === 0) return false;

  // Check basic syntax
  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
    return false;
  }

  // Check against reserved keywords
  const reservedKeywords = [
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'null',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
  ];

  if (reservedKeywords.includes(name)) {
    return false;
  }

  return true;
}

/**
 * Validate TypeScript identifier (detailed version with errors)
 *
 * @param name - Identifier to validate
 * @returns Validation result with error messages
 */
export function validateTypeScriptIdentifier(name: string): ValidationResult {
  const errors: string[] = [];

  if (!name || name.length === 0) {
    errors.push('Identifier cannot be empty');
    return Object.freeze({ valid: false, errors: Object.freeze(errors) });
  }

  if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(name)) {
    errors.push('Identifier must start with letter, underscore, or dollar sign');
  }

  const reservedKeywords = [
    'break',
    'case',
    'catch',
    'class',
    'const',
    'continue',
    'debugger',
    'default',
    'delete',
    'do',
    'else',
    'enum',
    'export',
    'extends',
    'false',
    'finally',
    'for',
    'function',
    'if',
    'import',
    'in',
    'instanceof',
    'new',
    'null',
    'return',
    'super',
    'switch',
    'this',
    'throw',
    'true',
    'try',
    'typeof',
    'var',
    'void',
    'while',
    'with',
  ];

  if (reservedKeywords.includes(name)) {
    errors.push(`'${name}' is a reserved keyword`);
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
  });
}
