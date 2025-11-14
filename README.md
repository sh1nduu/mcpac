# MCPaC (mcpac)

**MCP as Code** - Execute code with MCP servers as libraries

## ⚠️ Security Warning

**CRITICAL: This tool executes arbitrary code that may interact with your system. Use with extreme caution.**

- **Code Execution Risk**: This tool runs TypeScript/JavaScript code that can access your filesystem, network, and system resources
- **MCP Server Risk**: MCP servers have access to your system based on their configuration (filesystem access, API keys, etc.)
- **Untrusted Code**: Never execute code from untrusted sources
- **Sensitive Data**: Be cautious when using MCP servers with access to sensitive data
- **Review Before Execution**: Always review generated code and MCP server permissions before running

**By using this tool, you acknowledge these risks and take full responsibility for any consequences.**

---

## Overview

MCPaC is a tool that converts Model Context Protocol (MCP) servers into TypeScript libraries. It automatically generates TypeScript code from MCP tool definitions, enabling coding agents (like Claude, Cursor, etc.) to execute generated code.

## Features

- 🚀 **TypeScript Code Generation from MCP Servers**: Automatically convert tool definitions into type-safe APIs
- 💻 **Code Execution Environment**: Execute code using generated MCP libraries
- 🔐 **Capability-Based Permission System**: Explicit permission declarations with type safety
- 🔧 **Server Management**: Easily manage multiple MCP servers
- 🌐 **Multiple Transport Support**: Support both STDIO (local process) and HTTP (remote server)
- 🔍 **Tool Exploration**: Explore available functions and type definitions via CLI
- 📦 **Single Binary**: Single executable file with no runtime dependencies (for distribution)
- ⚡ **Automatic Cleanup**: Automatic resource management via inter-process communication

## Installation

### Binary Download (Recommended)

Download the binary for your platform from the latest release:

**Linux (x64)**
```bash
# Download
wget https://github.com/sh1nduu/mcpac/releases/download/v0.1.0/mcpac-0.1.0-linux-x64

# Add execute permission
chmod +x mcpac-0.1.0-linux-x64

# Install
sudo mv mcpac-0.1.0-linux-x64 /usr/local/bin/mcpac

# Verify
mcpac --version
```

**macOS (Apple Silicon)**
```bash
# Download
curl -L https://github.com/sh1nduu/mcpac/releases/download/v0.1.0/mcpac-0.1.0-darwin-arm64 -o mcpac

# Add execute permission
chmod +x mcpac

# Install
sudo mv mcpac /usr/local/bin/

# Verify
mcpac --version
```

**macOS (Intel)**
```bash
curl -L https://github.com/sh1nduu/mcpac/releases/download/v0.1.0/mcpac-0.1.0-darwin-x64 -o mcpac
chmod +x mcpac
sudo mv mcpac /usr/local/bin/
```

**Windows (PowerShell)**
```powershell
# Download
Invoke-WebRequest -Uri "https://github.com/sh1nduu/mcpac/releases/download/v0.1.0/mcpac-0.1.0-windows-x64.exe" -OutFile "mcpac.exe"

# Add to PATH (move to any directory)
Move-Item mcpac.exe C:\Program Files\mcpac\

# Verify
mcpac --version
```

### Build from Source

```bash
git clone https://github.com/sh1nduu/mcpac.git
cd mcpac
bun install
bun run build
./mcpac --version
```

### Development Mode

```bash
git clone https://github.com/sh1nduu/mcpac.git
cd mcpac
bun install
bun run dev --version
```

## Quick Start

### 1. Add MCP Server

```bash
mcpac server add filesystem \
  --command npx \
  --args @modelcontextprotocol/server-filesystem \
  --args /path/to/allowed/directory
```

### 2. Generate TypeScript Code

```bash
mcpac generate
```

Generated files:
```
servers/
├── _mcpac_runtime.ts      # Runtime library
├── filesystem/
│   ├── index.ts            # Exports
│   ├── read_file.ts        # Generated function
│   ├── write_file.ts
│   └── ...
└── index.ts                # Root exports
```

### 3. Explore Available Tools

```bash
mcpac tools list
```

