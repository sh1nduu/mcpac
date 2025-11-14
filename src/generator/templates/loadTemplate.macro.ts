/**
 * Bun macro to load template file at bundle-time
 * Similar to Rust's include_str!() macro
 *
 * This function is executed at bundle-time by Bun's transpiler,
 * and the returned string is directly inlined into the bundle.
 * The source code of this function will not appear in the final bundle.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function loadRuntimeTemplate(): string {
  // At macro execution time, we have access to the normal filesystem
  // (not Bun's virtual filesystem used in single executable)

  // Get current file's directory
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  const templatePath = join(__dirname, 'runtime-base.template.ts');

  return readFileSync(templatePath, 'utf-8');
}
