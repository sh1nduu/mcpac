/**
 * MCPaC Runtime Injector
 *
 * Injects runtime initialization code into user code.
 * Creates a global `runtime` variable with granted permissions.
 */

/**
 * Options for runtime injection
 */
export interface InjectionOptions {
  /**
   * Permissions to grant to the runtime
   */
  grantedPermissions: string[];

  /**
   * Path to the runtime module (default: './servers/_mcpac_runtime.js')
   */
  runtimeModulePath?: string;

  /**
   * Path to the types module (default: './servers/_types.js')
   */
  typesModulePath?: string;

  /**
   * Variable name for the runtime (default: 'runtime')
   */
  runtimeVariableName?: string;
}

/**
 * RuntimeInjector injects capability runtime initialization into user code.
 * Prepends import and initialization statements before user code.
 *
 * User code MUST contain:
 *   import type { McpRequires } from './servers/_types.js';
 *   declare const runtime: McpRequires<['perm1', 'perm2']>;
 *
 * @example
 * ```ts
 * const injector = new RuntimeInjector();
 * const modifiedCode = injector.inject(userCode, {
 *   grantedPermissions: ['filesystem.read_file', 'filesystem.write_file']
 * });
 * ```
 */
export class RuntimeInjector {
  /**
   * Check if user code has required declarations
   */
  private hasRequiredDeclarations(
    code: string,
    typesModulePath: string,
    runtimeVariableName: string,
  ): {
    hasMcpRequiresImport: boolean;
    hasRuntimeDeclaration: boolean;
  } {
    // Escape special regex characters in the module path
    const escapedPath = typesModulePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const hasMcpRequiresImport = new RegExp(
      `import\\s+type\\s+\\{[^}]*McpRequires[^}]*\\}\\s+from\\s+['"]${escapedPath}`,
    ).test(code);

    const hasRuntimeDeclaration = new RegExp(
      `declare\\s+const\\s+${runtimeVariableName}\\s*:\\s*McpRequires<`,
    ).test(code);

    return {
      hasMcpRequiresImport,
      hasRuntimeDeclaration,
    };
  }

  /**
   * Inject runtime initialization code into user code
   *
   * @param code - Original user code
   * @param options - Injection options
   * @returns Modified code with runtime initialization
   * @throws Error if required declarations are missing
   */
  inject(code: string, options: InjectionOptions): string {
    const {
      grantedPermissions,
      runtimeModulePath = './servers/_mcpac_runtime.js',
      typesModulePath = './servers/_types.js',
      runtimeVariableName = 'runtime',
    } = options;

    const { hasMcpRequiresImport, hasRuntimeDeclaration } = this.hasRequiredDeclarations(
      code,
      typesModulePath,
      runtimeVariableName,
    );

    // Check for required declarations
    if (!hasMcpRequiresImport || !hasRuntimeDeclaration) {
      const missing: string[] = [];
      if (!hasMcpRequiresImport) {
        missing.push(`  import type { McpRequires } from '${typesModulePath}';`);
      }
      if (!hasRuntimeDeclaration) {
        missing.push(
          `  declare const ${runtimeVariableName}: McpRequires<['permission1', 'permission2']>;`,
        );
      }

      throw new Error(
        `Missing required permission declarations. Add the following to your code:\n\n${missing.join('\n')}\n`,
      );
    }

    // Generate runtime setup code (only createRuntime import and initialization)
    const setupCode = this.generateSetupCode(
      grantedPermissions,
      runtimeModulePath,
      runtimeVariableName,
    );

    // Prepend setup code to user code
    return `${setupCode}\n\n${code}`;
  }

  /**
   * Generate runtime setup code (without import/declare, only implementation)
   * @private
   */
  private generateSetupCode(
    permissions: string[],
    runtimeModulePath: string,
    variableName: string,
  ): string {
    const lines: string[] = [];

    // Add header comment
    lines.push('// ============================================================================');
    lines.push('// MCPaC Runtime Initialization (auto-injected)');
    lines.push('// ============================================================================');
    lines.push('');

    // Import createRuntime function
    lines.push(`import { createRuntime } from '${runtimeModulePath}';`);
    lines.push('');

    // Create runtime with granted permissions
    lines.push('// Initialize runtime with granted permissions');
    lines.push(`const ${variableName} = createRuntime([`);
    for (let i = 0; i < permissions.length; i++) {
      const comma = i < permissions.length - 1 ? ',' : '';
      lines.push(`  '${permissions[i]}'${comma}`);
    }
    lines.push(']);');
    lines.push('');

    // Add separator comment
    lines.push('// ============================================================================');
    lines.push('// User Code (below)');
    lines.push('// ============================================================================');

    return lines.join('\n');
  }

  /**
   * Check if code already has runtime injection
   * Useful to avoid double injection
   *
   * @param code - Code to check
   * @returns True if code already has runtime initialization
   */
  hasInjection(code: string): boolean {
    return code.includes('// MCPaC Runtime Initialization (auto-injected)');
  }

  /**
   * Remove existing runtime injection from code
   * Useful for re-injection with different permissions
   *
   * @param code - Code with injection
   * @returns Code without injection
   */
  removeInjection(code: string): string {
    const startMarker =
      '// ============================================================================\n// MCPaC Runtime Initialization (auto-injected)';
    const endMarker =
      '// User Code (below)\n// ============================================================================\n';

    const startIndex = code.indexOf(startMarker);
    if (startIndex === -1) {
      return code; // No injection found
    }

    const endIndex = code.indexOf(endMarker, startIndex);
    if (endIndex === -1) {
      return code; // Incomplete injection
    }

    // Remove from start marker to end of end marker
    const beforeInjection = code.slice(0, startIndex);
    const afterInjection = code.slice(endIndex + endMarker.length);

    return beforeInjection + afterInjection.trimStart();
  }

  /**
   * Re-inject runtime with different permissions
   * Removes existing injection and injects new one
   *
   * @param code - Code with existing injection
   * @param options - New injection options
   * @returns Code with updated injection
   */
  reinject(code: string, options: InjectionOptions): string {
    const cleanCode = this.removeInjection(code);
    return this.inject(cleanCode, options);
  }
}

/**
 * Convenience function to inject runtime
 * Creates a one-time RuntimeInjector instance
 *
 * @param code - Original user code
 * @param grantedPermissions - Permissions to grant
 * @returns Modified code with runtime initialization
 *
 * @example
 * ```ts
 * const modifiedCode = injectRuntime(userCode, ['filesystem.read_file']);
 * ```
 */
export function injectRuntime(code: string, grantedPermissions: string[]): string {
  const injector = new RuntimeInjector();
  return injector.inject(code, { grantedPermissions });
}
