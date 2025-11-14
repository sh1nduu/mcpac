/**
 * MCPaC Permission Checker
 *
 * Compares required permissions (extracted from user code) with granted permissions
 * (provided by user via CLI or config). Determines if execution should be allowed.
 */

/**
 * Result of comparing required vs granted permissions
 */
export interface PermissionCheckResult {
  /**
   * Whether execution should be allowed
   * True if all required permissions are granted
   */
  allowed: boolean;

  /**
   * Permissions that are required but not granted
   * Execution is blocked if this array is not empty
   */
  missing: string[];

  /**
   * Permissions that are granted but not required
   * This is allowed (over-provisioning) but may indicate unnecessary grants
   */
  extra: string[];

  /**
   * Human-readable summary message
   */
  summary: string;

  /**
   * Detailed message for display (formatted with colors/symbols)
   */
  detailedMessage: string;
}

/**
 * PermissionChecker compares required and granted permissions.
 * Provides clear feedback about permission mismatches.
 *
 * @example
 * ```ts
 * const checker = new PermissionChecker();
 * const result = checker.check(
 *   ['filesystem.read_file', 'filesystem.write_file'],
 *   ['filesystem.read_file']
 * );
 *
 * if (!result.allowed) {
 *   console.error(result.detailedMessage);
 *   process.exit(1);
 * }
 * ```
 */
export class PermissionChecker {
  /**
   * Check if granted permissions satisfy required permissions
   *
   * @param required - Array of permission IDs required by user code
   * @param granted - Array of permission IDs granted by user
   * @returns Check result with allowed status and detailed information
   */
  check(required: string[], granted: string[]): PermissionCheckResult {
    // Find missing and extra permissions
    const missingPerms = required.filter((p) => !granted.includes(p));
    const extraPerms = granted.filter((p) => !required.includes(p));

    const allowed = missingPerms.length === 0;

    return {
      allowed,
      missing: missingPerms,
      extra: extraPerms,
      summary: this.formatSummary(required, granted, missingPerms, extraPerms),
      detailedMessage: this.formatDetailedMessage(required, granted, missingPerms, extraPerms),
    };
  }

  /**
   * Format a short summary message
   * @private
   */
  private formatSummary(
    required: string[],
    _granted: string[],
    missing: string[],
    extra: string[],
  ): string {
    if (missing.length === 0) {
      if (extra.length === 0) {
        return `✓ All ${required.length} required permissions granted`;
      }
      return `✓ All ${required.length} required permissions granted (${extra.length} extra)`;
    }

    return `✗ Missing ${missing.length} required permission${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`;
  }

  /**
   * Format a detailed message for display
   * @private
   */
  private formatDetailedMessage(
    required: string[],
    granted: string[],
    missing: string[],
    extra: string[],
  ): string {
    const lines: string[] = [];

    lines.push('Permission Check:');
    lines.push('');

    // Required permissions
    lines.push(`Required permissions (${required.length}):`);
    if (required.length === 0) {
      lines.push('  (none)');
    } else {
      for (const perm of required) {
        const status = granted.includes(perm) ? '✓' : '✗';
        lines.push(`  ${status} ${perm}`);
      }
    }

    lines.push('');

    // Granted permissions
    lines.push(`Granted permissions (${granted.length}):`);
    if (granted.length === 0) {
      lines.push('  (none)');
    } else {
      for (const perm of granted) {
        const status = required.includes(perm) ? '✓' : '⚠';
        const suffix = required.includes(perm) ? '' : ' (not required)';
        lines.push(`  ${status} ${perm}${suffix}`);
      }
    }

    lines.push('');

    // Summary
    if (missing.length === 0) {
      lines.push('✓ Permission check passed');
      if (extra.length > 0) {
        lines.push(
          `  Note: ${extra.length} extra permission${extra.length > 1 ? 's' : ''} granted (not required)`,
        );
      }
    } else {
      lines.push('✗ Permission check failed');
      lines.push(`  Missing: ${missing.join(', ')}`);
      lines.push('');
      lines.push('To fix this, add the missing permissions with --grant:');
      lines.push(`  --grant ${[...granted, ...missing].join(',')}`);
    }

    return lines.join('\n');
  }

  /**
   * Check if no permissions are required
   * Useful for early exit optimization
   *
   * @param required - Array of required permissions
   * @returns True if no permissions are required
   */
  noPermissionsRequired(required: string[]): boolean {
    return required.length === 0;
  }

  /**
   * Check if no permissions are granted
   * Useful for detecting missing --grant flag
   *
   * @param granted - Array of granted permissions
   * @returns True if no permissions are granted
   */
  noPermissionsGranted(granted: string[]): boolean {
    return granted.length === 0;
  }

  /**
   * Format a list of permissions for display
   * Groups by server for better readability
   *
   * @param permissions - Array of permission IDs
   * @returns Formatted string
   */
  formatPermissionList(permissions: string[]): string {
    if (permissions.length === 0) {
      return '(none)';
    }

    // Group by server
    const byServer = new Map<string, string[]>();
    for (const perm of permissions) {
      const dotIndex = perm.indexOf('.');
      if (dotIndex === -1) {
        // Invalid format, add to 'other'
        if (!byServer.has('other')) {
          byServer.set('other', []);
        }
        byServer.get('other')!.push(perm);
      } else {
        const server = perm.slice(0, dotIndex);
        if (!byServer.has(server)) {
          byServer.set(server, []);
        }
        byServer.get(server)!.push(perm);
      }
    }

    const lines: string[] = [];
    for (const [server, perms] of byServer.entries()) {
      lines.push(`  ${server}:`);
      for (const perm of perms) {
        lines.push(`    - ${perm}`);
      }
    }

    return lines.join('\n');
  }
}

/**
 * Convenience function to check permissions
 * Creates a one-time PermissionChecker instance
 *
 * @param required - Required permissions
 * @param granted - Granted permissions
 * @returns Check result
 *
 * @example
 * ```ts
 * const result = checkPermissions(
 *   ['filesystem.read_file'],
 *   ['filesystem.read_file', 'filesystem.write_file']
 * );
 * console.log(result.summary);
 * ```
 */
export function checkPermissions(required: string[], granted: string[]): PermissionCheckResult {
  const checker = new PermissionChecker();
  return checker.check(required, granted);
}
