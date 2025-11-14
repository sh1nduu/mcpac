/**
 * Unit tests for PermissionValidator
 *
 * Tests AST-based validation of McpRequires type parameters,
 * import source validation, and permission extraction.
 */

import { describe, expect, test } from 'bun:test';
import { PermissionValidator } from '../../src/capability/validator.js';

describe('PermissionValidator', () => {
  describe('Valid McpRequires from legitimate sources', () => {
    test('should validate import from ./servers/_types', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function processFiles(rt: McpRequires<['filesystem.read_file']>) {
          return rt.filesystem.read_file({ path: '/data.txt' });
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results).toHaveLength(1);
      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.read_file']);
      expect(results[0]?.reason).toContain('legitimate library');
    });

    test('should validate import from ./servers/_types.js', () => {
      const code = `
        import type { McpRequires } from './servers/_types.js';

        function upload(rt: McpRequires<['filesystem.write_file']>) {
          // implementation
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.write_file']);
    });

    test('should validate import from ./servers/_mcpac_runtime', () => {
      const code = `
        import type { McpRequires } from './servers/_mcpac_runtime';

        function query(rt: McpRequires<['database.query']>) {
          // implementation
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['database.query']);
    });

    test('should validate import from ./servers/_types.d.ts', () => {
      const code = `
        import type { McpRequires } from './servers/_types.d.ts';

        function processFiles(rt: McpRequires<['filesystem.readFile']>) {
          return rt.filesystem.readFile({ path: '/data.txt' });
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results).toHaveLength(1);
      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.readFile']);
      expect(results[0]?.reason).toContain('legitimate library');
    });
  });

  describe('MCPaC ambient namespace (no import needed)', () => {
    test('should validate MCPaC.McpRequires without import', () => {
      const code = `
        declare const runtime: MCPaC.McpRequires<['filesystem.readFile']>;
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results).toHaveLength(1);
      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.readFile']);
      expect(results[0]?.reason).toContain('trusted MCPaC namespace');
    });

    test('should extract multiple permissions from MCPaC namespace', () => {
      const code = `
        declare const runtime: MCPaC.McpRequires<['filesystem.readFile', 'github.createIssue']>;
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.readFile', 'github.createIssue']);
    });

    test('should validate MCPaC.McpRequires in function parameters', () => {
      const code = `
        function processFiles(rt: MCPaC.McpRequires<['filesystem.readFile']>) {
          return rt.filesystem.readFile({ path: '/data.txt' });
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results).toHaveLength(1);
      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.readFile']);
    });

    test('should validate MCPaC.McpRequires in const variable', () => {
      const code = `
        const rt: MCPaC.McpRequires<['filesystem.readFile', 'filesystem.writeFile']> = createRuntime(['filesystem.readFile', 'filesystem.writeFile']);
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.readFile', 'filesystem.writeFile']);
    });
  });

  describe('Multiple permissions extraction', () => {
    test('should extract multiple permissions from tuple type', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function processFiles(rt: McpRequires<['filesystem.read_file', 'filesystem.write_file']>) {
          // implementation
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.read_file', 'filesystem.write_file']);
    });

    test('should extract permissions from multiple function parameters', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function read(rt: McpRequires<['filesystem.read_file']>) {
          // implementation
        }

        function write(rt: McpRequires<['filesystem.write_file']>) {
          // implementation
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results).toHaveLength(2);
      expect(results[0]?.permissions).toEqual(['filesystem.read_file']);
      expect(results[1]?.permissions).toEqual(['filesystem.write_file']);
      expect(results.every((r) => r.isValid)).toBe(true);
    });

    test('should handle permissions from different servers', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function sync(rt: McpRequires<['filesystem.read_file', 'github.create_issue']>) {
          // implementation
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.read_file', 'github.create_issue']);
    });
  });

  describe('Invalid import sources (type forgery prevention)', () => {
    test('should reject import from unknown package', () => {
      const code = `
        import type { McpRequires } from 'malicious-package';

        function hack(rt: McpRequires<['filesystem.read_file']>) {
          // This should be rejected
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(false);
      expect(results[0]?.reason).toContain('unknown source');
    });

    test('should reject import from relative path outside servers/', () => {
      const code = `
        import type { McpRequires } from '../malicious/types';

        function exploit(rt: McpRequires<['filesystem.read_file']>) {
          // This should be rejected
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(false);
      expect(results[0]?.reason).toContain('unknown source');
    });
  });

  describe('Local type definitions (forgery risk)', () => {
    test('should reject locally defined McpRequires without PickNamespacedRuntime', () => {
      const code = `
        // Forged type definition
        type McpRequires<T> = any;

        function bypass(rt: McpRequires<['filesystem.read_file']>) {
          // This should be rejected
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(false);
      expect(results[0]?.reason).toContain('forgery risk');
    });

    test('should warn about locally defined type using PickNamespacedRuntime', () => {
      const code = `
        import type { PickNamespacedRuntime } from './servers/_mcpac_runtime';

        type McpRequires<T extends readonly string[]> = PickNamespacedRuntime<T, string, any>;

        function process(rt: McpRequires<['filesystem.read_file']>) {
          // This is valid but should warn (should import instead)
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.read_file']);
      expect(results[0]?.reason).toContain('⚠️');
      expect(results[0]?.reason).toContain('locally defined');
    });
  });

  describe('Variable declarations with McpRequires', () => {
    test('should validate global runtime variable declaration', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        declare const runtime: McpRequires<['filesystem.read_file']>;
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results).toHaveLength(1);
      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.functionName).toBe('global');
      expect(results[0]?.permissions).toEqual(['filesystem.read_file']);
    });

    test('should validate const variable with McpRequires type', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        const rt: McpRequires<['filesystem.read_file', 'filesystem.write_file']> = createRuntime(['filesystem.read_file', 'filesystem.write_file']);
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['filesystem.read_file', 'filesystem.write_file']);
    });
  });

  describe('Edge cases', () => {
    test('should handle empty permissions array', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function noPerms(rt: McpRequires<[]>) {
          // No permissions granted
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual([]);
    });

    test('should ignore non-McpRequires types', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function mixed(
          rt: McpRequires<['filesystem.read_file']>,
          count: number,
          name: string
        ) {
          // Only McpRequires parameter should be validated
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results).toHaveLength(1);
      expect(results[0]?.paramName).toBe('rt');
      expect(results[0]?.permissions).toEqual(['filesystem.read_file']);
    });

    test('should handle code with no McpRequires types', () => {
      const code = `
        function regularFunction(x: number, y: string) {
          return x + y;
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      expect(results).toHaveLength(0);
    });

    test('should handle malformed permission IDs gracefully', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        // These are syntactically valid TypeScript but semantically invalid permission IDs
        function test(rt: McpRequires<['invalid', 'no-dot-separator']>) {
          // implementation
        }
      `;

      const validator = new PermissionValidator(code);
      const results = validator.validateFunctions();

      // Validator accepts any string literal, actual validation happens at runtime
      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.permissions).toEqual(['invalid', 'no-dot-separator']);
    });
  });

  describe('extractPermissions convenience method', () => {
    test('should extract all valid permissions from code', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function read(rt: McpRequires<['filesystem.read_file']>) {}
        function write(rt: McpRequires<['filesystem.write_file']>) {}
      `;

      const validator = new PermissionValidator(code);
      const permissions = validator.extractPermissions();

      expect(permissions).toHaveLength(2);
      expect(permissions).toContain('filesystem.read_file');
      expect(permissions).toContain('filesystem.write_file');
    });

    test('should deduplicate permissions', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function read1(rt: McpRequires<['filesystem.read_file']>) {}
        function read2(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const validator = new PermissionValidator(code);
      const permissions = validator.extractPermissions();

      expect(permissions).toHaveLength(1);
      expect(permissions).toEqual(['filesystem.read_file']);
    });
  });

  describe('isValid convenience method', () => {
    test('should return true when all declarations are valid', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function process(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const validator = new PermissionValidator(code);
      expect(validator.isValid()).toBe(true);
    });

    test('should return false when any declaration is invalid', () => {
      const code = `
        import type { McpRequires } from 'malicious-package';

        function hack(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const validator = new PermissionValidator(code);
      expect(validator.isValid()).toBe(false);
    });

    test('should return false when code has no McpRequires declarations', () => {
      const code = `
        function regularFunction(x: number) {
          return x * 2;
        }
      `;

      const validator = new PermissionValidator(code);
      expect(validator.isValid()).toBe(false);
    });
  });
});
