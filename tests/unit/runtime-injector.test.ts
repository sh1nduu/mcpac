/**
 * Unit tests for RuntimeInjector
 *
 * Tests runtime initialization code injection, removal, and re-injection.
 */

import { describe, expect, test } from 'bun:test';
import { injectRuntime, RuntimeInjector } from '../../src/executor/runtime-injector.js';

describe('RuntimeInjector', () => {
  const injector = new RuntimeInjector();

  describe('Basic injection', () => {
    test('should inject runtime initialization before user code', () => {
      const userCode = `
        console.log('Hello, World!');
      `;

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      expect(modifiedCode).toContain('// MCPaC Runtime Initialization (auto-injected)');
      expect(modifiedCode).toContain("import type { McpRequires } from './servers/_types.js';");
      expect(modifiedCode).toContain(
        "import { createRuntime } from './servers/_mcpac_runtime.js';",
      );
      expect(modifiedCode).toContain('const runtime = createRuntime([');
      expect(modifiedCode).toContain("'filesystem.read_file'");
      expect(modifiedCode).toContain('// User Code (below)');
      expect(modifiedCode).toContain("console.log('Hello, World!');");
    });

    test('should inject multiple permissions', () => {
      const userCode = `
        const data = await runtime.filesystem.read_file({ path: '/data.txt' });
        await runtime.filesystem.write_file({ path: '/output.txt', content: data });
      `;

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file', 'filesystem.write_file'],
      });

      expect(modifiedCode).toContain("'filesystem.read_file',");
      expect(modifiedCode).toContain("'filesystem.write_file'");
    });

    test('should inject with empty permissions array', () => {
      const userCode = `
        console.log('No permissions needed');
      `;

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: [],
      });

      expect(modifiedCode).toContain('const runtime = createRuntime([');
      expect(modifiedCode).toContain(']);');
      expect(modifiedCode).not.toContain("'filesystem");
    });

    test('should inject with single permission', () => {
      const userCode = `
        const data = await runtime.filesystem.read_file({ path: '/data.txt' });
      `;

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      expect(modifiedCode).toContain("'filesystem.read_file'");
      expect(modifiedCode).not.toContain(',\n');
    });
  });

  describe('Custom options', () => {
    test('should use custom runtime module path', () => {
      const userCode = `console.log('test');`;

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
        runtimeModulePath: './custom/runtime.js',
      });

      expect(modifiedCode).toContain("import { createRuntime } from './custom/runtime.js';");
    });

    test('should use custom types module path', () => {
      const userCode = `console.log('test');`;

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
        typesModulePath: './custom/types.js',
      });

      expect(modifiedCode).toContain("import type { McpRequires } from './custom/types.js';");
    });

    test('should use custom runtime variable name', () => {
      const userCode = `console.log('test');`;

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
        runtimeVariableName: 'rt',
      });

      expect(modifiedCode).toContain('const rt = createRuntime([');
    });

    test('should use all custom options together', () => {
      const userCode = `console.log('test');`;

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
        runtimeModulePath: './custom/runtime.js',
        typesModulePath: './custom/types.js',
        runtimeVariableName: 'rt',
      });

      expect(modifiedCode).toContain("import type { McpRequires } from './custom/types.js';");
      expect(modifiedCode).toContain("import { createRuntime } from './custom/runtime.js';");
      expect(modifiedCode).toContain('const rt = createRuntime([');
    });
  });

  describe('hasInjection detection', () => {
    test('should detect injected code', () => {
      const userCode = `console.log('test');`;
      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      expect(injector.hasInjection(modifiedCode)).toBe(true);
    });

    test('should return false for non-injected code', () => {
      const userCode = `console.log('test');`;

      expect(injector.hasInjection(userCode)).toBe(false);
    });

    test('should return false for code with similar but different comments', () => {
      const userCode = `
        // MCPaC Runtime
        console.log('test');
      `;

      expect(injector.hasInjection(userCode)).toBe(false);
    });
  });

  describe('removeInjection', () => {
    test('should remove injected runtime code', () => {
      const userCode = `console.log('Hello, World!');`;
      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      const cleanedCode = injector.removeInjection(modifiedCode);

      expect(cleanedCode.trim()).toBe(userCode.trim());
      expect(cleanedCode).not.toContain('MCPaC Runtime Initialization');
      expect(cleanedCode).not.toContain('createRuntime');
    });

    test('should return original code if no injection found', () => {
      const userCode = `console.log('Hello, World!');`;

      const cleanedCode = injector.removeInjection(userCode);

      expect(cleanedCode).toBe(userCode);
    });

    test('should handle code with incomplete injection markers', () => {
      const codeWithStartMarker = `
        // ============================================================================
        // MCPaC Runtime Initialization (auto-injected)
        console.log('test');
      `;

      const cleaned = injector.removeInjection(codeWithStartMarker);

      expect(cleaned).toBe(codeWithStartMarker);
    });

    test('should preserve indentation and formatting', () => {
      const userCode = `
        function test() {
          console.log('test');
        }
      `;
      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      const cleanedCode = injector.removeInjection(modifiedCode);

      expect(cleanedCode.trim()).toBe(userCode.trim());
    });
  });

  describe('reinject', () => {
    test('should remove old injection and inject new permissions', () => {
      const userCode = `console.log('Hello, World!');`;
      const firstInjection = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      const secondInjection = injector.reinject(firstInjection, {
        grantedPermissions: ['filesystem.write_file'],
      });

      expect(secondInjection).toContain('filesystem.write_file');
      expect(secondInjection).not.toContain('filesystem.read_file');
      expect(secondInjection.match(/MCPaC Runtime Initialization/g)).toHaveLength(1);
    });

    test('should work on code without existing injection', () => {
      const userCode = `console.log('Hello, World!');`;

      const injected = injector.reinject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      expect(injected).toContain('MCPaC Runtime Initialization');
      expect(injected).toContain('filesystem.read_file');
    });

    test('should update permissions correctly', () => {
      const userCode = `const data = await runtime.filesystem.read_file({ path: '/data.txt' });`;

      const first = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      const second = injector.reinject(first, {
        grantedPermissions: ['filesystem.read_file', 'filesystem.write_file'],
      });

      expect(second).toContain('filesystem.read_file');
      expect(second).toContain('filesystem.write_file');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty user code', () => {
      const userCode = '';

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      expect(modifiedCode).toContain('MCPaC Runtime Initialization');
      expect(modifiedCode).toContain('filesystem.read_file');
    });

    test('should handle user code with only whitespace', () => {
      const userCode = '   \n\n   ';

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      expect(modifiedCode).toContain('MCPaC Runtime Initialization');
    });

    test('should handle very long permission lists', () => {
      const permissions = Array.from({ length: 100 }, (_, i) => `server${i}.tool${i}`);

      const modifiedCode = injector.inject('console.log("test");', {
        grantedPermissions: permissions,
      });

      for (let i = 0; i < 100; i++) {
        expect(modifiedCode).toContain(`'server${i}.tool${i}'`);
      }
    });

    test('should handle permissions with special characters', () => {
      const modifiedCode = injector.inject('console.log("test");', {
        grantedPermissions: ['file-system.read_file', 'http-client.get_request'],
      });

      expect(modifiedCode).toContain("'file-system.read_file'");
      expect(modifiedCode).toContain("'http-client.get_request'");
    });

    test('should preserve user code with runtime initialization comments', () => {
      const userCode = `
        // Initialize runtime
        const data = await runtime.filesystem.read_file({ path: '/data.txt' });
      `;

      const modifiedCode = injector.inject(userCode, {
        grantedPermissions: ['filesystem.read_file'],
      });

      expect(modifiedCode).toContain('// Initialize runtime');
      expect(modifiedCode).toContain('const data = await runtime.filesystem.read_file');
    });
  });

  describe('injectRuntime convenience function', () => {
    test('should work as standalone function', () => {
      const userCode = `console.log('test');`;

      const modifiedCode = injectRuntime(userCode, ['filesystem.read_file']);

      expect(modifiedCode).toContain('MCPaC Runtime Initialization');
      expect(modifiedCode).toContain('filesystem.read_file');
    });

    test('should produce same result as RuntimeInjector.inject()', () => {
      const userCode = `console.log('test');`;
      const permissions = ['filesystem.read_file', 'filesystem.write_file'];

      const result1 = injectRuntime(userCode, permissions);
      const result2 = injector.inject(userCode, { grantedPermissions: permissions });

      expect(result1).toBe(result2);
    });
  });
});
