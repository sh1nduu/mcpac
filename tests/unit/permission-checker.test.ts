/**
 * Unit tests for PermissionChecker
 *
 * Tests permission comparison logic, missing/extra permission detection,
 * and detailed error message formatting.
 */

import { describe, expect, test } from 'bun:test';
import { checkPermissions, PermissionChecker } from '../../src/executor/permission-checker.js';

describe('PermissionChecker', () => {
  const checker = new PermissionChecker();

  describe('Permission matching', () => {
    test('should allow when all required permissions are granted', () => {
      const result = checker.check(
        ['filesystem.read_file', 'filesystem.write_file'],
        ['filesystem.read_file', 'filesystem.write_file'],
      );

      expect(result.allowed).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual([]);
    });

    test('should allow when granted permissions include all required (with extras)', () => {
      const result = checker.check(
        ['filesystem.read_file'],
        ['filesystem.read_file', 'filesystem.write_file'],
      );

      expect(result.allowed).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual(['filesystem.write_file']);
    });

    test('should allow when no permissions are required', () => {
      const result = checker.check([], ['filesystem.read_file']);

      expect(result.allowed).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual(['filesystem.read_file']);
    });

    test('should allow when no permissions are required or granted', () => {
      const result = checker.check([], []);

      expect(result.allowed).toBe(true);
      expect(result.missing).toEqual([]);
      expect(result.extra).toEqual([]);
    });
  });

  describe('Permission denial', () => {
    test('should deny when required permission is not granted', () => {
      const result = checker.check(['filesystem.read_file'], []);

      expect(result.allowed).toBe(false);
      expect(result.missing).toEqual(['filesystem.read_file']);
      expect(result.extra).toEqual([]);
    });

    test('should deny when some required permissions are missing', () => {
      const result = checker.check(
        ['filesystem.read_file', 'filesystem.write_file'],
        ['filesystem.read_file'],
      );

      expect(result.allowed).toBe(false);
      expect(result.missing).toEqual(['filesystem.write_file']);
      expect(result.extra).toEqual([]);
    });

    test('should deny when all required permissions are missing', () => {
      const result = checker.check(
        ['filesystem.read_file', 'filesystem.write_file'],
        ['github.create_issue'],
      );

      expect(result.allowed).toBe(false);
      expect(result.missing).toEqual(['filesystem.read_file', 'filesystem.write_file']);
      expect(result.extra).toEqual(['github.create_issue']);
    });
  });

  describe('Summary messages', () => {
    test('should generate success summary with exact match', () => {
      const result = checker.check(['filesystem.read_file'], ['filesystem.read_file']);

      expect(result.summary).toContain('✓');
      expect(result.summary).toContain('1 required permissions granted');
      expect(result.summary).not.toContain('extra');
    });

    test('should generate success summary with extra permissions', () => {
      const result = checker.check(
        ['filesystem.read_file'],
        ['filesystem.read_file', 'filesystem.write_file'],
      );

      expect(result.summary).toContain('✓');
      expect(result.summary).toContain('1 required permissions granted');
      expect(result.summary).toContain('1 extra');
    });

    test('should generate failure summary with missing permission', () => {
      const result = checker.check(['filesystem.read_file'], []);

      expect(result.summary).toContain('✗');
      expect(result.summary).toContain('Missing 1 required permission');
      expect(result.summary).toContain('filesystem.read_file');
    });

    test('should generate failure summary with multiple missing permissions', () => {
      const result = checker.check(
        ['filesystem.read_file', 'filesystem.write_file', 'github.create_issue'],
        [],
      );

      expect(result.summary).toContain('✗');
      expect(result.summary).toContain('Missing 3 required permissions');
      expect(result.summary).toContain('filesystem.read_file');
    });
  });

  describe('Detailed messages', () => {
    test('should provide detailed message for success', () => {
      const result = checker.check(
        ['filesystem.read_file', 'filesystem.write_file'],
        ['filesystem.read_file', 'filesystem.write_file'],
      );

      expect(result.detailedMessage).toContain('Permission Check:');
      expect(result.detailedMessage).toContain('Required permissions (2):');
      expect(result.detailedMessage).toContain('✓ filesystem.read_file');
      expect(result.detailedMessage).toContain('✓ filesystem.write_file');
      expect(result.detailedMessage).toContain('✓ Permission check passed');
    });

    test('should provide detailed message for success with extra permissions', () => {
      const result = checker.check(
        ['filesystem.read_file'],
        ['filesystem.read_file', 'filesystem.write_file', 'github.create_issue'],
      );

      expect(result.detailedMessage).toContain('Granted permissions (3):');
      expect(result.detailedMessage).toContain('✓ filesystem.read_file');
      expect(result.detailedMessage).toContain('⚠ filesystem.write_file (not required)');
      expect(result.detailedMessage).toContain('⚠ github.create_issue (not required)');
      expect(result.detailedMessage).toContain('2 extra permissions granted');
    });

    test('should provide detailed message for failure with missing permissions', () => {
      const result = checker.check(
        ['filesystem.read_file', 'filesystem.write_file'],
        ['filesystem.read_file'],
      );

      expect(result.detailedMessage).toContain('✗ filesystem.write_file');
      expect(result.detailedMessage).toContain('✗ Permission check failed');
      expect(result.detailedMessage).toContain('Missing: filesystem.write_file');
      expect(result.detailedMessage).toContain(
        'To fix this, add the missing permissions with --grant:',
      );
      expect(result.detailedMessage).toContain(
        '--grant filesystem.read_file,filesystem.write_file',
      );
    });

    test('should provide helpful fix suggestion in detailed message', () => {
      const result = checker.check(['filesystem.read_file', 'github.create_issue'], []);

      expect(result.detailedMessage).toContain('--grant filesystem.read_file,github.create_issue');
    });
  });

  describe('Edge cases', () => {
    test('should handle empty required and granted arrays', () => {
      const result = checker.check([], []);

      expect(result.allowed).toBe(true);
      expect(result.summary).toContain('0 required permissions granted');
    });

    test('should handle duplicate permissions in required', () => {
      const result = checker.check(
        ['filesystem.read_file', 'filesystem.read_file'],
        ['filesystem.read_file'],
      );

      expect(result.allowed).toBe(true);
      // Duplicates are not deduplicated by checker (consumer responsibility)
    });

    test('should handle duplicate permissions in granted', () => {
      const result = checker.check(
        ['filesystem.read_file'],
        ['filesystem.read_file', 'filesystem.read_file'],
      );

      expect(result.allowed).toBe(true);
    });

    test('should handle very long permission lists', () => {
      const required = Array.from({ length: 100 }, (_, i) => `perm${i}`);
      const granted = Array.from({ length: 100 }, (_, i) => `perm${i}`);

      const result = checker.check(required, granted);

      expect(result.allowed).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe('Utility methods', () => {
    test('noPermissionsRequired() returns true for empty array', () => {
      expect(checker.noPermissionsRequired([])).toBe(true);
    });

    test('noPermissionsRequired() returns false for non-empty array', () => {
      expect(checker.noPermissionsRequired(['filesystem.read_file'])).toBe(false);
    });

    test('noPermissionsGranted() returns true for empty array', () => {
      expect(checker.noPermissionsGranted([])).toBe(true);
    });

    test('noPermissionsGranted() returns false for non-empty array', () => {
      expect(checker.noPermissionsGranted(['filesystem.read_file'])).toBe(false);
    });

    test('formatPermissionList() formats permissions grouped by server', () => {
      const formatted = checker.formatPermissionList([
        'filesystem.read_file',
        'filesystem.write_file',
        'github.create_issue',
      ]);

      expect(formatted).toContain('filesystem:');
      expect(formatted).toContain('- filesystem.read_file');
      expect(formatted).toContain('- filesystem.write_file');
      expect(formatted).toContain('github:');
      expect(formatted).toContain('- github.create_issue');
    });

    test('formatPermissionList() returns (none) for empty array', () => {
      const formatted = checker.formatPermissionList([]);

      expect(formatted).toBe('(none)');
    });

    test('formatPermissionList() handles malformed permission IDs', () => {
      const formatted = checker.formatPermissionList(['invalid', 'filesystem.read_file']);

      expect(formatted).toContain('other:');
      expect(formatted).toContain('- invalid');
      expect(formatted).toContain('filesystem:');
      expect(formatted).toContain('- filesystem.read_file');
    });
  });

  describe('checkPermissions convenience function', () => {
    test('should work as standalone function', () => {
      const result = checkPermissions(['filesystem.read_file'], ['filesystem.read_file']);

      expect(result.allowed).toBe(true);
    });

    test('should return same result as PermissionChecker.check()', () => {
      const required = ['filesystem.read_file', 'github.create_issue'];
      const granted = ['filesystem.read_file'];

      const result1 = checkPermissions(required, granted);
      const result2 = checker.check(required, granted);

      expect(result1.allowed).toBe(result2.allowed);
      expect(result1.missing).toEqual(result2.missing);
      expect(result1.extra).toEqual(result2.extra);
    });
  });
});
