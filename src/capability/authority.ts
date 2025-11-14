/**
 * MCPaC Capability-Based Permission System - Runtime Authority
 *
 * Provides RuntimeAuthority for granting permissions with Symbol-based forgery prevention.
 * Each authority instance manages permission grants for MCP tool access.
 */

import type { PickNamespacedRuntime, RuntimeWithMethods } from './types.js';

/**
 * Secret symbol for runtime verification
 * This symbol is used to prevent forgery of runtime objects
 */
const RuntimeSecret = Symbol('RuntimeSecret');

/**
 * RuntimeAuthority manages permission grants and verification for flat permission IDs.
 * Each instance has its own secret key for forgery prevention.
 *
 * @template P - Permission string literal type
 * @template Methods - Record of permission names to method signatures
 *
 * @example
 * ```ts
 * interface Methods {
 *   'filesystem.read_file': (args: { path: string }) => Promise<string>;
 *   'filesystem.write_file': (args: { path: string; content: string }) => Promise<void>;
 * }
 *
 * const methods: Methods = {
 *   'filesystem.read_file': async (args) => { ... },
 *   'filesystem.write_file': async (args) => { ... },
 * };
 *
 * const authority = new RuntimeAuthority<keyof Methods & string, Methods>(methods);
 * const rt = authority.grant('filesystem.read_file', 'filesystem.write_file');
 * ```
 */
export class RuntimeAuthority<
  P extends string,
  Methods extends Record<P, (...args: any[]) => any>,
> {
  private readonly secretKey: string;
  private readonly methodImplementations: Methods;

  /**
   * Create a new RuntimeAuthority
   *
   * @param methodImplementations - Implementation of all methods for each permission
   */
  constructor(methodImplementations: Methods) {
    this.secretKey = crypto.randomUUID();
    this.methodImplementations = methodImplementations;
  }

  /**
   * Grant permissions and return a runtime object
   *
   * @template T - Tuple type of granted permissions
   * @param permissions - Permissions to grant
   * @returns Runtime object with only the granted methods available
   */
  grant<T extends readonly P[]>(...permissions: T): RuntimeWithMethods<P, Methods> {
    return this.createRuntime([...permissions]);
  }

  /**
   * Verify that a runtime object was created by this authority
   *
   * @param obj - Object to verify
   * @returns True if the object was created by this authority
   */
  verify(obj: any): boolean {
    return obj && obj[RuntimeSecret] === this.secretKey;
  }

  /**
   * Create a runtime object with the specified permissions
   * @private
   */
  private createRuntime(permissions: P[]): RuntimeWithMethods<P, Methods> {
    // Create the base object with secret and utility methods
    const baseObj = {
      [RuntimeSecret]: this.secretKey,

      getPermissions(): readonly P[] {
        return permissions;
      },

      has<Perm extends P>(perm: Perm): boolean {
        return permissions.includes(perm);
      },
    };

    // Add permission-gated methods
    const methods: Partial<Methods> = {};

    for (const [methodName, implementation] of Object.entries(this.methodImplementations)) {
      const perm = methodName as P;
      methods[perm] = ((...args: any[]) => {
        // Verify runtime integrity
        if (!this.verify(runtimeObj)) {
          throw new Error('Invalid runtime: verification failed');
        }

        // Check permission
        if (!permissions.includes(perm)) {
          throw new Error(
            `Missing permission: ${String(perm)} (granted: [${permissions.join(', ')}])`,
          );
        }

        // Call the actual implementation
        return (implementation as (...args: any[]) => any)(...args);
      }) as any;
    }

    // Combine base and methods
    const runtimeObj = Object.freeze({
      ...baseObj,
      ...methods,
    }) as unknown as RuntimeWithMethods<P, Methods>;

    return runtimeObj;
  }
}

