/**
 * Output manager for controlling console output verbosity
 *
 * Supports three levels:
 * - quiet: Only errors and user output
 * - normal: Errors, warnings, info, and user output (default)
 * - verbose: All output including debug messages and MCP server logs
 */

export type OutputLevel = 'quiet' | 'normal' | 'verbose';

class OutputManager {
  private static instance: OutputManager | null = null;
  private level: OutputLevel = 'normal';

  private constructor() {
    // Check environment variables
    if (process.env.MCPC_QUIET === '1') {
      this.level = 'quiet';
    } else if (process.env.MCPC_VERBOSE === '1') {
      this.level = 'verbose';
    }
  }

  static getInstance(): OutputManager {
    if (!OutputManager.instance) {
      OutputManager.instance = new OutputManager();
    }
    return OutputManager.instance;
  }

  /**
   * Set output level (CLI flags override environment variables)
   */
  setLevel(level: OutputLevel): void {
    this.level = level;
  }

  /**
   * Get current output level
   */
  getLevel(): OutputLevel {
    return this.level;
  }

  /**
   * Check if in quiet mode
   */
  isQuiet(): boolean {
    return this.level === 'quiet';
  }

  /**
   * Check if in verbose mode
   */
  isVerbose(): boolean {
    return this.level === 'verbose';
  }

  /**
   * Info message - shown in normal and verbose modes
   */
  info(message: string): void {
    if (this.level !== 'quiet') {
      console.log(message);
    }
  }

  /**
   * Success message - shown in normal and verbose modes
   */
  success(message: string): void {
    if (this.level !== 'quiet') {
      console.log(message);
    }
  }

  /**
   * Warning message - always shown
   */
  warn(message: string): void {
    console.warn(message);
  }

  /**
   * Error message - always shown
   */
  error(message: string): void {
    console.error(message);
  }

  /**
   * Verbose/debug message - only shown in verbose mode
   */
  verbose(message: string): void {
    if (this.level === 'verbose') {
      console.log(message);
    }
  }

  /**
   * Debug message - only shown in verbose mode
   */
  debug(message: string): void {
    if (this.level === 'verbose') {
      console.error(`[DEBUG] ${message}`);
    }
  }
}

// Export singleton instance
export const output = OutputManager.getInstance();
