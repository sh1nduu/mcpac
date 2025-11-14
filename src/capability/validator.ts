/**
 * MCPaC Capability-Based Permission System - Permission Validator
 *
 * AST-based validation of McpRequires type parameters using TypeScript Compiler API.
 * Prevents type forgery by validating import sources and type definitions.
 */

import ts from 'typescript';

/**
 * Result of validating a single function parameter or variable declaration
 */
export interface ValidationResult {
  /**
   * Whether the type declaration is valid and safe
   */
  isValid: boolean;

  /**
   * Name of the function containing this parameter (or 'global' for declarations)
   */
  functionName: string;

  /**
   * Name of the parameter or variable
   */
  paramName: string;

  /**
   * Name of the type being used (e.g., 'McpRequires')
   */
  typeName: string;

  /**
   * Human-readable reason for validation result
   */
  reason: string;

  /**
   * Extracted permission IDs (e.g., ['filesystem.read_file', 'github.create_issue'])
   * Only populated if isValid is true
   */
  permissions: string[];
}

/**
 * Default valid import sources for MCPaC
 */
const DEFAULT_VALID_SOURCES = [
  './servers/_mcpac_runtime',
  './servers/_mcpac_runtime.js',
  './servers/_types',
  './servers/_types.js',
  'mcpac',
];

/**
 * PermissionValidator validates McpRequires type parameters in user code.
 * Uses TypeScript Compiler API to analyze AST and extract permissions.
 *
 * Security features:
 * - Validates import sources (whitelisted libraries only)
 * - Detects local type forgery
 * - Traces type aliases to ensure PickNamespacedRuntime base
 * - Extracts permission literals from type parameters
 *
 * @example
 * ```ts
 * const code = `
 *   import type { McpRequires } from './servers/_types';
 *   const content = await runtime.filesystem.read_file({ path: '/data.txt' });
 * `;
 *
 * const validator = new PermissionValidator(code);
 * const results = validator.validateFunctions();
 *
 * if (results.every(r => r.isValid)) {
 *   const permissions = results.flatMap(r => r.permissions);
 *   console.log('Required permissions:', permissions);
 * }
 * ```
 */
export class PermissionValidator {
  private sourceFile: ts.SourceFile;
  private validImportSources = new Set<string>();
  private typeAliasInfo: Map<string, { referencedTypes: string[] }> = new Map();

  /**
   * Create a new PermissionValidator
   *
   * @param code - TypeScript source code to validate
   * @param validLibraryPaths - Whitelisted import sources (defaults to MCPaC sources)
   * @param fileName - Virtual filename for error messages
   */
  constructor(
    code: string,
    validLibraryPaths: string[] = DEFAULT_VALID_SOURCES,
    fileName = 'user-code.ts',
  ) {
    this.sourceFile = ts.createSourceFile(
      fileName,
      code,
      ts.ScriptTarget.Latest,
      true, // setParentNodes
    );

    // Register valid library paths
    for (const path of validLibraryPaths) {
      this.validImportSources.add(path);
    }

    // Build type alias information for validation
    this.buildTypeAliasInfo();
  }

