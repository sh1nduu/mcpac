import { compile } from 'json-schema-to-typescript';
import { VERSION } from '../version.js';
import type { ToolDefinition } from './parser.js';
import { loadRuntimeTemplate } from './templates/loadTemplate.macro.ts' with { type: 'macro' };

export interface GeneratedCode {
  imports: string;
  typeDefinitions: string;
  functionCode: string;
}

export class CodeGenerator {
  /**
   * Generate TypeScript code from tool definition
   */
  async generateToolCode(tool: ToolDefinition): Promise<GeneratedCode> {
    const inputTypeName = this.toTypeName(tool.toolName, 'Input');
    const outputTypeName = this.toTypeName(tool.toolName, 'Output');
    const functionName = this.toCamelCase(tool.toolName);

    // Generate type definition from inputSchema
    const inputTypeCode = await this.generateInputType(tool.inputSchema, inputTypeName);

    // Output type extends MCPToolResult
    const outputTypeCode = `export interface ${outputTypeName} extends MCPToolResult {}\n`;

    // Generate function code
    const functionCode = this.generateFunction(
      functionName,
      tool.serverName,
      tool.toolName,
      inputTypeName,
      outputTypeName,
      tool.description,
    );

    return {
      imports: `import { callMCPTool, type MCPToolResult } from '../_mcpac_runtime.js';`,
      typeDefinitions: `${inputTypeCode}\n${outputTypeCode}`,
      functionCode,
    };
  }

  /**
   * Generate runtime shim code
   * Placed as servers/_mcpac_runtime.ts
   * @param allTools - All tool definitions for generating createRuntime implementation
   */
  generateRuntimeShim(allTools: ToolDefinition[]): string {
    // Load template at bundle-time using Bun macro
    // The template content is inlined directly into the bundle (like Rust's include_str!)
    // This allows the single executable to work without filesystem access
    const templateContent = loadRuntimeTemplate();

    // Replace version placeholders in the template
    let runtimeCode = templateContent
      .replace(/version: '0\.2\.0'/g, `version: '${VERSION}'`)
      .replace(/\/\/ Version: x\.x\.x/g, `// Version: ${VERSION}`);

    // Generate createRuntime implementation
    const createRuntimeImpl = this.generateCreateRuntimeImplementation(allTools);

    // Replace the placeholder createRuntime function
    const placeholderStart = runtimeCode.indexOf('export function createRuntime(');
    const placeholderEnd = runtimeCode.indexOf('}', placeholderStart) + 1;

    if (placeholderStart !== -1 && placeholderEnd > placeholderStart) {
      runtimeCode =
        runtimeCode.substring(0, placeholderStart) +
        createRuntimeImpl +
        runtimeCode.substring(placeholderEnd);
    }

    return runtimeCode;
  }

