# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2025-11-18

### Added
- **Centralized Naming Management System** (`src/naming/`)
  - Single source of truth for all naming conversions
  - Immutable name variants with automatic validation
  - Built-in caching for performance optimization
  - Comprehensive unit test coverage (25 tests)

### Changed (BREAKING)
- **Tool and server names now use original MCP names without conversion**
  - Permission IDs use exact MCP tool names (e.g., `filesystem.read_file` instead of `filesystem.readFile`)
  - Server names with hyphens are preserved (e.g., `demo-filesystem` not `demoFilesystem`)
  - TypeScript properties match MCP names (may require bracket notation for non-identifiers)
  - Generated `.d.ts` filenames remain camelCase for filesystem compatibility
  - Type names remain PascalCase following TypeScript conventions

- **Simplified permission system**
  - No format conversion between user and MCP permissions
  - Permissions use original MCP tool names directly
  - User code: `declare const runtime: MCPaC.McpRequires<['filesystem.read_file']>`
  - CLI: `--grant filesystem.read_file`

- **Migration required for existing users**
  ```typescript
  // Before (0.3.0): Automatic conversion
  declare const runtime: MCPaC.McpRequires<['filesystem.readFile']>;
  await runtime.filesystem.readFile({ path: '/data.txt' });

  // After (0.4.0): Original MCP names
  declare const runtime: MCPaC.McpRequires<['filesystem.read_file']>;
  await runtime.filesystem.read_file({ path: '/data.txt' });
  // or with bracket notation:
  await runtime.filesystem["read_file"]({ path: '/data.txt' });
  ```

### Removed (BREAKING)
- Automatic camelCase conversion for tool names
- `permissionToMcpFormat()` function from `ipc-executor.ts`
- `toKebabCase()` function from `ipc-executor.ts`
- Scattered naming conversion functions throughout codebase

### Migration Guide
1. **Update permission declarations** to use original MCP tool names
2. **Regenerate all code**: Run `mcpac generate` to regenerate type definitions
3. **Update tool calls** to use original names or bracket notation
4. **Review custom scripts** that reference tool names

Example MCP tool name formats:
- snake_case: `read_file`, `list_directory` (traditional MCP servers)
- camelCase: `printEnv`, `getTinyImage` (e.g., @modelcontextprotocol/server-everything)
- kebab-case: Use bracket notation for server names like `test-fs`

### Fixed
- Test expectations updated to match snake_case tool naming convention
- Relocated naming-manager tests from `src/naming/__tests__/` to `tests/unit/` for consistency

## [0.3.0] - 2025-11-15

### Added
- **Hierarchical .d.ts Type System**: Individual tool type definitions for efficient token usage
  - Tool types split into separate `<server>/<tool>.d.ts` files
  - Server-level type aggregation in `<server>/index.d.ts`
  - Lightweight root type aggregator in `_types.d.ts`
  - Reduces context size for large projects with many MCP tools
- **MCPaC Ambient Namespace**: Zero-import type declarations via `global.d.ts`
  - Use `MCPaC.McpRequires<[...]>` without explicit imports
  - Eliminates boilerplate from user code (2 lines → 1 line)
  - Alternative explicit import syntax still supported for preference
- **Capability-Based Permission System**: Secure permission model with host-side enforcement
  - Mandatory `--grant` flag for execute command
  - Required permission declarations in user code via `McpRequires<[...]>` type parameter
  - Permission validation before execution (required vs granted)
  - Host-side permission checks in IPC server (untrusted user code cannot bypass)
  - Permission format: `server.toolName` (camelCase), e.g., `filesystem.readFile`
- **Bun.macro Template Loading**: Runtime template embedded at bundle-time
  - Enables single executable distribution without filesystem access
  - Similar to Rust's `include_str!()` macro pattern

### Changed
- **BREAKING: Permission declarations now mandatory**: All user code must declare required permissions
  ```typescript
  // Before (0.2.x): No permission declaration needed
  const result = await runtime.filesystem.readFile({ path: './data.txt' });

  // After (0.3.0): Must declare permissions
  declare const runtime: MCPaC.McpRequires<['filesystem.readFile']>;
  const result = await runtime.filesystem.readFile({ path: './data.txt' });
  ```
- **BREAKING: Generated file structure changed**: From implementation `.ts` to type-only `.d.ts` hierarchy
  ```
  Before (0.2.x):                After (0.3.0):
  servers/                       servers/
  ├── _mcpac_runtime.ts          ├── _mcpac_runtime.ts
  ├── _types.ts                  ├── _types.d.ts
  └── <server>/                  ├── global.d.ts
      ├── index.ts               └── <server>/
      ├── <tool1>.ts                 ├── index.d.ts
      └── <tool2>.ts                 ├── <tool1>.d.ts
                                     └── <tool2>.d.ts
  ```
- **Security: Permission enforcement moved to host side**: IPC server validates permissions (not user code)
- **Code generation: Removed root `servers/index.ts`**: No longer generated (unused file)
- **Tools commands updated for .d.ts structure**: `tools list`, `tools describe`, `tools call` work with new hierarchy