  /**
   * Check imports and extract import source mapping
   * @returns Map of type name to import source
   */
  private checkImports(): Map<string, string> {
    const importedTypes = new Map<string, string>(); // typeName -> source

    const visit = (node: ts.Node) => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = (node.moduleSpecifier as ts.StringLiteral).text;

        if (node.importClause?.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            node.importClause.namedBindings.elements.forEach((element) => {
              const importedName = element.name.text;
              importedTypes.set(importedName, moduleSpecifier);
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };

    visit(this.sourceFile);
    return importedTypes;
  }

  /**
   * Build information about type aliases defined in the code
   */
  private buildTypeAliasInfo(): void {
    const visit = (node: ts.Node) => {
      if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.text;
        const referencedTypes = this.getReferencedTypes(node.type);
        this.typeAliasInfo.set(name, { referencedTypes });
      }
      ts.forEachChild(node, visit);
    };
    visit(this.sourceFile);
  }

  /**
   * Get all type names referenced in a type node
   * @param typeNode - Type node to analyze
   * @returns Array of referenced type names
   */
  private getReferencedTypes(typeNode: ts.Node | undefined): string[] {
    if (!typeNode) return [];

    const types: string[] = [];
    const visit = (node: ts.Node) => {
      if (ts.isTypeReferenceNode(node)) {
        const typeName = node.typeName.getText(this.sourceFile);
        types.push(typeName);
      }
      ts.forEachChild(node, visit);
    };

    visit(typeNode);
    return types;
  }

  /**
   * Check if a type is locally defined (potential forgery)
   * @param typeName - Name of the type to check
   * @returns True if the type is defined locally
   */
  private isLocallyDefined(typeName: string): boolean {
    return this.typeAliasInfo.has(typeName);
  }

  /**
   * Check if a type is imported from a valid library
   * @param typeName - Name of the type to check
   * @param importedTypes - Map of imported types to sources
   * @returns True if imported from whitelisted source
   */
  private isFromValidLibrary(typeName: string, importedTypes: Map<string, string>): boolean {
    const source = importedTypes.get(typeName);
    if (!source) return false;

    return this.validImportSources.has(source);
  }

  /**
   * Check if a type is based on PickNamespacedRuntime (recursively)
   * @param typeName - Name of the type to check
   * @param importedTypes - Map of imported types to sources
   * @param visited - Set of visited types (for cycle detection)
   * @returns True if based on PickNamespacedRuntime or PickRuntime
   */
  private isPickRuntimeBased(
    typeName: string,
    importedTypes: Map<string, string>,
    visited = new Set<string>(),
  ): boolean {
    // Check for both PickRuntime and PickNamespacedRuntime
    if (typeName === 'PickRuntime' || typeName === 'PickNamespacedRuntime') {
      return true;
    }

    // Cycle detection
    if (visited.has(typeName)) return false;
    visited.add(typeName);

    // Check local type alias references
    const info = this.typeAliasInfo.get(typeName);
    if (!info) return false;

    return info.referencedTypes.some((refType) =>
      this.isPickRuntimeBased(refType, importedTypes, visited),
    );
  }

  /**
   * Extract permission literals from type arguments
   * @param typeNode - Type reference node with type arguments
   * @returns Array of permission strings
   */
  private extractPermissionsFromTypeNode(typeNode: ts.TypeReferenceNode): string[] {
    if (!typeNode.typeArguments || typeNode.typeArguments.length === 0) {
      return [];
    }

    const permissions: string[] = [];
    const firstArg = typeNode.typeArguments[0];
    if (!firstArg) {
      return [];
    }

    // Handle tuple type: ['filesystem.read', 'github.create']
    if (ts.isTupleTypeNode(firstArg)) {
      for (const element of firstArg.elements) {
        if (element && ts.isLiteralTypeNode(element) && ts.isStringLiteral(element.literal)) {
          permissions.push(element.literal.text);
        }
      }
    }
    // Handle array literal type: ['filesystem.read']
    else if (ts.isArrayTypeNode(firstArg)) {
      const elementType = firstArg.elementType;
      if (elementType) {
        if (
          ts.isLiteralTypeNode(elementType) &&
          elementType.literal &&
          ts.isStringLiteral(elementType.literal)
        ) {
          permissions.push(elementType.literal.text);
        }
      }
    }

    return permissions;
  }

  /**
   * Validate all functions and variable declarations in the code
   * @returns Array of validation results
   */
  validateFunctions(): ValidationResult[] {
    const results: ValidationResult[] = [];
    const importedTypes = this.checkImports();

    const visit = (node: ts.Node) => {
      // Handle function declarations
      if (ts.isFunctionDeclaration(node) && node.name) {
        const funcName = node.name.text;

        node.parameters.forEach((param) => {
          const paramName = param.name.getText(this.sourceFile);

          if (param.type && ts.isTypeReferenceNode(param.type)) {
            const result = this.validateTypeReference(
              funcName,
              paramName,
              param.type,
              importedTypes,
            );
            if (result) {
              results.push(result);
            }
          }
        });
      }

      // Handle variable declarations with runtime type (e.g., declare const runtime: McpRequires<...>)
      if (ts.isVariableStatement(node)) {
        node.declarationList.declarations.forEach((decl) => {
          if (decl.type && ts.isTypeReferenceNode(decl.type)) {
            const varName = decl.name.getText(this.sourceFile);
            const result = this.validateTypeReference('global', varName, decl.type, importedTypes);
            if (result) {
              results.push(result);
            }
          }
        });
      }

      ts.forEachChild(node, visit);
    };

    visit(this.sourceFile);
    return results;
  }

  /**
   * Validate a type reference node
   * @param functionName - Name of the containing function
   * @param paramName - Name of the parameter or variable
   * @param typeNode - Type reference node to validate
   * @param importedTypes - Map of imported types to sources
   * @returns Validation result or null if not a Requires type
   */
  private validateTypeReference(
    functionName: string,
    paramName: string,
    typeNode: ts.TypeReferenceNode,
    importedTypes: Map<string, string>,
  ): ValidationResult | null {
    const typeName = typeNode.typeName.getText(this.sourceFile);
    const isRequiresName =
      typeName === 'McpRequires' || typeName === 'Requires' || typeName.endsWith('Requires');

    if (!isRequiresName) {
      return null;
    }

    // Extract permissions from type arguments
    const permissions = this.extractPermissionsFromTypeNode(typeNode);

    // Three-check validation logic
    const isLocal = this.isLocallyDefined(typeName);
    const fromValidLib = this.isFromValidLibrary(typeName, importedTypes);
    const isPickRuntimeBased = this.isPickRuntimeBased(typeName, importedTypes);

    let isValid = false;
    let reason = '';

    if (fromValidLib) {
      // Valid: Imported from whitelisted library
      isValid = true;
      reason = `Type "${typeName}" is imported from a legitimate library`;
    } else if (isLocal && isPickRuntimeBased) {
      // Warning: Local but based on PickRuntime (should import instead)
      isValid = true;
      reason = `⚠️  Type "${typeName}" is locally defined but uses PickNamespacedRuntime (recommended: import from library)`;
    } else if (isLocal) {
      // Invalid: Local definition without PickRuntime base (forgery risk)
      isValid = false;
      reason = `Type "${typeName}" is locally defined without PickNamespacedRuntime base (forgery risk)`;
    } else {
      // Invalid: Imported from unknown source
      const source = importedTypes.get(typeName) || 'unknown';
      isValid = false;
      reason = `Type "${typeName}" is imported from unknown source "${source}"`;
    }

    return {
      isValid,
      functionName,
      paramName,
      typeName,
      reason,
      permissions: isValid ? permissions : [],
    };
  }

  /**
   * Extract all valid permissions from the code
   * Convenience method that returns only permissions from valid type declarations
   * @returns Array of unique permission strings
   */
  extractPermissions(): string[] {
    const results = this.validateFunctions();
    const permissions = new Set<string>();

    for (const result of results) {
      if (result.isValid) {
        for (const p of result.permissions) {
          permissions.add(p);
        }
      }
    }

    return Array.from(permissions);
  }

  /**
   * Check if the code has any validation errors
   * @returns True if all type declarations are valid
   */
  isValid(): boolean {
    const results = this.validateFunctions();
    return results.length > 0 && results.every((r) => r.isValid);
  }

  /**
   * Get detailed validation report as a string
   * @returns Human-readable validation report
   */
  getReport(): string {
    const results = this.validateFunctions();
    if (results.length === 0) {
      return 'No McpRequires type declarations found';
    }

    const lines: string[] = [];
    lines.push('Permission Validation Report:');
    lines.push('');

    for (const result of results) {
      const status = result.isValid ? '✓' : '✗';
      lines.push(`${status} ${result.functionName}(${result.paramName}: ${result.typeName})`);
      lines.push(`  ${result.reason}`);
      if (result.permissions.length > 0) {
        lines.push(`  Permissions: ${result.permissions.join(', ')}`);
      }
      lines.push('');
    }

    const hasInvalid = results.some((r) => !r.isValid);
    lines.push(hasInvalid ? '✗ Validation failed' : '✓ All validations passed');

    return lines.join('\n');
  }
}