/**
 * NamespacedRuntimeAuthority manages namespaced permission grants with MCP-style syntax.
 * Permission IDs are flat strings ("server.tool") but runtime provides nested access (rt.server.tool()).
 *
 * This is the primary authority class used by MCPaC for MCP tool access.
 *
 * @template P - Permission string literal type in "server.tool" format
 * @template Methods - Flat record of "server.tool" -> method signatures
 *
 * @example
 * ```ts
 * interface McpServers {
 *   filesystem: {
 *     read_file(args: { path: string }): Promise<string>;
 *     write_file(args: { path: string; content: string }): Promise<void>;
 *   };
 * }
 *
 * type Methods = MethodsFromServers<McpServers>;
 * const methods: Methods = {
 *   'filesystem.read_file': async (args) => {
 *     return await callMCPTool('filesystem', 'read_file', args);
 *   },
 *   'filesystem.write_file': async (args) => {
 *     return await callMCPTool('filesystem', 'write_file', args);
 *   },
 * };
 *
 * const authority = new NamespacedRuntimeAuthority<keyof Methods & string, Methods>(methods);
 * const rt = authority.grant('filesystem.read_file', 'filesystem.write_file');
 *
 * // Use with nested syntax
 * const content = await rt.filesystem.read_file({ path: '/foo' }); // ✓ OK
 * await rt.filesystem.write_file({ path: '/bar', content }); // ✓ OK
 * ```
 */
export class NamespacedRuntimeAuthority<
  P extends string,
  Methods extends Record<P, (...args: any[]) => any>,
> {
  private readonly secretKey: string;
  private readonly methodImplementations: Methods;

  /**
   * Create a new NamespacedRuntimeAuthority
   *
   * @param methodImplementations - Implementation of all methods (with "server.tool" keys)
   */
  constructor(methodImplementations: Methods) {
    this.secretKey = crypto.randomUUID();
    this.methodImplementations = methodImplementations;
  }

  /**
   * Grant permissions and return a namespaced runtime object
   *
   * @template T - Tuple type of granted permissions
   * @param permissions - Permissions to grant in "server.tool" format
   * @returns Runtime object with nested server.tool() access
   */
  grant<T extends readonly P[]>(...permissions: T): PickNamespacedRuntime<T, P, Methods> {
    return this.createNamespacedRuntime([...permissions]);
  }

  /**
   * Verify that a runtime object was created by this authority
   *
   * @param obj - Object to verify
   * @returns True if the object was created by this authority
   */
  verify(obj: any): boolean {
    return obj && obj[RuntimeSecret] === this.secretKey;
  }

  /**
   * Create a namespaced runtime object with the specified permissions
   * @private
   */
  private createNamespacedRuntime(
    permissions: P[],
  ): PickNamespacedRuntime<readonly P[], P, Methods> {
    // Create the base object with secret and utility methods
    const baseObj: any = {
      [RuntimeSecret]: this.secretKey,

      getPermissions(): readonly P[] {
        return permissions;
      },

      has<Perm extends P>(perm: Perm): boolean {
        return permissions.includes(perm);
      },
    };

    // Validate granted permissions format
    for (const perm of permissions) {
      const permStr = String(perm);
      if (permStr.indexOf('.') === -1) {
        throw new Error(
          `Invalid namespaced permission: "${permStr}". Expected format: "server.tool"`,
        );
      }
    }

    // Create nested structure for ALL methods (not just granted ones)
    for (const [permStr, implementation] of Object.entries(this.methodImplementations)) {
      const perm = permStr as P;
      const dotIndex = permStr.indexOf('.');

      if (dotIndex === -1) {
        continue; // Skip methods without proper namespace format
      }

      const server = permStr.slice(0, dotIndex);
      const tool = permStr.slice(dotIndex + 1);

      // Create server namespace if it doesn't exist
      if (!baseObj[server]) {
        baseObj[server] = {};
      }

      // Add the method wrapper (with permission check)
      baseObj[server][tool] = (...args: any[]) => {
        // Verify runtime integrity
        if (!this.verify(runtimeObj)) {
          throw new Error('Invalid runtime: verification failed');
        }

        // Check permission
        if (!permissions.includes(perm)) {
          throw new Error(
            `Missing permission: ${String(perm)} (granted: [${permissions.join(', ')}])`,
          );
        }

        // Call the actual implementation
        return (implementation as (...args: any[]) => any)(...args);
      };
    }

    // Freeze all nested server objects
    for (const key of Object.keys(baseObj)) {
      if (
        key !== RuntimeSecret.toString() &&
        typeof baseObj[key] === 'object' &&
        baseObj[key] !== null
      ) {
        Object.freeze(baseObj[key]);
      }
    }

    // Freeze the root object
    const runtimeObj = Object.freeze(baseObj) as PickNamespacedRuntime<readonly P[], P, Methods>;

    return runtimeObj;
  }
}
