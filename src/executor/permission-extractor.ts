/**
 * MCPaC Permission Extractor
 *
 * Extracts required permissions from user code by analyzing TypeScript AST.
 * Uses PermissionValidator to validate type declarations and extract permission IDs.
 */

import { PermissionValidator, type ValidationResult } from '../capability/validator.js';

/**
 * Error detail for permission validation failures
 */
export interface PermissionError {
  /**
   * Name of the function or variable with the invalid permission declaration
   */
  location: string;

  /**
   * Type name that failed validation (e.g., 'McpRequires')
   */
  typeName: string;

  /**
   * Human-readable reason for the failure
   */
  reason: string;
}

/**
 * Result of extracting permissions from user code
 */
export interface ExtractionResult {
  /**
   * Array of unique permission IDs extracted from valid declarations
   * Format: 'server.tool' (e.g., ['filesystem.read_file', 'github.create_issue'])
   */
  permissions: string[];

  /**
   * Array of validation errors for invalid type declarations
   */
  errors: PermissionError[];

  /**
   * Array of warning messages (e.g., local type definitions)
   */
  warnings: string[];

  /**
   * Whether the extraction was successful (no errors)
   */
  success: boolean;
}

/**
 * PermissionExtractor extracts required permissions from user code.
 * Wraps PermissionValidator to provide a clean interface for the executor.
 *
 * @example
 * ```ts
 * const code = `
 *   import type { McpRequires } from './servers/_types';
 *   const content = await runtime.filesystem.read_file({ path: '/data.txt' });
 * `;
 *
 * const extractor = new PermissionExtractor();
 * const result = extractor.extract(code);
 *
 * if (result.success) {
 *   console.log('Required permissions:', result.permissions);
 * } else {
 *   console.error('Validation errors:', result.errors);
 * }
 * ```
 */
export class PermissionExtractor {
  private validator: PermissionValidator | null = null;

  /**
   * Extract permissions from user code
   *
   * @param code - TypeScript source code to analyze
   * @param fileName - Optional filename for error messages (default: 'user-code.ts')
   * @returns Extraction result with permissions, errors, and warnings
   */
  extract(code: string, fileName?: string): ExtractionResult {
    // Create validator
    this.validator = new PermissionValidator(code, undefined, fileName);

    // Validate and extract permissions
    const results = this.validator.validateFunctions();

    // Aggregate permissions from valid declarations
    const permissions = new Set<string>();
    const errors: PermissionError[] = [];
    const warnings: string[] = [];

    for (const result of results) {
      if (result.isValid) {
        // Add permissions from valid declarations
        for (const p of result.permissions) {
          permissions.add(p);
        }

        // Check for warnings (e.g., local type definitions)
        if (result.reason.includes('⚠️')) {
          warnings.push(result.reason);
        }
      } else {
        // Add validation errors
        errors.push({
          location: `${result.functionName}(${result.paramName})`,
          typeName: result.typeName,
          reason: result.reason,
        });
      }
    }

    return {
      permissions: Array.from(permissions),
      errors,
      warnings,
      success: errors.length === 0,
    };
  }

  /**
   * Check if code has any McpRequires type declarations
   *
   * @param code - TypeScript source code to analyze
   * @returns True if code contains McpRequires declarations
   */
  hasPermissionDeclarations(code: string): boolean {
    this.validator = new PermissionValidator(code);
    const results = this.validator.validateFunctions();
    return results.length > 0;
  }

  /**
   * Get detailed validation report
   *
   * @param code - TypeScript source code to analyze
   * @returns Human-readable validation report
   */
  getReport(code: string): string {
    this.validator = new PermissionValidator(code);
    return this.validator.getReport();
  }

  /**
   * Validate permission declarations without extracting
   * Useful for checking if code is safe before execution
   *
   * @param code - TypeScript source code to analyze
   * @returns True if all declarations are valid
   */
  validate(code: string): boolean {
    this.validator = new PermissionValidator(code);
    return this.validator.isValid();
  }

  /**
   * Get raw validation results
   * Useful for detailed error reporting
   *
   * @param code - TypeScript source code to analyze
   * @returns Array of validation results
   */
  getValidationResults(code: string): ValidationResult[] {
    this.validator = new PermissionValidator(code);
    return this.validator.validateFunctions();
  }
}

/**
 * Convenience function to extract permissions from code
 * Creates a one-time PermissionExtractor instance
 *
 * @param code - TypeScript source code to analyze
 * @param fileName - Optional filename for error messages
 * @returns Extraction result
 *
 * @example
 * ```ts
 * const result = extractPermissions(userCode);
 * if (result.success) {
 *   console.log('Permissions:', result.permissions);
 * }
 * ```
 */
export function extractPermissions(code: string, fileName?: string): ExtractionResult {
  const extractor = new PermissionExtractor();
  return extractor.extract(code, fileName);
}
