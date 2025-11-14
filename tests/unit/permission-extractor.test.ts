/**
 * Unit tests for PermissionExtractor
 *
 * Tests high-level permission extraction from user code,
 * wrapping PermissionValidator with a clean interface.
 */

import { describe, expect, test } from 'bun:test';
import {
  extractPermissions,
  PermissionExtractor,
} from '../../src/executor/permission-extractor.js';

describe('PermissionExtractor', () => {
  const extractor = new PermissionExtractor();

  describe('Successful extraction', () => {
    test('should extract permissions from valid code', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function processFiles(rt: McpRequires<['filesystem.read_file', 'filesystem.write_file']>) {
          return rt.filesystem.read_file({ path: '/data.txt' });
        }
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(true);
      expect(result.permissions).toEqual(['filesystem.read_file', 'filesystem.write_file']);
      expect(result.errors).toHaveLength(0);
    });

    test('should extract permissions from multiple functions', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function read(rt: McpRequires<['filesystem.read_file']>) {
          // implementation
        }

        function write(rt: McpRequires<['filesystem.write_file']>) {
          // implementation
        }
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(true);
      expect(result.permissions).toHaveLength(2);
      expect(result.permissions).toContain('filesystem.read_file');
      expect(result.permissions).toContain('filesystem.write_file');
    });

    test('should deduplicate permissions across functions', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function read1(rt: McpRequires<['filesystem.read_file']>) {}
        function read2(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(true);
      expect(result.permissions).toEqual(['filesystem.read_file']);
    });

    test('should extract permissions from variable declarations', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        const runtime: McpRequires<['filesystem.read_file']> = createRuntime(['filesystem.read_file']);
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(true);
      expect(result.permissions).toEqual(['filesystem.read_file']);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('Validation failures', () => {
    test('should fail for import from unknown source', () => {
      const code = `
        import type { McpRequires } from 'malicious-package';

        function hack(rt: McpRequires<['filesystem.read_file']>) {
          // This should fail
        }
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(false);
      expect(result.permissions).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.location).toContain('hack');
      expect(result.errors[0]?.typeName).toBe('McpRequires');
      expect(result.errors[0]?.reason).toContain('unknown source');
    });

    test('should fail for forged local type', () => {
      const code = `
        // Forged type without PickNamespacedRuntime
        type McpRequires<T> = any;

        function bypass(rt: McpRequires<['filesystem.read_file']>) {
          // This should fail
        }
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]?.reason).toContain('forgery risk');
    });

    test('should collect multiple errors from multiple invalid declarations', () => {
      const code = `
        import type { McpRequires } from 'bad-package';
        type FakeRequires<T> = any;

        function hack1(rt: McpRequires<['filesystem.read_file']>) {}
        function hack2(rt: FakeRequires<['filesystem.write_file']>) {}
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
    });
  });

  describe('Warnings', () => {
    test('should warn about locally defined type using PickNamespacedRuntime', () => {
      const code = `
        import type { PickNamespacedRuntime } from './servers/_mcpac_runtime';

        type McpRequires<T extends readonly string[]> = PickNamespacedRuntime<T, string, any>;

        function process(rt: McpRequires<['filesystem.read_file']>) {
          // Valid but should warn
        }
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(true);
      expect(result.permissions).toEqual(['filesystem.read_file']);
      expect(result.warnings).toHaveLength(1);
      expect(result.warnings[0]).toContain('⚠️');
      expect(result.warnings[0]).toContain('locally defined');
    });
  });

  describe('Edge cases', () => {
    test('should handle code with no McpRequires types', () => {
      const code = `
        function regularFunction(x: number, y: string) {
          return x + y;
        }
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(true);
      expect(result.permissions).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    test('should handle empty permissions array', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function noPerms(rt: McpRequires<[]>) {
          // No permissions
        }
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(true);
      expect(result.permissions).toHaveLength(0);
    });

    test('should handle mixed valid and ignored types', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function process(
          rt: McpRequires<['filesystem.read_file']>,
          count: number,
          name: string
        ) {
          // Only McpRequires should be extracted
        }
      `;

      const result = extractor.extract(code);

      expect(result.success).toBe(true);
      expect(result.permissions).toEqual(['filesystem.read_file']);
    });
  });

  describe('Helper methods', () => {
    test('hasPermissionDeclarations() returns true when McpRequires exists', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function test(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const result = extractor.hasPermissionDeclarations(code);

      expect(result).toBe(true);
    });

    test('hasPermissionDeclarations() returns false when no McpRequires', () => {
      const code = `
        function regularFunction(x: number) {
          return x * 2;
        }
      `;

      const result = extractor.hasPermissionDeclarations(code);

      expect(result).toBe(false);
    });

    test('validate() returns true for valid code', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function test(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const result = extractor.validate(code);

      expect(result).toBe(true);
    });

    test('validate() returns false for invalid code', () => {
      const code = `
        import type { McpRequires } from 'bad-package';

        function test(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const result = extractor.validate(code);

      expect(result).toBe(false);
    });

    test('getReport() returns formatted validation report', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function read(rt: McpRequires<['filesystem.read_file']>) {}
        function write(rt: McpRequires<['filesystem.write_file']>) {}
      `;

      const report = extractor.getReport(code);

      expect(report).toContain('Permission Validation Report:');
      expect(report).toContain('✓ read');
      expect(report).toContain('✓ write');
      expect(report).toContain('filesystem.read_file');
      expect(report).toContain('filesystem.write_file');
      expect(report).toContain('✓ All validations passed');
    });

    test('getReport() shows errors for invalid code', () => {
      const code = `
        import type { McpRequires } from 'bad-package';

        function hack(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const report = extractor.getReport(code);

      expect(report).toContain('✗ hack');
      expect(report).toContain('unknown source');
      expect(report).toContain('✗ Validation failed');
    });

    test('getValidationResults() returns raw validation results', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function test(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const results = extractor.getValidationResults(code);

      expect(results).toHaveLength(1);
      expect(results[0]?.isValid).toBe(true);
      expect(results[0]?.functionName).toBe('test');
      expect(results[0]?.paramName).toBe('rt');
      expect(results[0]?.permissions).toEqual(['filesystem.read_file']);
    });
  });

  describe('extractPermissions convenience function', () => {
    test('should work as standalone function', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function test(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const result = extractPermissions(code);

      expect(result.success).toBe(true);
      expect(result.permissions).toEqual(['filesystem.read_file']);
    });

    test('should accept optional fileName parameter', () => {
      const code = `
        import type { McpRequires } from './servers/_types';

        function test(rt: McpRequires<['filesystem.read_file']>) {}
      `;

      const result = extractPermissions(code, 'test.ts');

      expect(result.success).toBe(true);
      // fileName is used internally for error messages
    });
  });
});