  /**
   * Generate createRuntime implementation based on available tools
   * @private
   */
  private generateCreateRuntimeImplementation(allTools: ToolDefinition[]): string {
    // Group tools by server and collect all permission IDs
    const permissionIds: string[] = [];
    for (const tool of allTools) {
      permissionIds.push(`${tool.serverName}.${this.toCamelCase(tool.toolName)}`);
    }

    const lines: string[] = [];

    lines.push('/**');
    lines.push(' * Create a capability runtime with granted permissions.');
    lines.push(
      ' * Establishes permission boundary and returns runtime object with nested server.tool() access.',
    );
    lines.push(' *');
    lines.push(' * @param permissions - Array of permission IDs in "server.tool" format');
    lines.push(' * @returns Runtime object with granted permissions');
    lines.push(' */');
    lines.push('export function createRuntime(permissions: string[]): any {');
    lines.push('  // Helper function to convert camelCase permission IDs to snake_case tool names');
    lines.push('  // e.g., "filesystem.readFile" -> "filesystem.read_file"');
    lines.push('  function permissionToToolFormat(perm: string): string {');
    lines.push('    const [server, ...toolParts] = perm.split(".");');
    lines.push('    if (toolParts.length === 0) return perm;');
    lines.push('');
    lines.push('    const camelTool = toolParts.join(".");');
    lines.push('    const snakeTool = camelTool.replace(/([A-Z])/g, "_$1").toLowerCase();');
    lines.push('    return `$' + '{server}.$' + '{snakeTool}`;');
    lines.push('  }');
    lines.push('');
    lines.push('  // Convert camelCase permissions to snake_case for IPC server compatibility');
    lines.push('  const snakeCasePermissions = permissions.map(permissionToToolFormat);');
    lines.push('');
    lines.push('  // Set permission context for IPC requests (in snake_case format)');
    lines.push('  setPermissionContext(snakeCasePermissions);');
    lines.push('');
    lines.push('  // Create method implementations that call MCP tools via IPC');
    lines.push('  const methodImplementations: Record<string, (...args: any[]) => any> = {');

    // Generate method implementations for each tool
    for (let i = 0; i < allTools.length; i++) {
      const tool = allTools[i];
      if (!tool) continue; // Should never happen, but satisfies TypeScript

      const functionName = this.toCamelCase(tool.toolName);
      const permissionId = `${tool.serverName}.${functionName}`;
      const comma = i < allTools.length - 1 ? ',' : '';

      lines.push(
        `    '${permissionId}': async (input: any) => callMCPTool('${tool.serverName}', '${tool.toolName}', input)${comma}`,
      );
    }

    lines.push('  };');
    lines.push('');
    lines.push('  // Create authority and grant permissions');
    lines.push(
      '  const authority = new NamespacedRuntimeAuthority<string, Record<string, (...args: any[]) => any>>(methodImplementations);',
    );
    lines.push('  return authority.grant(...permissions as any);');
    lines.push('}');

    return lines.join('\n');
  }

  /**
   * JSON SchemaからTypeScript型定義を生成
   */
  private async generateInputType(schema: unknown, typeName: string): Promise<string> {
    try {
      const typeCode = await compile(schema as any, typeName, {
        bannerComment: '',
        style: {
          semi: true,
          singleQuote: true,
          tabWidth: 2,
        },
        unknownAny: false,
        format: true,
      });

      return typeCode;
    } catch (_error) {
      console.warn(`Warning: Failed to generate type for ${typeName}, using fallback`);
      // フォールバック: Record<string, unknown>
      return `export interface ${typeName} {\n  [key: string]: unknown;\n}\n`;
    }
  }

  /**
   * 関数コードを生成
   */
  private generateFunction(
    functionName: string,
    serverName: string,
    toolName: string,
    inputType: string,
    outputType: string,
    description?: string,
  ): string {
    const jsDoc = description ? `/**\n * ${description.split('\n').join('\n * ')}\n */\n` : '';

    return `${jsDoc}export async function ${functionName}(
  input: ${inputType}
): Promise<${outputType}> {
  return callMCPTool<${outputType}>('${serverName}', '${toolName}', input);
}
`;
  }

  /**
   * ツール名からPascalCase型名を生成
   * 例: read_file → ReadFileInput
   */
  private toTypeName(toolName: string, suffix: string): string {
    const pascal = toolName
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
    return pascal + suffix;
  }

  /**
   * ツール名からcamelCase関数名を生成
   * 例: read_file → readFile
   */
  toCamelCase(toolName: string): string {
    const parts = toolName.split('_');
    return (
      parts[0] +
      parts
        .slice(1)
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join('')
    );
  }

  /**
   * サーバーのindex.tsを生成
   */
  generateServerIndex(toolNames: string[]): string {
    const exports = toolNames.map((name) => `export * from './${name}.js';`).join('\n');

    return `// Auto-generated - do not edit\n\n${exports}\n`;
  }

  /**
   * ルートindex.tsを生成
   */
  generateRootIndex(serverNames: string[]): string {
    const imports = serverNames
      .map((name) => {
        const camelName = this.toCamelCase(name.replace(/-/g, '_'));
        return `import * as ${camelName} from './${name}/index.js';`;
      })
      .join('\n');

    const exports = serverNames.map((name) => this.toCamelCase(name.replace(/-/g, '_'))).join(', ');

    return `// Auto-generated - do not edit\n\n${imports}\n\nexport { ${exports} };\n`;
  }