### Fixed
- Permission format conversion: camelCase (user) ↔ snake_case (MCP) ↔ kebab-case (config)
- Server name mapping for tools with hyphenated server names (e.g., `test-fs` → `testFs`)
- Workspace directory resolution for inline code execution
- Type checker now includes `global.d.ts` for MCPaC namespace resolution
- Runtime injector recognizes MCPaC namespace syntax

### Documentation
- Updated README.md with MCPaC namespace examples and hierarchical structure
- Updated CLAUDE.md architecture documentation with new type system
- Updated `getting-started`, `examples`, and `info` commands to show new patterns
- Removed percentage claims about token reduction (specific numbers unclear)

## [0.2.1] - 2025-11-13

### Fixed
- **Execute --stdin bug**: Fixed ENOENT error when using `execute --stdin` command
  - Changed temporary file location from `workspaceDir` to OS temp directory (`os.tmpdir()`)
  - Added process ID to temp filename for better isolation (`.mcpac-temp-{pid}-{timestamp}.ts`)
  - Ensures cross-platform compatibility (macOS, Linux, Windows)
- **Missing stdout with --stdin**: Fixed console.log output not appearing when using `--stdin`
  - stdin was being read twice (once for type checking, once for execution)
  - Now reads stdin once and reuses the value for both operations

## [0.2.0] - 2025-11-13

### Added
- **Direct Tool Invocation**: New `tools call` command for invoking MCP tools directly from CLI without writing code
  - Multiple argument input methods with priority ordering: stdin > JSON string > named flags
  - Support for both `--key value` and `--key=value` argument formats
  - Automatic type conversion using JSON Schema hints
  - Three output formats: text (default), json (with metadata), and raw (MCP response)
  - JSON Schema validation with `--no-validate` flag to skip validation
  - Proper exit codes: 0 (success), 1 (argument error), 2 (tool error), 3 (connection error)
  - Automatic cleanup of MCP connections on exit
- **Documentation**: Added comprehensive documentation update guidelines in CLAUDE.md

### Dependencies
- Added `ajv@8.12.0` for JSON Schema validation
- Added `ajv-formats@3.0.1` for format validators (email, uri, etc.)

## [0.1.1] - 2025-11-12

### Fixed
- Renamed all `mcpc` references to `mcpac` for consistency throughout the codebase
  - Environment variables: `MCPC_*` → `MCPAC_*` (CONFIG_PATH, WORKSPACE, SERVERS_PATH, TYPECHECK, DEBUG)
  - File names: `_mcpc_runtime.ts` → `_mcpac_runtime.ts`
  - Temporary files: `.mcpc-temp-*.ts` → `.mcpac-temp-*.ts`, `.mcpc-typecheck-*.ts` → `.mcpac-typecheck-*.ts`
  - IPC socket paths: `/tmp/mcpc-*.sock` → `/tmp/mcpac-*.sock`

### Changed
- Updated CLAUDE.md with accurate architecture documentation
  - Fixed generator layer file names (orchestrator.ts → index.ts, etc.)
  - Added comprehensive HTTP transport documentation
  - Documented all CLI commands and options
  - Added version management guidelines
  - Removed obsolete Phase Documentation section

## [0.1.0] - 2025-11-12

### Added

#### Core Features
- **MCP Server Management**: Add, remove, list, and test MCP server connections
  - Support for STDIO transport (local processes)
  - Support for HTTP transport (remote servers)
  - Environment variable configuration for servers
  - Server connection health checks
- **TypeScript Code Generation**: Automatic generation of type-safe TypeScript wrappers from MCP tool definitions
  - JSON Schema to TypeScript type conversion
  - Generated code with full type safety
  - Organized file structure per server
- **Code Execution Environment**: Execute TypeScript code using generated MCP libraries
  - Bun runtime integration
  - Automatic resource cleanup via inter-process communication
  - Support for file, inline code, and stdin execution modes
  - Optional type checking with `--no-typecheck` flag
- **Tool Exploration**: Discover and inspect available MCP tools
  - List all tools or filter by server
  - Detailed tool descriptions with input/output schemas
  - Type definition previews

#### CLI Commands
- `server add`: Add new MCP server with STDIO or HTTP transport
- `server list`: Display all configured servers
- `server test`: Test connection to a specific server
- `server remove`: Remove a server from configuration
- `generate`: Generate TypeScript code from MCP tools
- `tools list`: List available tools across all servers
- `tools describe`: Show detailed information about a specific tool
- `execute`: Execute TypeScript code with MCP integration
- `info`: Display current configuration status
- `examples`: Show usage examples
- `getting-started`: Interactive setup guide

#### Distribution
- **Single Binary Distribution**: Self-contained executables for multiple platforms
  - Linux x64 and ARM64
  - macOS Intel and Apple Silicon
  - Windows x64
- **Cross-platform Build System**: Build all platform binaries from any host

#### Developer Experience
- Configuration file management with `MCPAC_CONFIG_PATH` support
- Verbose mode for debugging MCP server communication
- Quiet mode for suppressing non-critical output
- Comprehensive error handling and user-friendly messages

### Security
- Added prominent security warning in README about code execution risks
- Documented MCP server permission considerations
- Clear guidelines for reviewing code before execution

[0.1.0]: https://github.com/sh1nduu/mcpac/releases/tag/v0.1.0
