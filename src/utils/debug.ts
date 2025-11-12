/**
 * Debug utility for MCPaC
 * Controlled by MCPC_DEBUG environment variable:
 * - 0 or undefined: No debug output (default)
 * - 1: Basic debug information
 * - 2: Detailed debug information including JSON-RPC messages
 */

const DEBUG_LEVEL = parseInt(process.env.MCPC_DEBUG || '0', 10);

export function isDebugEnabled(): boolean {
  return DEBUG_LEVEL > 0;
}

export function isVerboseDebugEnabled(): boolean {
  return DEBUG_LEVEL >= 2;
}

export function debugLog(message: string, ...args: unknown[]): void {
  if (DEBUG_LEVEL > 0) {
    console.error(`[MCPC] ${message}`, ...args);
  }
}

export function debugVerbose(message: string, ...args: unknown[]): void {
  if (DEBUG_LEVEL >= 2) {
    console.error(`[MCPC:VERBOSE] ${message}`, ...args);
  }
}

export function debugError(message: string, error: unknown): void {
  if (DEBUG_LEVEL > 0) {
    console.error(`[MCPC:ERROR] ${message}`);
    if (error instanceof Error) {
      console.error(`  Message: ${error.message}`);
      if (DEBUG_LEVEL >= 2 && error.stack) {
        console.error(`  Stack: ${error.stack}`);
      }
    } else {
      console.error(`  Error: ${String(error)}`);
    }
  }
}

/**
 * Sanitize environment variables for safe logging
 * Returns only the keys, not the values (to avoid leaking secrets)
 */
export function sanitizeEnvKeys(env?: Record<string, string>): string[] {
  if (!env) return [];
  return Object.keys(env);
}

/**
 * Format object for debug output
 */
export function debugFormat(obj: unknown): string {
  try {
    return JSON.stringify(obj, null, 2);
  } catch {
    return String(obj);
  }
}
