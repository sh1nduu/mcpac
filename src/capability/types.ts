/**
 * MCPaC Capability-Based Permission System - Type Definitions
 *
 * Type-safe permission system for MCP tool access using TypeScript's type system.
 * Provides compile-time checking of tool access within user code.
 */

/**
 * Generic permission type - string literal representing "server.tool" format
 *
 * @example
 * ```ts
 * type PermissionId = 'filesystem.read_file' | 'github.create_issue';
 * ```
 */
export type PermissionType<P extends string = string> = P;

/**
 * Full runtime interface with utility methods for permission inspection.
 *
 * @template P - Permission string literal type
 * @template _Methods - Record of permission names to method signatures (used for type constraint)
 */
export interface FullRuntime<
  P extends string,
  _Methods extends Record<P, (...args: any[]) => any>,
> {
  /**
   * Get the list of granted permissions
   * @returns Readonly array of permission IDs
   */
  getPermissions(): readonly P[];

  /**
   * Check if a specific permission is granted
   * @param perm - Permission ID to check
   * @returns True if the permission is granted
   */
  has<Perm extends P>(perm: Perm): boolean;
}

/**
 * Create a full runtime type by combining the base runtime with method definitions
 *
 * @template P - Permission type
 * @template Methods - Method definitions for each permission
 */
export type RuntimeWithMethods<
  P extends string,
  Methods extends Record<P, (...args: any[]) => any>,
> = FullRuntime<P, Methods> & Methods;

/**
 * Convert permission array to union of permission names
 *
 * @template T - Readonly array of permissions
 */
export type PermissionsToUnion<T extends readonly string[]> = T[number];

/**
 * Pick runtime type with only the methods corresponding to declared permissions.
 * This is an internal type - users should use McpRequires<T> instead.
 *
 * @template Perms - Array of required permissions
 * @template Methods - Method signatures for each permission
 *
 * @example
 * ```ts
 * // Internal usage
 * type Runtime = PickRuntime<['filesystem.read_file'], Methods>;
 * ```
 */
export type PickRuntime<Perms extends readonly (keyof Methods & string)[], Methods> = Pick<
  FullRuntime<
    keyof Methods & string,
    Methods & Record<keyof Methods & string, (...args: any[]) => any>
  > &
    Methods,
  Perms[number] | 'getPermissions' | 'has'
>;

/**
 * Helper type to extract method names from a permission array
 */
export type ExtractMethods<
  Perms extends readonly string[],
  Methods extends Record<string, (...args: any[]) => any>,
> = Perms[number] & keyof Methods;

// ============================================================================
// Namespaced Runtime Types (MCP-style)
// ============================================================================

/**
 * Helper type to flatten one server's methods into "server.tool" format
 *
 * @template ServerName - Name of the MCP server
 * @template Tools - Methods available on the server
 *
 * @example
 * ```ts
 * type Tools = { read: () => string; write: (data: string) => void };
 * type Flat = FlattenServer<'filesystem', Tools>;
 * // Result: { 'filesystem.read': () => string; 'filesystem.write': (data: string) => void }
 * ```
 */
type FlattenServer<ServerName extends string, Tools> = {
  [Tool in keyof Tools & string as `${ServerName}.${Tool}`]: Tools[Tool];
};

/**
 * Union to Intersection helper type
 * Converts Union<A | B | C> to Intersection<A & B & C>
 */
type UnionToIntersection<U> = (U extends any ? (x: U) => void : never) extends (x: infer I) => void
  ? I
  : never;

/**
 * Convert nested server/tool structure to flat "server.tool" method map.
 * This allows defining MCP servers naturally while maintaining flat permission IDs.
 *
 * @template Servers - Nested interface of { server: { tool: method } }
 *
 * @example
 * ```ts
 * interface McpServers {
 *   filesystem: {
 *     read_file(args: { path: string }): Promise<string>;
 *     write_file(args: { path: string; content: string }): Promise<void>;
 *   };
 *   github: {
 *     create_issue(args: { title: string; body: string }): Promise<void>;
 *   };
 * }
 *
 * type Methods = MethodsFromServers<McpServers>;
 * // Result: {
 * //   'filesystem.read_file': (args: { path: string }) => Promise<string>;
 * //   'filesystem.write_file': (args: { path: string; content: string }) => Promise<void>;
 * //   'github.create_issue': (args: { title: string; body: string }) => Promise<void>;
 * // }
 * ```
 */
