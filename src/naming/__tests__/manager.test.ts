import { beforeEach, describe, expect, test } from 'bun:test';
import { NamingManager, resetNamingManager } from '../manager.js';

describe('NamingManager', () => {
  let manager: NamingManager;

  beforeEach(() => {
    resetNamingManager();
    manager = new NamingManager();
  });

  describe('getServerNames', () => {
    test('converts hyphenated server name correctly', () => {
      const names = manager.getServerNames('demo-filesystem');

      expect(names.mcp).toBe('demo-filesystem');
      expect(names.property).toBe('demoFilesystem');
      expect(names.type).toBe('DemoFilesystem');
      expect(names.directory).toBe('demo-filesystem');
      expect(names.camelCase).toBe('demoFilesystem');
    });

    test('handles simple server name', () => {
      const names = manager.getServerNames('filesystem');

      expect(names.mcp).toBe('filesystem');
      expect(names.property).toBe('filesystem');
      expect(names.type).toBe('Filesystem');
      expect(names.directory).toBe('filesystem');
    });

    test('handles underscored server name', () => {
      const names = manager.getServerNames('test_server');

      expect(names.mcp).toBe('test_server');
      expect(names.property).toBe('testServer');
      expect(names.type).toBe('TestServer');
    });

    test('throws on invalid server name', () => {
      expect(() => manager.getServerNames('')).toThrow('Invalid server name');
      expect(() => manager.getServerNames('Invalid!')).toThrow('Invalid server name');
    });

    test('caches results', () => {
      const names1 = manager.getServerNames('filesystem');
      const names2 = manager.getServerNames('filesystem');

      expect(names1).toBe(names2); // Same object reference
    });

    test('returns frozen object', () => {
      const names = manager.getServerNames('filesystem');
      expect(Object.isFrozen(names)).toBe(true);
    });
  });

  describe('getToolNames', () => {
    test('preserves snake_case tool name', () => {
      const names = manager.getToolNames('read_file');

      expect(names.mcp).toBe('read_file');
      expect(names.property).toBe('read_file'); // Preserved!
      expect(names.file).toBe('readFile'); // camelCase for filesystem
      expect(names.type).toBe('ReadFile'); // PascalCase for types
      expect(names.permissionSuffix).toBe('read_file');
    });

    test('preserves camelCase tool name', () => {
      const names = manager.getToolNames('printEnv');

      expect(names.mcp).toBe('printEnv');
      expect(names.property).toBe('printEnv'); // Preserved!
      expect(names.file).toBe('printEnv'); // Already safe
      expect(names.type).toBe('PrintEnv');
      expect(names.permissionSuffix).toBe('printEnv');
    });

    test('handles PascalCase tool name', () => {
      const names = manager.getToolNames('GetTinyImage');

      expect(names.mcp).toBe('GetTinyImage');
      expect(names.property).toBe('GetTinyImage');
      expect(names.file).toBe('GetTinyImage');
      expect(names.type).toBe('GetTinyImage');
    });

    test('handles lowercase tool name', () => {
      const names = manager.getToolNames('echo');

      expect(names.mcp).toBe('echo');
      expect(names.property).toBe('echo');
      expect(names.file).toBe('echo');
      expect(names.type).toBe('Echo');
    });

    test('throws on invalid tool name', () => {
      expect(() => manager.getToolNames('')).toThrow('Invalid tool name');
      expect(() => manager.getToolNames('123invalid')).toThrow('Invalid tool name');
    });

    test('caches results', () => {
      const names1 = manager.getToolNames('read_file');
      const names2 = manager.getToolNames('read_file');

      expect(names1).toBe(names2);
    });

    test('returns frozen object', () => {
      const names = manager.getToolNames('read_file');
      expect(Object.isFrozen(names)).toBe(true);
    });
  });

  describe('getPermissionNames', () => {
    test('generates permission ID with snake_case tool', () => {
      const perms = manager.getPermissionNames('filesystem', 'read_file');

      expect(perms.user).toBe('filesystem.read_file');
      expect(perms.mcp).toBe('filesystem.read_file');
      expect(perms.path).toBe('filesystem.read_file');
    });

    test('generates permission ID with camelCase tool', () => {
      const perms = manager.getPermissionNames('everything', 'printEnv');

      expect(perms.user).toBe('everything.printEnv');
      expect(perms.mcp).toBe('everything.printEnv');
      expect(perms.path).toBe('everything.printEnv');
    });

    test('handles hyphenated server name', () => {
      const perms = manager.getPermissionNames('demo-filesystem', 'read_file');

      expect(perms.user).toBe('demo-filesystem.read_file');
      expect(perms.mcp).toBe('demo-filesystem.read_file');
    });

    test('returns frozen object', () => {
      const perms = manager.getPermissionNames('filesystem', 'read_file');
      expect(Object.isFrozen(perms)).toBe(true);
    });
  });

  describe('getToolContext', () => {
    test('generates complete context', () => {
      const ctx = manager.getToolContext('filesystem', 'read_file');

      expect(ctx.server.mcp).toBe('filesystem');
      expect(ctx.server.property).toBe('filesystem');
      expect(ctx.tool.mcp).toBe('read_file');
      expect(ctx.tool.property).toBe('read_file');
      expect(ctx.permission.user).toBe('filesystem.read_file');
      expect(ctx.permission.mcp).toBe('filesystem.read_file');
    });

    test('handles complex names', () => {
      const ctx = manager.getToolContext('demo-filesystem', 'list_directory');

      expect(ctx.server.mcp).toBe('demo-filesystem');
      expect(ctx.server.property).toBe('demoFilesystem');
      expect(ctx.tool.mcp).toBe('list_directory');
      expect(ctx.tool.property).toBe('list_directory');
      expect(ctx.tool.file).toBe('listDirectory');
      expect(ctx.permission.user).toBe('demo-filesystem.list_directory');
    });

    test('caches results', () => {
      const ctx1 = manager.getToolContext('filesystem', 'read_file');
      const ctx2 = manager.getToolContext('filesystem', 'read_file');

      expect(ctx1).toBe(ctx2);
    });

    test('returns frozen object', () => {
      const ctx = manager.getToolContext('filesystem', 'read_file');
      expect(Object.isFrozen(ctx)).toBe(true);
    });
  });

  describe('clearCache', () => {
    test('clears all caches', () => {
      const names1 = manager.getToolNames('read_file');
      manager.clearCache();
      const names2 = manager.getToolNames('read_file');

      // Different objects after cache clear
      expect(names1).not.toBe(names2);
      // But same values
      expect(names1).toEqual(names2);
    });
  });

  describe('edge cases', () => {
    test('handles tools with numbers', () => {
      const names = manager.getToolNames('tool123');

      expect(names.mcp).toBe('tool123');
      expect(names.property).toBe('tool123');
    });

    test('handles long tool names', () => {
      const longName = 'read_file_from_directory_with_long_name';
      const names = manager.getToolNames(longName);

      expect(names.mcp).toBe(longName);
      expect(names.property).toBe(longName);
      expect(names.file).toBe('readFileFromDirectoryWithLongName');
    });

    test('handles mixed snake_case and camelCase', () => {
      const names = manager.getToolNames('get_tiny_image');

      expect(names.mcp).toBe('get_tiny_image');
      expect(names.file).toBe('getTinyImage');
      expect(names.type).toBe('GetTinyImage');
    });
  });
});
