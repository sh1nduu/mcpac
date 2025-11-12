/**
 * Argument parser for tools call command
 * Supports multiple input methods: named flags, JSON string, and stdin
 */

export interface ParsedArguments {
  args: Record<string, unknown>;
  source: 'flags' | 'json' | 'stdin';
}

export interface ParserOptions {
  jsonString?: string;
  useStdin?: boolean;
  commanderOpts: Record<string, unknown>;
  commanderArgs?: string[];
  inputSchema?: unknown;
}

/**
 * Parse arguments from various sources with type conversion
 */
export async function parseArguments(options: ParserOptions): Promise<ParsedArguments> {
  // Priority 1: stdin
  if (options.useStdin) {
    const stdinContent = await readStdin();
    try {
      const args = JSON.parse(stdinContent);
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        throw new Error('stdin must contain a JSON object');
      }
      return { args, source: 'stdin' };
    } catch (error) {
      throw new Error(
        `Failed to parse JSON from stdin: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Priority 2: JSON string
  if (options.jsonString) {
    try {
      const args = JSON.parse(options.jsonString);
      if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        throw new Error('--json must contain a JSON object');
      }
      return { args, source: 'json' };
    } catch (error) {
      throw new Error(
        `Failed to parse --json argument: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Priority 3: Named flags (convert with type inference)
  // Merge opts and args - args contains unknown options like ['--path', 'value']
  const mergedOpts = {
    ...options.commanderOpts,
    ...parseArgsArray(options.commanderArgs || []),
  };
  const args = convertNamedFlags(mergedOpts, options.inputSchema as JSONSchema | undefined);
  return { args, source: 'flags' };
}

/**
 * Read all content from stdin
 */
async function readStdin(): Promise<string> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);
  return buffer.toString('utf-8');
}

/**
 * Parse Commander.js args array into key-value pairs
 * Handles: ['--path', 'value', '--flag', '--key=value']
 * Returns: { path: 'value', flag: true, key: 'value' }
 */
function parseArgsArray(args: string[]): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    // Skip undefined or non-flag arguments
    if (!arg || (!arg.startsWith('--') && !arg.startsWith('-'))) {
      continue;
    }

    // Remove leading dashes
    const cleanArg = arg.replace(/^-+/, '');

    // Handle --key=value format
    if (cleanArg.includes('=')) {
      const [key, ...valueParts] = cleanArg.split('=');
      if (key) {
        result[key] = valueParts.join('='); // Handle values with '=' in them
      }
      continue;
    }

    // Check if next argument is the value (not another flag)
    const nextArg = args[i + 1];
    if (nextArg && !nextArg.startsWith('--') && !nextArg.startsWith('-')) {
      result[cleanArg] = nextArg;
      i++; // Skip next argument since we consumed it
    } else {
      // Boolean flag without value
      result[cleanArg] = true;
    }
  }

  return result;
}

/**
 * Convert named flags to typed object using JSON Schema hints
 */
function convertNamedFlags(
  opts: Record<string, unknown>,
  schema?: JSONSchema,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  // Filter out known command options
  const knownOptions = new Set([
    'json',
    'stdin',
    'server',
    'validate',
    'outputFormat',
    'quiet',
    'verbose',
  ]);

  const properties = schema?.properties as Record<string, JSONSchemaProperty> | undefined;

  for (const [key, value] of Object.entries(opts)) {
    if (knownOptions.has(key)) {
      continue;
    }

    // Get type information from schema if available
    const propSchema = properties?.[key];
    const type = propSchema?.type;

    result[key] = convertValue(value, type);
  }

  return result;
}

/**
 * Convert value based on JSON Schema type
 */
function convertValue(value: unknown, type?: string | string[]): unknown {
  if (value === undefined || value === null) {
    return value;
  }

  // Handle array type
  if (Array.isArray(value)) {
    // If type is array, convert each element
    if (type === 'array' || (Array.isArray(type) && type.includes('array'))) {
      return value;
    }
    // Otherwise return as-is
    return value;
  }

  // Get primary type if multiple types
  const primaryType = Array.isArray(type) ? type[0] : type;

  // Handle string value conversions
  if (typeof value === 'string') {
    // Boolean conversion
    if (primaryType === 'boolean') {
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value; // Let validator handle invalid values
    }

    // Number conversion
    if (primaryType === 'number' || primaryType === 'integer') {
      const num = Number(value);
      if (!Number.isNaN(num)) {
        return num;
      }
      return value; // Let validator handle invalid values
    }

    // String type or no type info
    return value;
  }

  // Return as-is for other types
  return value;
}

// JSON Schema types for type hints
interface JSONSchema {
  type?: string | string[];
  properties?: Record<string, JSONSchemaProperty>;
  required?: string[];
  [key: string]: unknown;
}

interface JSONSchemaProperty {
  type?: string | string[];
  description?: string;
  [key: string]: unknown;
}
