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
   * Generate runtime shim (legacy method for backwards compatibility)
   * Placed as servers/_mcpac_runtime.ts
   * @deprecated Use writeRuntimeShim with allTools instead
   */
  async ensureRuntimeShim(): Promise<void> {
    if (this.runtimeGenerated) return;

    const { CodeGenerator } = await import('./codegen.js');
    const codegen = new CodeGenerator();
    const runtimePath = join(this.outputDir, '_mcpac_runtime.ts');

    const runtimeCode = codegen.generateRuntimeShim([]);
    await writeFile(runtimePath, runtimeCode, 'utf-8');
    this.runtimeGenerated = true;
  }

  /**
   * Write runtime shim with tool definitions for createRuntime implementation
   * Placed as servers/_mcpac_runtime.ts
   * @param allTools - All tool definitions for generating createRuntime
   */
  async writeRuntimeShim(allTools: import('./parser.js').ToolDefinition[]): Promise<void> {
    const { CodeGenerator } = await import('./codegen.js');
    const codegen = new CodeGenerator();
    const runtimePath = join(this.outputDir, '_mcpac_runtime.ts');

    const runtimeCode = codegen.generateRuntimeShim(allTools);
    await writeFile(runtimePath, runtimeCode, 'utf-8');
    this.runtimeGenerated = true;
  }

  /**
   * Write tool type definition file (.d.ts)
   */
  async writeToolTypeDefinition(
    serverName: string,
    toolName: string,
    typeCode: string,
  ): Promise<void> {
    const serverDir = await this.prepareServerDirectory(serverName);
    const camelToolName = toolName.includes('_')
      ? toolName
          .split('_')
          .map((p, i) => (i === 0 ? p : p.charAt(0).toUpperCase() + p.slice(1)))
          .join('')
      : toolName;
    const filePath = join(serverDir, `${camelToolName}.d.ts`);
    await writeFile(filePath, typeCode, 'utf-8');
  }

  /**
   * Write server index.d.ts (type aggregation)
   */
  async writeServerIndexTypes(serverName: string, typeCode: string): Promise<void> {
    const serverDir = join(this.outputDir, serverName);
    const filePath = join(serverDir, 'index.d.ts');
    await writeFile(filePath, typeCode, 'utf-8');
  }

  /**
   * Write global.d.ts (MCPaC ambient namespace)
   */
  async writeGlobalTypes(typeCode: string): Promise<void> {
    const filePath = join(this.outputDir, 'global.d.ts');
    await writeFile(filePath, typeCode, 'utf-8');
  }

  /**
   * Write tool file (DEPRECATED - use writeToolTypeDefinition instead)
   * @deprecated
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
   * Write type definitions file (_types.d.ts)
   */
  async writeTypeDefinitions(typeDefinitionsCode: string): Promise<void> {
    const filePath = join(this.outputDir, '_types.d.ts');
    await writeFile(filePath, typeDefinitionsCode, 'utf-8');
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
