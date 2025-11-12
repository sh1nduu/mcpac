import { resolve } from 'node:path';
import ts from 'typescript';
import type { ExecutionContext } from './context.js';

export interface TypeCheckError {
  file: string;
  line: number;
  column: number;
  message: string;
  code: number;
}

export interface TypeCheckResult {
  hasErrors: boolean;
  errors: TypeCheckError[];
}

export class TypeChecker {
  /**
   * Type check a file
   */
  async checkFile(filePath: string, context: ExecutionContext): Promise<TypeCheckResult> {
    return this.checkFileImpl(filePath, context);
  }

  /**
   * Type check code string
   */
  async checkCode(
    code: string,
    context: ExecutionContext,
    _fileName = 'user-code.ts',
  ): Promise<TypeCheckResult> {
    // Write code to temporary file in current working directory for type checking
    // This allows relative imports like './servers' to resolve correctly
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const { join } = await import('node:path');

    const tempFile = join(process.cwd(), `.mcpac-typecheck-${Date.now()}.ts`);
    writeFileSync(tempFile, code);

    try {
      const result = await this.checkFile(tempFile, context);
      return result;
    } finally {
      try {
        unlinkSync(tempFile);
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  /**
   * Type check file (implementation)
   */
  private async checkFileImpl(
    filePath: string,
    context: ExecutionContext,
  ): Promise<TypeCheckResult> {
    const serversPath = resolve(context.serversDir);

    // TypeScript compiler options
    // Note: We use process.cwd() as baseUrl and absolute paths in `paths`
    // This allows './servers' imports to resolve correctly
    const compilerOptions: ts.CompilerOptions = {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      // Include ES2022 for Map, Promise, etc. and DOM for console, setTimeout, etc.
      // DOM provides global objects that are available in Bun/Node.js runtimes
      lib: ['lib.es2022.full.d.ts', 'lib.dom.d.ts'],
      // Don't load @types/* packages from user's node_modules
      // This ensures consistent behavior regardless of user's workspace setup
      types: [],
      // Relaxed type checking for user code
      strict: true,
      noImplicitAny: false,
      strictNullChecks: false,
      skipLibCheck: true,
      skipDefaultLibCheck: true,
      noEmit: true,
      allowImportingTsExtensions: true,
      resolveJsonModule: true,
      esModuleInterop: true,
      paths: {
        './servers/*': [`${serversPath}/*`],
        './servers/index.js': [`${serversPath}/index.ts`],
        './servers': [`${serversPath}/index.ts`],
      },
      baseUrl: process.cwd(),
    };

    // Create program with custom compiler host that provides built-in lib files
    const host = ts.createCompilerHost(compilerOptions);

    // Override getSourceFile to provide lib files from TypeScript's built-in libs
    const originalGetSourceFile = host.getSourceFile.bind(host);
    host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
      // For lib files, use TypeScript's built-in lib files
      if (fileName.includes('node_modules/@types/')) {
        // Don't load external @types packages
        return undefined;
      }
      return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
    };

    const program = ts.createProgram([resolve(filePath)], compilerOptions, host);

    // Get diagnostics
    const diagnostics = ts.getPreEmitDiagnostics(program);

    // Filter out diagnostics from node_modules, library files, and generated server files
    const userCodePath = resolve(filePath);
    const relevantDiagnostics = diagnostics.filter((diagnostic) => {
      if (!diagnostic.file) return false;
      const diagPath = diagnostic.file.fileName;
      const normalizedPath = resolve(diagPath);

      // Only include errors from user code
      return normalizedPath === userCodePath;
    });

    // Format errors
    const errors: TypeCheckError[] = relevantDiagnostics.map((diagnostic) => {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
      let line = 0;
      let column = 0;
      let file = filePath;

      if (diagnostic.file && diagnostic.start !== undefined) {
        const { line: l, character: c } = diagnostic.file.getLineAndCharacterOfPosition(
          diagnostic.start,
        );
        line = l + 1; // 1-based
        column = c + 1; // 1-based
        file = diagnostic.file.fileName;
      }

      return {
        file,
        line,
        column,
        message,
        code: diagnostic.code,
      };
    });

    return {
      hasErrors: errors.length > 0,
      errors,
    };
  }

  /**
   * Format error messages
   */
  formatErrors(errors: TypeCheckError[]): string {
    return errors
      .map((error) => {
        const location =
          error.line > 0 ? `${error.file}:${error.line}:${error.column}` : error.file;
        return `  ${location} - error TS${error.code}: ${error.message}`;
      })
      .join('\n');
  }
}