Output:
```
Available tools (5):

filesystem.readFile
  Read file contents from the allowed directory

filesystem.writeFile
  Write content to a file in the allowed directory

...
```

### 4. Write Code Using Generated Libraries

Create `example.ts`:
```typescript
import type { McpRequires } from './servers/_types.js';

// Declare required permissions
declare const runtime: McpRequires<['filesystem.readFile', 'filesystem.writeFile']>;

// Read file
const result = await runtime.filesystem.readFile({
  path: 'example.txt'
});

// Extract text content
const content = result.content.find(c => c.type === 'text')?.text;
console.log('File content:', content);

// Write file
await runtime.filesystem.writeFile({
  path: 'output.txt',
  content: 'Hello from MCPaC!'
});
```

### 5. Execute Code with Permissions

```bash
# Grant required permissions when executing
mcpac execute -f example.ts --grant filesystem.readFile,filesystem.writeFile
```

## Usage

### Getting Started

Interactive setup guide:
```bash
mcpac getting-started
```

### Server Management

```bash
# Add server (STDIO)
mcpac server add <name> --command <cmd> --args <args...>

# Add server (HTTP)
mcpac server add <name> --type http --url <url> --headers "KEY=VALUE"

# List servers
mcpac server list

# Test connection
mcpac server test <name>

# Remove server
mcpac server remove <name>
```

### Code Generation

```bash
# Generate for all servers
mcpac generate

# Generate for specific server
mcpac generate -s <server-name>

# Force overwrite
mcpac generate --force
```

### Tool Exploration

```bash
# List all tools
mcpac tools list

# List tools for specific server
mcpac tools list -s <server-name>

# Show detailed tool description
mcpac tools describe <function_name>
```

### Direct Tool Invocation

Call MCP tools directly from CLI without writing code:

```bash
# Call tool with named flags
mcpac tools call readFile --path example.txt

# Call tool with JSON string
mcpac tools call readFile --json '{"path":"example.txt"}'

# Call tool with stdin
echo '{"path":"example.txt"}' | mcpac tools call readFile --stdin

# Output formats
mcpac tools call readFile --path example.txt --output-format text  # Default
mcpac tools call readFile --path example.txt --output-format json  # With metadata
mcpac tools call readFile --path example.txt --output-format raw   # Raw MCP response

# Skip validation
mcpac tools call readFile --path example.txt --no-validate

# Quiet mode
mcpac tools call readFile --path example.txt -q

# Verbose mode (show debug logs)
mcpac tools call readFile --path example.txt -v
```

**Argument Input Methods** (priority order):
1. `--stdin`: Read arguments from stdin as JSON
2. `--json`: Provide arguments as JSON string
3. Named flags: Use `--key value` or `--key=value` format

**Exit Codes**:
- `0`: Success
- `1`: Argument error or validation failure
- `2`: Tool execution error
- `3`: Server connection error

### Code Execution

```bash
# Execute from file with permissions
mcpac execute -f <file.ts> --grant server.tool1,server.tool2

# Execute inline code
mcpac execute -c "..." --grant filesystem.readFile

# Execute from stdin
cat script.ts | mcpac execute --stdin --grant filesystem.readFile

# Skip type checking
mcpac execute -f script.ts --no-typecheck --grant filesystem.readFile

# Quiet mode (suppress non-critical output)
mcpac execute -f script.ts -q --grant filesystem.readFile

# Verbose mode (show MCP server logs)
mcpac execute -f script.ts -v --grant filesystem.readFile
```

**Permission System:**

Your code must explicitly declare required permissions:

```typescript
import type { McpRequires } from './servers/_types.js';
declare const runtime: McpRequires<['server.tool1', 'server.tool2']>;
```

Then grant those permissions at execution time with `--grant`:

```bash
mcpac execute -f script.ts --grant server.tool1,server.tool2
```

If required permissions don't match granted permissions, execution will fail with a clear error message.

### Information Commands

```bash
# Check current status
mcpac info

# View usage examples
mcpac examples

# Show help
mcpac --help
mcpac <command> --help
```

## Examples

### Example 1: File Operations

