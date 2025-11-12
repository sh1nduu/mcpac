import { unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExecutionContext } from './context.js';

export interface ExecuteOptions {
  context: ExecutionContext;
  dryRun?: boolean;
  timeout?: number; // milliseconds
}

export interface ExecutionResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  error?: Error;
}

export class CodeRunner {
  /**
   * Execute code from file
   */
  async executeFile(filePath: string, options: ExecuteOptions): Promise<ExecutionResult> {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would execute: ${filePath}`);
      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
      };
    }

    return this.runBunScript(filePath, options);
  }

  /**
   * Execute code string (one-liner)
   */
  async executeCode(code: string, options: ExecuteOptions): Promise<ExecutionResult> {
    // Write to temporary file
    const tempFile = join(tmpdir(), `.mcpac-temp-${process.pid}-${Date.now()}.ts`);

    try {
      await writeFile(tempFile, code, 'utf-8');

      if (options.dryRun) {
        console.log(`[DRY RUN] Would execute code:\n${code}`);
        return {
          exitCode: 0,
          stdout: '',
          stderr: '',
        };
      }

      return await this.runBunScript(tempFile, options);
    } finally {
      // Delete temporary file
      try {
        await unlink(tempFile);
      } catch {
        // Ignore deletion failure
      }
    }
  }

  /**
   * Execute Bun script
   */
  private async runBunScript(
    scriptPath: string,
    options: ExecuteOptions,
  ): Promise<ExecutionResult> {
    const proc = Bun.spawn({
      cmd: ['bun', 'run', scriptPath],
      cwd: process.cwd(), // Execute from project root
      env: options.context.env,
      stdout: 'pipe',
      stderr: 'pipe',
      stdin: 'ignore',
    });

    // Set timeout
    let timeoutId: Timer | undefined;
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        proc.kill();
      }, options.timeout);
    }

    try {
      // Collect output and wait for exit
      const [stdout, stderr] = await Promise.all([
        proc.stdout.text(),
        proc.stderr.text(),
        proc.exited,
      ]);

      return {
        exitCode: proc.exitCode ?? 0, // Return 0 if null
        stdout,
        stderr,
      };
    } catch (error) {
      return {
        exitCode: null,
        stdout: '',
        stderr: '',
        error: error as Error,
      };
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  /**
   * Streaming execution (real-time output)
   */
  async executeFileStreaming(filePath: string, options: ExecuteOptions): Promise<number | null> {
    if (options.dryRun) {
      console.log(`[DRY RUN] Would execute: ${filePath}`);
      return 0;
    }

    const proc = Bun.spawn({
      cmd: ['bun', 'run', filePath],
      cwd: process.cwd(), // Execute from project root
      env: options.context.env,
      stdout: 'inherit', // Output directly to parent stdout
      stderr: 'inherit',
      stdin: 'ignore',
    });

    // Set timeout
    let timeoutId: Timer | undefined;
    if (options.timeout) {
      timeoutId = setTimeout(() => {
        proc.kill();
      }, options.timeout);
    }

    try {
      await proc.exited;
      return proc.exitCode;
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
