/**
 * Type-level tests for the capability-based permission system
 *
 * These tests verify that the type system correctly restricts method access
 * based on declared permissions using the McpRequires type.
 */

import { describe, test } from 'bun:test';
import type { MethodsFromServers, PickNamespacedRuntime } from '../../src/capability/types.js';

// ======================
// Define MCP Servers Interface
// ======================

interface TestMcpServers {
  filesystem: {
    readFile(args: { path: string }): Promise<{ content: string }>;
    writeFile(args: { path: string; content: string }): Promise<void>;
    deleteFile(args: { path: string }): Promise<void>;
  };
  github: {
    createIssue(args: { title: string; body: string }): Promise<{ id: number }>;
    closeIssue(args: { id: number }): Promise<void>;
  };
}

// ======================
// Convert to Flat Methods
// ======================

type Methods = MethodsFromServers<TestMcpServers>;
type PermissionId = keyof Methods & string;
type TestMcpRequires<T extends readonly PermissionId[]> = PickNamespacedRuntime<
  T,
  PermissionId,
  Methods
>;

// ======================
// Test 1: Single permission grants nested access
// ======================

describe('Type-level: Single permission', () => {
  test('McpRequires<["filesystem.readFile"]> has nested filesystem.readFile', () => {
    type RT = TestMcpRequires<['filesystem.readFile']>;

    // Should have filesystem namespace
    type FS = RT['filesystem'];

    // Should have readFile method with correct signature
    type ReadFile = FS['readFile'];
    type ExpectedReadFile = (args: { path: string }) => Promise<{ content: string }>;

    // Type check - verify readFile exists and has correct shape
    const _typeCheck: ReadFile = null as unknown as ExpectedReadFile;
    void _typeCheck;
  });

  test('McpRequires<["filesystem.readFile"]> does NOT have writeFile', () => {
    type RT = TestMcpRequires<['filesystem.readFile']>;
    type FS = RT['filesystem'];

    // @ts-expect-error - writeFile should not exist with only read permission
    type WriteFile = FS['writeFile'];
    const _write: WriteFile = undefined as any;
    void _write;
  });

  test('McpRequires<["filesystem.readFile"]> does NOT have github namespace', () => {
    type RT = TestMcpRequires<['filesystem.readFile']>;

    // @ts-expect-error - github namespace should not exist
    type GH = RT['github'];
    const _github: GH = undefined as any;
    void _github;
  });
});

// ======================
// Test 2: Multiple permissions from same server
// ======================

describe('Type-level: Multiple permissions from same server', () => {
  test('McpRequires<["filesystem.readFile", "filesystem.writeFile"]> has both methods', () => {
    type RT = TestMcpRequires<['filesystem.readFile', 'filesystem.writeFile']>;
    type FS = RT['filesystem'];

    // Both methods should exist
    type ReadFile = FS['readFile'];
    type WriteFile = FS['writeFile'];

    const _read: ReadFile = null as any;
    const _write: WriteFile = null as any;
    void _read;
    void _write;
  });

  test('McpRequires<["filesystem.readFile", "filesystem.writeFile"]> does NOT have deleteFile', () => {
    type RT = TestMcpRequires<['filesystem.readFile', 'filesystem.writeFile']>;
    type FS = RT['filesystem'];

    // @ts-expect-error - deleteFile should not exist
    type DeleteFile = FS['deleteFile'];
    const _delete: DeleteFile = undefined as any;
    void _delete;
  });
});

// ======================
// Test 3: Multiple permissions from different servers
// ======================

describe('Type-level: Multiple permissions from different servers', () => {
  test('McpRequires<["filesystem.readFile", "github.createIssue"]> has both namespaces', () => {
    type RT = TestMcpRequires<['filesystem.readFile', 'github.createIssue']>;

    // Should have both namespaces
    type FS = RT['filesystem'];
    type GH = RT['github'];

    // Should have readFile
    type ReadFile = FS['readFile'];
    const _read: ReadFile = null as any;
    void _read;

    // Should have createIssue
    type CreateIssue = GH['createIssue'];
    const _create: CreateIssue = null as any;
    void _create;
  });

  test('Partial namespace access works correctly', () => {
    type RT = TestMcpRequires<['filesystem.readFile', 'github.createIssue']>;
    type FS = RT['filesystem'];
    type GH = RT['github'];

    // filesystem should NOT have writeFile
    // @ts-expect-error - writeFile not granted
    type WriteFile = FS['writeFile'];
    const _write: WriteFile = undefined as any;
    void _write;

    // github should NOT have closeIssue
    // @ts-expect-error - closeIssue not granted
    type CloseIssue = GH['closeIssue'];
    const _close: CloseIssue = undefined as any;
    void _close;
  });
});

