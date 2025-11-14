import { compile } from 'json-schema-to-typescript';
import { VERSION } from '../version.js';
import type { ToolDefinition } from './parser.js';
import { RUNTIME_TEMPLATE } from './runtime-template.js';

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
   */
  generateRuntimeShim(): string {
    // Replace version placeholders in the template
    return RUNTIME_TEMPLATE.replace(/version: '0\.2\.0'/g, `version: '${VERSION}'`).replace(
      /\/\/ Version: x\.x\.x/g,
      `// Version: ${VERSION}`,
    );
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
