import { output } from '../utils/output.js';
import type { ExecutionResult } from './ipc-executor.js';

export class ResultHandler {
  /**
   * Display execution result
   */
  displayResult(result: ExecutionResult): void {
    // User code output is always shown (never suppressed)
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }

    if (result.stderr) {
      process.stderr.write(result.stderr);
    }

    if (result.error) {
      output.error(`\nExecution error: ${result.error.message}`);
    }

    if (result.exitCode !== 0 && result.exitCode !== null) {
      output.error(`\nProcess exited with code ${result.exitCode}`);
    }
  }

  /**
   * Get exit code (for process exit)
   */
  getExitCode(result: ExecutionResult): number {
    if (result.error) return 1;
    if (result.exitCode === null) return 1;
    return result.exitCode;
  }

  /**
   * Check if successful
   */
  isSuccess(result: ExecutionResult): boolean {
    return result.exitCode === 0 && !result.error;
  }

  /**
   * Format error message
   */
  formatError(result: ExecutionResult): string {
    const parts: string[] = [];

    if (result.error) {
      parts.push(`Error: ${result.error.message}`);
    }

    if (result.exitCode !== 0 && result.exitCode !== null) {
      parts.push(`Exit code: ${result.exitCode}`);
    }

    if (result.stderr) {
      parts.push(`\nStderr:\n${result.stderr}`);
    }

    return parts.join('\n');
  }

  /**
   * Display summary
   */
  displaySummary(result: ExecutionResult): void {
    if (output.isQuiet()) {
      // Quiet mode: only show errors
      if (!this.isSuccess(result)) {
        output.error('\n✗ Execution failed');
        if (result.error || result.stderr) {
          output.error(this.formatError(result));
        }
      }
    } else {
      // Normal/verbose mode: show all summaries
      if (this.isSuccess(result)) {
        output.success('\n✓ Execution completed successfully');
      } else {
        output.error('\n✗ Execution failed');
        if (result.error || result.stderr) {
          output.error(this.formatError(result));
        }
      }
    }
  }
}
