# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Language Policy

**IMPORTANT: This is a public repository. All code, documentation, and commit messages MUST be in English.**

- **Source Code**: All comments, documentation strings, and code identifiers must be in English
- **Documentation**: README.md, code comments, and all documentation files must be in English
- **Commit Messages**: All commit messages must be in English
- **Conversations**: Claude Code may respond in the user's preferred language (e.g., Japanese) during conversations, but all written artifacts (code, docs, commits) must remain in English

## Project Overview

MCPaC (MCP as Code) converts Model Context Protocol (MCP) servers into TypeScript libraries that can be executed as code. The tool generates type-safe TypeScript wrappers from MCP tool definitions and provides an execution environment.

**Core Flow**: MCP Server → Code Generation (TypeScript) → Code Execution (Bun runtime)

## Essential Commands

```bash
# Getting Started
bun run dev getting-started                                      # Interactive setup guide

# Server Management
bun run dev server add <name> --command <cmd> --args <args...>  # Add STDIO MCP server
bun run dev server add <name> --type http --url <url>           # Add HTTP MCP server
bun run dev server test <name>                                   # Test server connection
bun run dev server list                                          # List all servers
bun run dev server remove <name>                                 # Remove server

# Code Generation
bun run dev generate                                             # Generate code for all servers
bun run dev generate -s <name>                                   # Generate code for specific server
bun run dev generate --force                                     # Force overwrite existing files

# Code Execution
bun run dev execute -f <file>                                    # Execute TypeScript file
bun run dev execute --stdin                                      # Read code from stdin
bun run dev execute -f <file> --no-typecheck                    # Skip type checking
bun run dev execute -f <file> -q                                 # Quiet mode
bun run dev execute -f <file> -v                                 # Verbose mode

# Tools Management
bun run dev tools list                                           # List all available tools
bun run dev tools list -s <name>                                 # List tools for specific server
bun run dev tools describe <function_name>                       # Show detailed tool description

# Information
bun run dev info                                                 # Show current status
bun run dev examples                                             # View usage examples

# Quality Checks
bun run typecheck          # TypeScript type checking
bun run check              # Format and lint (auto-fix)
bun run check:ci           # Format and lint check (CI mode)

# Testing
bun test                   # Run all tests
bun test tests/unit        # Unit tests only
bun test tests/e2e         # E2E tests only
bun test --watch           # Watch mode
bun test <file>            # Single test file

# Building
bun run build              # Build native binary (with typecheck)
bun run build:all          # Build for all platforms
./scripts/build.sh         # Full build script with checksums
bun run clean              # Clean build artifacts
```

## Transport Types

MCPaC supports two transport types for connecting to MCP servers:

### STDIO Transport
Standard input/output based communication for local MCP servers:
```bash
# Add STDIO server
bun run dev server add filesystem --command npx --args -y @modelcontextprotocol/server-filesystem /path/to/files

# With environment variables
bun run dev server add myserver --command npx --args -y my-mcp-server --env KEY1=value1 --env KEY2=value2
```

**Config format:**
```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/files"],
      "env": { "KEY": "value" }
    }
  }
}
```

### HTTP Transport
HTTP-based communication for remote MCP servers:
```bash
# Add HTTP server
bun run dev server add remote-server --type http --url https://api.example.com/mcp

# With custom headers (e.g., authentication)
bun run dev server add remote-server --type http --url https://api.example.com/mcp --headers Authorization "Bearer token123" --headers X-Custom-Header "value"
```

**Config format:**
```json
{
  "mcpServers": {
    "remote-server": {
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer token123",
        "X-Custom-Header": "value"
      }
    }
  }
}
```

## Architecture

### Three-Layer System

1. **MCP Client Layer** (`src/mcp/`)
   - `manager.ts`: Singleton managing multiple MCP server connections
   - `client.ts`: JSON-RPC 2.0 client for individual servers (supports STDIO and HTTP transports)
   - `types.ts`: Type definitions for MCP server configurations
   - `tool-caller.ts`: Common tool calling function used by generated code
   - Config stored in nested format: `{ "mcpServers": { "serverName": { command, args, env } } }`
   - Supports both STDIO (command/args) and HTTP (url/headers) transport types
   - Singleton reset required in tests: `MCPManager.instance = null`

2. **Code Generation Layer** (`src/generator/`)
   - `index.ts`: Main orchestrator, coordinates generation for all servers (exports `Generator` class)
   - `codegen.ts`: Converts MCP tool definitions to TypeScript (exports `CodeGenerator` class)
   - `parser.ts`: JSON Schema → TypeScript types via json-schema-to-typescript (exports `SchemaParser` class)
   - `filesystem.ts`: File operations (exports `FilesystemManager` class)
   - `runtime-template.ts`: Runtime template for generated code
   - Output: `servers/<serverName>/<toolName>.ts` + `index.ts` + `servers/_mcpc_runtime.ts`

