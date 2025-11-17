/**
 * Low-level conversion utilities for name transformations.
 *
 * These functions perform basic string transformations used by the NamingManager.
 * They should not be used directly - always use NamingManager instead.
 */

/**
 * Convert snake_case or kebab-case to camelCase
 *
 * @param str - String to convert
 * @returns camelCase version
 *
 * @example
 * toCamelCase('read_file')        // 'readFile'
 * toCamelCase('demo-filesystem')  // 'demoFilesystem'
 * toCamelCase('printEnv')         // 'printEnv' (no change)
 */
export function toCamelCase(str: string): string {
  if (!str) return str;

  // Split on underscores or hyphens
  const parts = str.split(/[_-]/);
  if (parts.length === 1) return str; // No separators, return as-is

  // First part lowercase, rest capitalized
  return (
    parts[0] +
    parts
      .slice(1)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join('')
  );
}

/**
 * Convert snake_case or kebab-case to PascalCase
 *
 * @param str - String to convert
 * @returns PascalCase version
 *
 * @example
 * toPascalCase('read_file')       // 'ReadFile'
 * toPascalCase('demo-filesystem') // 'DemoFilesystem'
 * toPascalCase('printEnv')        // 'PrintEnv' (capitalize first letter)
 */
export function toPascalCase(str: string): string {
  if (!str) return str;

  // Split on underscores or hyphens
  const parts = str.split(/[_-]/);

  // Capitalize all parts
  return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1)).join('');
}

/**
 * Convert string to safe filename (camelCase)
 * Handles snake_case, kebab-case, and preserves existing camelCase
 *
 * @param str - String to convert
 * @returns Safe filename string
 *
 * @example
 * toSafeFileName('read_file')      // 'readFile'
 * toSafeFileName('test-tool')      // 'testTool'
 * toSafeFileName('printEnv')       // 'printEnv' (preserved)
 */
export function toSafeFileName(str: string): string {
  if (!str) return str;

  // If it contains underscores or hyphens, convert to camelCase
  if (str.includes('_') || str.includes('-')) {
    return toCamelCase(str);
  }

  // Otherwise, return as-is (already safe)
  return str;
}
