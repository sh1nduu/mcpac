import { compile } from 'json-schema-to-typescript';
import { getNamingManager, isValidIdentifier } from '../naming/index.js';
import { VERSION } from '../version.js';
import type { ToolDefinition } from './parser.js';
import { loadRuntimeTemplate } from './templates/loadTemplate.macro.ts' with { type: 'macro' };

export interface GeneratedCode {
  imports: string;
  typeDefinitions: string;
  functionCode: string;
}

export class CodeGenerator {
  private naming = getNamingManager();

  /**
   * Generate TypeScript code from tool definition
   */
  async generateToolCode(tool: ToolDefinition): Promise<GeneratedCode> {
    const ctx = this.naming.getToolContext(tool.serverName, tool.toolName);
    const inputTypeName = `${ctx.tool.type}Input`;
    const outputTypeName = `${ctx.tool.type}Output`;
    const functionName = ctx.tool.property;

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
   * IMPORTANT: Uses original MCP names throughout (no conversion)
   * @private
   */
  private generateCreateRuntimeImplementation(allTools: ToolDefinition[]): string {
    const lines: string[] = [];

    lines.push('/**');
    lines.push(' * Create a capability runtime with granted permissions.');
    lines.push(
      ' * Establishes permission boundary and returns runtime object with nested server.tool() access.',
    );
    lines.push(' *');
    lines.push(
      ' * @param permissions - Array of permission IDs in "server.tool" format (original MCP names)',
    );
    lines.push(' * @returns Runtime object with granted permissions');
    lines.push(' */');
    lines.push('export function createRuntime(permissions: string[]): any {');
    lines.push('  // Create method implementations that call MCP tools via IPC');
    lines.push('  // Permission checks are performed by host-side IPCServer');
    lines.push('  const methodImplementations: Record<string, (...args: any[]) => any> = {');

    // Generate method implementations for each tool
    for (let i = 0; i < allTools.length; i++) {
      const tool = allTools[i];
      if (!tool) continue; // Should never happen, but satisfies TypeScript

      const ctx = this.naming.getToolContext(tool.serverName, tool.toolName);

      // CRITICAL: Use original MCP names for permission ID
      // No conversion - preserve exactly as MCP server returns them
      const permissionId = ctx.permission.mcp; // e.g., 'filesystem.read_file' or 'everything.printEnv'
      const comma = i < allTools.length - 1 ? ',' : '';

      // Permission ID and MCP call both use original names
      lines.push(
        `    '${permissionId}': async (input: any) => callMCPTool('${ctx.server.mcp}', '${ctx.tool.mcp}', input)${comma}`,
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
   * Generate TypeScript type definition from JSON Schema
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
      // Fallback: Record<string, unknown>
      return `export interface ${typeName} {\n  [key: string]: unknown;\n}\n`;
    }
  }

  /**
   * Generate function code
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
   * Generate server's index.ts
   * Note: toolNames should be the original MCP tool names
   */
  generateServerIndex(toolFileNames: string[]): string {
    const exports = toolFileNames.map((fileName) => `export * from './${fileName}.js';`).join('\n');

    return `// Auto-generated - do not edit\n\n${exports}\n`;
  }

  /**
   * Generate type definition for a single tool (.d.ts file)
   * Returns only type definitions without implementation code
   */
  async generateToolTypeDefinition(tool: ToolDefinition): Promise<string> {
    const ctx = this.naming.getToolContext(tool.serverName, tool.toolName);
    const inputTypeName = `${ctx.tool.type}Input`;
    const outputTypeName = `${ctx.tool.type}Output`;

    // Generate type definition from inputSchema
    const inputTypeCode = await this.generateInputType(tool.inputSchema, inputTypeName);

    // Output type extends MCPToolResult
    const outputTypeCode = `export interface ${outputTypeName} {
  content: Array<{type: "text", text: string} | {type: "image", data: string, mimeType: string} | {type: "resource", resource: any}>;
  isError: boolean;
}\n`;

    // Method signature type
    const description = tool.description
      ? `/**\n * ${tool.description.split('\n').join('\n * ')}\n */\n`
      : '';
    const methodTypeName = `${ctx.tool.type}Method`;
    const methodTypeCode = `${description}export interface ${methodTypeName} {
  (args: ${inputTypeName}): Promise<${outputTypeName}>;
}\n`;

    return `// Auto-generated - do not edit\n\n${inputTypeCode}\n${outputTypeCode}\n${methodTypeCode}`;
  }

  /**
   * Generate index.d.ts for a server (aggregates all tool types)
   * IMPORTANT: Uses original MCP tool names (may require string literals)
   */
  generateServerIndexTypes(serverName: string, tools: ToolDefinition[]): string {
    const serverNames = this.naming.getServerNames(serverName);

    // Export all types from tool files
    const typeExports = tools
      .map((tool) => {
        const ctx = this.naming.getToolContext(serverName, tool.toolName);
        const inputTypeName = `${ctx.tool.type}Input`;
        const outputTypeName = `${ctx.tool.type}Output`;
        const methodTypeName = `${ctx.tool.type}Method`;
        const fileName = ctx.tool.mcp; // Original MCP tool name
        return `export type { ${inputTypeName}, ${outputTypeName}, ${methodTypeName} } from './${fileName}.d.ts';`;
      })
      .join('\n');

    // Create server interface with original MCP tool names as properties
    const methods = tools
      .map((tool) => {
        const ctx = this.naming.getToolContext(serverName, tool.toolName);
        const originalToolName = ctx.tool.mcp; // Original MCP name
        const methodTypeName = `${ctx.tool.type}Method`;
        const fileName = ctx.tool.mcp; // Use original name for filename

        // Use string literal if not a valid TypeScript identifier
        const propertyKey = isValidIdentifier(originalToolName)
          ? originalToolName
          : `"${originalToolName}"`;

        return `  ${propertyKey}: import('./${fileName}.d.ts').${methodTypeName};`;
      })
      .join('\n');

    const serverInterface = `\nexport interface ${serverNames.type}Server {\n${methods}\n}\n`;

    return `// Auto-generated - do not edit\n\n${typeExports}${serverInterface}`;
  }

  /**
   * Generate global.d.ts with MCPaC ambient namespace
   * This allows users to use MCPaC.McpRequires without explicit imports
   */
  generateGlobalTypes(): string {
    return `// Auto-generated - do not edit
// MCPaC ambient namespace for reduced boilerplate

declare namespace MCPaC {
  /**
   * McpRequires type for capability-based permission declarations.
   * Use this type to declare required permissions in your code without explicit imports.
   *
   * @template T - Array of permission IDs in "server.tool" format
   *
   * @example
   * \`\`\`ts
   * declare const runtime: MCPaC.McpRequires<['filesystem.readFile']>;
   *
   * const content = await runtime.filesystem.readFile({ path: '/data.txt' });
   * \`\`\`
   */
  export type McpRequires<T extends readonly string[]> =
    import('./_types.d.ts').McpRequires<T>;

  /**
   * Union of all permission IDs in "server.tool" format.
   * Examples: 'filesystem.readFile' | 'github.createIssue'
   */
  export type PermissionId = import('./_types.d.ts').PermissionId;
}
`;
  }

  /**
   * Generate type definitions file (_types.d.ts) for capability-based permissions
   * Creates McpServers interface and McpRequires type alias (lightweight version)
   * IMPORTANT: Uses original MCP server names (may require string literals)
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

    // Import server type definitions
    const serverImports = Array.from(serverGroups.keys())
      .map((serverName) => {
        const names = this.naming.getServerNames(serverName);
        return `import type { ${names.type}Server } from './${serverName}/index.d.ts';`;
      })
      .join('\n');

    // Create McpServers interface by referencing imported server types
    // Use original MCP server names (with hyphens if present)
    const serverInterfaces = Array.from(serverGroups.keys())
      .map((serverName) => {
        const names = this.naming.getServerNames(serverName);

        // Use string literal if not a valid TypeScript identifier
        const propertyKey = isValidIdentifier(names.mcp) ? names.mcp : `"${names.mcp}"`;

        return `  ${propertyKey}: ${names.type}Server;`;
      })
      .join('\n');

    const typeDefinitionsCode = `// Auto-generated - do not edit
// Lightweight type definitions for capability-based permission system

import type {
  MethodsFromServers,
  PickNamespacedRuntime,
} from './_mcpac_runtime.js';

// Import server type definitions
${serverImports}

/**
 * MCP Servers interface defining all available servers and their tools.
 * This interface is used to generate flat permission IDs in "server.tool" format.
 */
export interface McpServers {
${serverInterfaces}
}

/**
 * Flat methods map with "server.tool" keys.
 * Generated from McpServers interface.
 */
export type Methods = MethodsFromServers<McpServers>;

/**
 * Union of all permission IDs in "server.tool" format.
 * Examples: 'filesystem.readFile' | 'github.createIssue'
 */
export type PermissionId = keyof Methods & string;

/**
 * McpRequires type for capability-based permission declarations.
 * Prefer using MCPaC.McpRequires from the global namespace to avoid import boilerplate.
 *
 * @template T - Array of permission IDs in "server.tool" format
 *
 * @example
 * \`\`\`ts
 * // Recommended: Use global namespace (no import needed)
 * declare const runtime: MCPaC.McpRequires<['filesystem.readFile']>;
 *
 * // Alternative: Explicit import
 * import type { McpRequires } from './servers/_types.d.ts';
 * declare const runtime: McpRequires<['filesystem.readFile']>;
 * \`\`\`
 */
export type McpRequires<T extends readonly PermissionId[]> =
  PickNamespacedRuntime<T, PermissionId, Methods>;
`;

    return typeDefinitionsCode;
  }
}
