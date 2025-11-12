import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { GeneratedCode } from './codegen.js';

export interface GenerateOptions {
  outputDir?: string; // Default: ./servers
  force?: boolean; // Overwrite existing files
}

// Re-export for convenience
export type { GeneratedCode };

export class FilesystemManager {
  private outputDir: string;
  private force: boolean;
  private preparedDirs: Set<string> = new Set();
  private runtimeGenerated: boolean = false;

  constructor(options: GenerateOptions = {}) {
    this.outputDir = options.outputDir ?? './servers';
    this.force = options.force ?? false;
  }

  /**
   * Prepare server directory
   */
  async prepareServerDirectory(serverName: string): Promise<string> {
    const serverDir = join(this.outputDir, serverName);

    // Skip if already prepared
    if (this.preparedDirs.has(serverName)) {
      return serverDir;
    }

    if (existsSync(serverDir) && this.force) {
      // Force overwrite: delete existing directory
      await rm(serverDir, { recursive: true, force: true });
    }

    if (!existsSync(serverDir)) {
      await mkdir(serverDir, { recursive: true });
    }

    this.preparedDirs.add(serverName);
    return serverDir;
  }

  /**
   * Generate runtime shim
   * Placed as servers/_mcpc_runtime.ts
   */
  async ensureRuntimeShim(): Promise<void> {
    if (this.runtimeGenerated) return;

    const { CodeGenerator } = await import('./codegen.js');
    const codegen = new CodeGenerator();
    const runtimePath = join(this.outputDir, '_mcpc_runtime.ts');

    await writeFile(runtimePath, codegen.generateRuntimeShim(), 'utf-8');
    this.runtimeGenerated = true;
  }

  /**
   * Write tool file
   */
  async writeToolFile(serverName: string, toolName: string, code: GeneratedCode): Promise<void> {
    // Ensure runtime shim
    await this.ensureRuntimeShim();

    const serverDir = await this.prepareServerDirectory(serverName);
    const filePath = join(serverDir, `${toolName}.ts`);

    const fullCode = [
      '// Auto-generated - do not edit\n',
      code.imports,
      '\n',
      code.typeDefinitions,
      '\n',
      code.functionCode,
    ].join('\n');

    await writeFile(filePath, fullCode, 'utf-8');
  }

  /**
   * Write server index.ts
   */
  async writeServerIndex(serverName: string, indexCode: string): Promise<void> {
    const serverDir = join(this.outputDir, serverName);
    const filePath = join(serverDir, 'index.ts');
    await writeFile(filePath, indexCode, 'utf-8');
  }

  /**
   * Write root index.ts
   */
  async writeRootIndex(indexCode: string): Promise<void> {
    const filePath = join(this.outputDir, 'index.ts');
    await writeFile(filePath, indexCode, 'utf-8');
  }

  /**
   * Clean entire output directory
   */
  async clean(): Promise<void> {
    if (existsSync(this.outputDir)) {
      await rm(this.outputDir, { recursive: true, force: true });
    }
    await mkdir(this.outputDir, { recursive: true });
  }

  /**
   * Ensure output directory exists
   */
  async ensureOutputDir(): Promise<void> {
    if (!existsSync(this.outputDir)) {
      await mkdir(this.outputDir, { recursive: true });
    }
  }
}