```typescript
import type { McpRequires } from './servers/_types.js';

// Declare required permissions
declare const runtime: McpRequires<['filesystem.listDirectory', 'filesystem.readFile']>;

// List directory
const dirResult = await runtime.filesystem.listDirectory({ path: '.' });
console.log(dirResult.content[0].text);

// Read file
const fileResult = await runtime.filesystem.readFile({ path: 'README.md' });
const content = fileResult.content.find(c => c.type === 'text')?.text;
console.log('Content length:', content?.length);
```

Run with:
```bash
mcpac execute -f script.ts --grant filesystem.listDirectory,filesystem.readFile
```

### Example 2: GitHub Integration

```bash
# Add GitHub server
mcpac server add github \
  --command npx \
  --args @modelcontextprotocol/server-github \
  --env GITHUB_TOKEN=your_token_here

# Generate code
mcpac generate
```

```typescript
import type { McpRequires } from './servers/_types.js';

// Declare required permissions
declare const runtime: McpRequires<['github.createIssue']>;

// Create issue
const result = await runtime.github.createIssue({
  owner: 'username',
  repo: 'repository',
  title: 'Bug Report',
  body: 'Description of the bug'
});

console.log('Created issue:', result.content[0].text);
```

Run with:
```bash
mcpac execute -f script.ts --grant github.createIssue
```

### Example 3: HTTP Transport

```bash
# Add HTTP server
mcpac server add api \
  --type http \
  --url https://example.com/mcp \
  --headers "Authorization=Bearer token123"
```

## Configuration

Configuration file location: `./config/mcp-servers.json`

You can override the location with the `MCPAC_CONFIG_PATH` environment variable:

```bash
MCPAC_CONFIG_PATH=/custom/path/config.json mcpac server list
```

## Architecture

mcpac consists of three main layers:

1. **MCP Client Layer**: Manages connections to MCP servers
2. **Code Generation Layer**: Converts MCP tool definitions to TypeScript
3. **Execution Layer**: Runs generated code with Bun runtime

### Generated Code Structure

MCPaC generates TypeScript definitions and a capability-based runtime:

**Type Definitions** (`servers/_types.ts`):
```typescript
// Server interface with all tools
export interface McpServers {
  filesystem: {
    readFile(args: ReadFileInput): Promise<ReadFileOutput>;
    writeFile(args: WriteFileInput): Promise<WriteFileOutput>;
    // ...
  };
}

// Permission type for explicit declarations
export type McpRequires<T extends readonly PermissionId[]> =
  PickNamespacedRuntime<T, PermissionId, Methods>;
```

**User Code** (with explicit permission declarations):
```typescript
import type { McpRequires } from './servers/_types.js';

// Declare required permissions
declare const runtime: McpRequires<['filesystem.readFile']>;

// Use runtime to call MCP tools
const result = await runtime.filesystem.readFile({ path: 'data.txt' });
```

**Permission Format**: `server.toolName` (camelCase), e.g., `filesystem.readFile`, `github.createIssue`

## Development

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0

### Commands

```bash
# Development
bun run dev <command>

# Type checking
bun run typecheck

# Linting & Formatting
bun run check          # Auto-fix
bun run check:ci       # CI mode

# Testing
bun test               # All tests
bun test tests/unit    # Unit tests
bun test tests/e2e     # E2E tests

# Building
bun run build          # Build binary
bun run build:all      # Build for all platforms
bun run clean          # Clean build artifacts
```

## Limitations

- Generated code is TypeScript with `.ts` extension (executed by Bun)
- MCP server must be accessible at code generation and execution time
- HTTP transport does not support SSE streaming yet
- Windows binary may trigger antivirus warnings (false positive)

## Troubleshooting

### "Server not found" error

```bash
# Check configured servers
mcpac server list

# Test connection
mcpac server test <name>
```

### Type check errors

```bash
# Skip type checking
mcpac execute -f script.ts --no-typecheck

# View generated types
mcpac tools describe <function_name>
```

### Connection issues

```bash
# Verbose mode to see MCP server logs
mcpac execute -f script.ts -v

# Check MCP server stderr output
```

## Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)

## Inspiration

This project is inspired by Anthropic's blog post: [Code execution with MCP: Building more efficient agents](https://www.anthropic.com/engineering/code-execution-with-mcp)

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