3. **Execution Layer** (`src/executor/`)
   - `context.ts`: Prepares execution environment with env vars (MCPAC_CONFIG_PATH, MCPAC_WORKSPACE)
   - `runner.ts`: Spawns Bun processes to execute TypeScript code
   - `result.ts`: Handles exit codes, stdout/stderr
   - `type-checker.ts`: Type checking functionality for generated code
   - `ipc-executor.ts`: IPC-based execution for advanced use cases
   - User code imports generated functions, which call back to MCP servers via MCPManager

### CLI Structure (`src/commands/`)

All commands support `MCPAC_CONFIG_PATH` environment variable for test isolation:

```typescript
const configPath = process.env.MCPAC_CONFIG_PATH;
const manager = MCPManager.getInstance(configPath);
```

### Critical Type Conversions

**MCPTool** (from SDK) → **ToolDefinition** (internal):
```typescript
const toolDef = {
  serverName: 'filesystem',
  toolName: tool.name,
  description: tool.description,
  inputSchema: tool.inputSchema
};
```

**Tool Result Format**: Array of objects, not string
```typescript
result.content // => [{ type: "text", text: "..." }]
```

## Testing Strategy

### Unit Tests (`tests/unit/`)
- Reset MCPManager singleton: `MCPManager.instance = null`
- Use nested config format with `mcpServers` wrapper
- Test files use isolated config paths: `./tests/unit/test-<name>-config.json`

### E2E Tests (`tests/e2e/`)
- Test CLI via `Bun.spawn()` with separate process
- Some tests skipped (test.skip) due to MCP server connection latency
- Use `MCPAC_CONFIG_PATH` for test isolation

### Key Test Patterns

```typescript
// Config format (CORRECT)
const config = {
  mcpServers: {
    'test-server': { command: 'npx', args: [...] }
  }
};

// NOT flat format like this:
// { 'test-server': { command: 'npx', args: [...] } }

// Cleanup
await client.close();  // NOT disconnect()!
```

## Build System

### Single Executable Application
- Bun's `--compile` embeds runtime (~62-118MB per binary)
- `--minify` for size reduction
- `--sourcemap` for debugging (zstd compressed)
- No `--bytecode` (ESM incompatible)

### Cross-compilation
All platforms can be built from any host:
- `bun-linux-x64`, `bun-linux-arm64`
- `bun-darwin-x64`, `bun-darwin-arm64`
- `bun-windows-x64` (auto-appends .exe)

## Configuration Files

### tsconfig.json
- `downlevelIteration: true` - Required for Map iteration in ES2022
- Strict mode with `noUncheckedIndexedAccess`
- Excludes: `tests/generated`, `tests/workspace`, `dist`

### package.json
- `"type": "module"` - Pure ESM project
- lint-staged runs `tsc --noEmit` once for all files via `bash -c`
- No individual file checking (causes issues)

## Git Hooks

Pre-commit via Husky + lint-staged:
1. Biome format/lint on `*.{ts,js,json}`
2. TypeScript check on all `*.ts` files (project-wide)

## Environment Variables

- `MCPAC_CONFIG_PATH`: Override default config location (crucial for tests)
- `MCPAC_WORKSPACE`: Workspace directory for code execution

## Release Process

1. Update `package.json` version
2. Update `CHANGELOG.md`
3. Commit: `git commit -m "chore: bump version to X.Y.Z"`
4. Tag: `git tag vX.Y.Z`
5. Push: `git push origin main && git push origin vX.Y.Z`
6. GitHub Actions auto-builds and releases

## Common Gotchas

1. **MCPManager is a singleton** - Must reset in tests or you'll get stale connections
2. **Config format is nested** - Use `{ "mcpServers": { "serverName": {...} } }` format
3. **Tool content is array** - Use `JSON.stringify(result.content)` to check text
4. **Client method is close()** - Not `disconnect()` (will error)
5. **Error type must be Error object** - Not string in test expectations
6. **Bytecode mode unavailable** - ESM + top-level await incompatible

## Phase Documentation

Comprehensive docs in `docs/phase*.md`:
- Phase 1-7: Complete implementation guide
- `phase*-results.md`: Implementation outcomes and metrics
- `technical-references.md`: Deep technical details

All phases complete - project is production-ready at v0.1.0.