export type MethodsFromServers<Servers> = UnionToIntersection<
  {
    [Server in keyof Servers & string]: FlattenServer<Server, Servers[Server]>;
  }[keyof Servers & string]
>;

/**
 * Extract server names from flat "server.tool" keys
 *
 * @template M - Methods record with "server.tool" keys
 *
 * @example
 * ```ts
 * type M = { 'filesystem.read': () => void; 'github.create': () => void };
 * type Servers = ServerNames<M>; // 'filesystem' | 'github'
 * ```
 */
type ServerNames<M> = keyof M & string extends infer K
  ? K extends `${infer S}.${string}`
    ? S
    : never
  : never;

/**
 * Extract tool names for a specific server from "server.tool" keys
 *
 * @template M - Methods record with "server.tool" keys
 * @template S - Server name to filter by
 *
 * @example
 * ```ts
 * type M = { 'filesystem.read': () => void; 'filesystem.write': () => void };
 * type Tools = MethodsForServer<M, 'filesystem'>; // 'read' | 'write'
 * ```
 */
type MethodsForServer<M, S extends string> = keyof M & string extends infer K
  ? K extends `${S}.${infer Tool}`
    ? Tool
    : never
  : never;

/**
 * Filter Methods to only include keys that are in the Perms array
 *
 * @template M - Full Methods record
 * @template Perms - Array of permission IDs to keep
 *
 * @example
 * ```ts
 * type M = { 'filesystem.read': () => void; 'filesystem.write': () => void };
 * type Filtered = FilterMethods<M, ['filesystem.read']>;
 * // Result: { 'filesystem.read': () => void }
 * ```
 */
type FilterMethods<M extends Record<string, any>, Perms extends readonly string[]> = {
  [K in keyof M as K extends Perms[number] ? K : never]: M[K];
};

/**
 * Transform flat "server.tool" methods into nested { server: { tool: method } } structure
 *
 * @template M - Methods record with "server.tool" keys
 *
 * @example
 * ```ts
 * type Flat = {
 *   'filesystem.read_file': (path: string) => string;
 *   'filesystem.write_file': (path: string, content: string) => void;
 * };
 *
 * type Nested = GroupByServer<Flat>;
 * // Result: {
 * //   filesystem: {
 * //     read_file: (path: string) => string;
 * //     write_file: (path: string, content: string) => void;
 * //   }
 * // }
 * ```
 */
type GroupByServer<M extends Record<string, any>> = {
  [S in ServerNames<M>]: {
    [Tool in MethodsForServer<M, S>]: M[`${S}.${Tool}`];
  };
};

/**
 * Create a namespaced runtime type with nested server.tool() access.
 * Permission IDs remain flat ("server.tool") but runtime provides nested structure.
 *
 * This is the main type used by user code for capability-based access.
 *
 * @template Perms - Array of required permissions in "server.tool" format
 * @template P - Union of all permission IDs
 * @template Methods - Flat method map with "server.tool" keys
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
 * type PermissionId = keyof Methods & string;
 *
 * // User-facing alias
 * type McpRequires<T extends readonly PermissionId[]> =
 *   PickNamespacedRuntime<T, PermissionId, Methods>;
 *
 * // Usage in user code
 * async function processFiles(rt: McpRequires<['filesystem.read_file', 'filesystem.write_file']>) {
 *   const content = await rt.filesystem.read_file({ path: '/data.txt' });
 *   await rt.filesystem.write_file({ path: '/output.txt', content });
 *   // await rt.filesystem.delete_file({ path: '/foo' }); // ✗ COMPILE ERROR
 * }
 * ```
 */
export type PickNamespacedRuntime<
  Perms extends readonly string[],
  P extends string,
  Methods extends Record<string, (...args: any[]) => any>,
> = GroupByServer<FilterMethods<Methods, Perms>> &
  FullRuntime<P, Methods & Record<P, (...args: any[]) => any>>;