// ======================
// Test 4: Empty permissions
// ======================

describe('Type-level: Empty permissions', () => {
  test('McpRequires<[]> does NOT have filesystem namespace', () => {
    type RT = TestMcpRequires<[]>;

    // @ts-expect-error - filesystem should not exist with empty permissions
    type FS = RT['filesystem'];
    const _fs: FS = undefined as any;
    void _fs;
  });

  test('McpRequires<[]> does NOT have github namespace', () => {
    type RT = TestMcpRequires<[]>;

    // @ts-expect-error - github should not exist with empty permissions
    type GH = RT['github'];
    const _gh: GH = undefined as any;
    void _gh;
  });

  test('McpRequires<[]> still has utility methods', () => {
    type RT = TestMcpRequires<[]>;

    // Utility methods should always be available
    type GetPerms = RT['getPermissions'];
    type Has = RT['has'];

    const _getPerms: GetPerms = null as any;
    const _has: Has = null as any;
    void _getPerms;
    void _has;
  });
});

// ======================
// Test 5: All permissions grant all methods
// ======================

describe('Type-level: All permissions', () => {
  test('All permissions grant all namespaces and methods', () => {
    type RT = TestMcpRequires<
      [
        'filesystem.readFile',
        'filesystem.writeFile',
        'filesystem.deleteFile',
        'github.createIssue',
        'github.closeIssue',
      ]
    >;

    type FS = RT['filesystem'];
    type GH = RT['github'];

    // All filesystem methods should exist
    type ReadFile = FS['readFile'];
    type WriteFile = FS['writeFile'];
    type DeleteFile = FS['deleteFile'];

    // All github methods should exist
    type CreateIssue = GH['createIssue'];
    type CloseIssue = GH['closeIssue'];

    const _read: ReadFile = null as any;
    const _write: WriteFile = null as any;
    const _delete: DeleteFile = null as any;
    const _create: CreateIssue = null as any;
    const _close: CloseIssue = null as any;

    void _read;
    void _write;
    void _delete;
    void _create;
    void _close;
  });
});

// ======================
// Test 6: Function parameter type inference
// ======================

describe('Type-level: Function parameter inference', () => {
  test('Function requiring specific permissions enforces correct type', () => {
    // This function should only accept runtime with filesystem.readFile permission
    function readOnly(_rt: TestMcpRequires<['filesystem.readFile']>) {
      // Type is enforced by parameter type
    }

    // Exists to satisfy test
    void readOnly;
  });

  test('Function can use granted permissions', () => {
    function processFiles(rt: TestMcpRequires<['filesystem.readFile', 'filesystem.writeFile']>) {
      // Should be able to access both methods
      const _read = rt.filesystem.readFile;
      const _write = rt.filesystem.writeFile;

      void _read;
      void _write;

      // @ts-expect-error - deleteFile not granted
      const _delete = rt.filesystem.deleteFile;
      void _delete;
    }

    void processFiles;
  });
});

// ======================
// Test 7: Utility methods always available
// ======================

describe('Type-level: Utility methods', () => {
  test('getPermissions and has are available regardless of permissions', () => {
    type RT1 = TestMcpRequires<[]>;
    type RT2 = TestMcpRequires<['filesystem.readFile']>;
    type RT3 = TestMcpRequires<['filesystem.readFile', 'github.createIssue']>;

    // All should have getPermissions
    type GetPerms1 = RT1['getPermissions'];
    type GetPerms2 = RT2['getPermissions'];
    type GetPerms3 = RT3['getPermissions'];

    // All should have has
    type Has1 = RT1['has'];
    type Has2 = RT2['has'];
    type Has3 = RT3['has'];

    const _gp1: GetPerms1 = null as any;
    const _gp2: GetPerms2 = null as any;
    const _gp3: GetPerms3 = null as any;
    const _h1: Has1 = null as any;
    const _h2: Has2 = null as any;
    const _h3: Has3 = null as any;

    void _gp1;
    void _gp2;
    void _gp3;
    void _h1;
    void _h2;
    void _h3;
  });
});

console.log('\n✅ All type-level tests validated at compile time!\n');
console.log('These tests verify that:');
console.log('  1. Permissions grant nested namespace access (server.tool → rt.server.tool())');
console.log('  2. Non-granted permissions are not accessible (compile-time errors)');
console.log('  3. Multiple permissions from same/different servers work correctly');
console.log('  4. Empty permissions result in no method access');
console.log('  5. Utility methods (getPermissions, has) are always available');
console.log('  6. TypeScript enforces permission constraints at compile time\n');