  /**
   * Generate type definitions file (_types.ts) for capability-based permissions
   * Creates McpServers interface and McpRequires type alias
   */
  generateTypeDefinitions(allTools: ToolDefinition[]): string {
    // Group tools by server
    const serverGroups = new Map<string, ToolDefinition[]>();
    for (const tool of allTools) {
      if (!serverGroups.has(tool.serverName)) {
        serverGroups.set(tool.serverName, []);
      }
      const tools = serverGroups.get(tool.serverName);
      if (tools) {
        tools.push(tool);
      }
    }

    // Generate McpServers interface
    const serverInterfaces: string[] = [];
    for (const [serverName, tools] of serverGroups.entries()) {
      const methods = tools
        .map((tool) => {
          const inputTypeName = this.toTypeName(tool.toolName, 'Input');
          const outputTypeName = this.toTypeName(tool.toolName, 'Output');
          const functionName = this.toCamelCase(tool.toolName);
          const description = tool.description ? `\n    /** ${tool.description} */` : '';
          return `${description}\n    ${functionName}(args: ${inputTypeName}): Promise<${outputTypeName}>;`;
        })
        .join('\n');

      const camelServerName = this.toCamelCase(serverName.replace(/-/g, '_'));
      serverInterfaces.push(`  ${camelServerName}: {${methods}\n  };`);
    }

    const typeDefinitionsCode = `// Auto-generated - do not edit
// This file contains type definitions for capability-based permission system

import type {
  MethodsFromServers,
  PickNamespacedRuntime,
} from './_mcpac_runtime.js';
import type { MCPToolResult } from './_mcpac_runtime.js';

// Import all type definitions
${Array.from(serverGroups.keys())
  .map((serverName) => {
    const camelName = this.toCamelCase(serverName.replace(/-/g, '_'));
    return `import type * as ${camelName}Types from './${serverName}/index.js';`;
  })
  .join('\n')}

// Define input/output types for each server
${Array.from(serverGroups.entries())
  .map(([serverName, tools]) => {
    const camelName = this.toCamelCase(serverName.replace(/-/g, '_'));
    return tools
      .map((tool) => {
        const inputTypeName = this.toTypeName(tool.toolName, 'Input');
        const outputTypeName = this.toTypeName(tool.toolName, 'Output');
        return `type ${camelName}_${inputTypeName} = ${camelName}Types.${inputTypeName};\ntype ${camelName}_${outputTypeName} = ${camelName}Types.${outputTypeName};`;
      })
      .join('\n');
  })
  .join('\n\n')}

/**
 * MCP Servers interface defining all available servers and their tools.
 * This interface is used to generate flat permission IDs in "server.tool" format.
 */
export interface McpServers {
${serverInterfaces.join('\n')}
}

/**
 * Flat methods map with "server.tool" keys.
 * Generated from McpServers interface.
 */
export type Methods = MethodsFromServers<McpServers>;

/**
 * Union of all permission IDs in "server.tool" format.
 * Examples: 'filesystem.read_file' | 'github.create_issue'
 */
export type PermissionId = keyof Methods & string;

/**
 * McpRequires type for capability-based permission declarations.
 * Use this type to declare required permissions in your code.
 *
 * @template T - Array of permission IDs in "server.tool" format
 *
 * @example
 * \`\`\`ts
 * import type { McpRequires } from './servers/_types';
 *
 * async function processFiles(rt: McpRequires<['filesystem.read_file', 'filesystem.write_file']>) {
 *   const content = await rt.filesystem.read_file({ path: '/data.txt' });
 *   await rt.filesystem.write_file({ path: '/output.txt', content: content.content[0].text });
 * }
 * \`\`\`
 */
export type McpRequires<T extends readonly PermissionId[]> =
  PickNamespacedRuntime<T, PermissionId, Methods>;
`;

    return typeDefinitionsCode;
  }
}
