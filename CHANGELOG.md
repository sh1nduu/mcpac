# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Direct Tool Invocation**: New `tools call` command for invoking MCP tools directly from CLI without writing code
  - Multiple argument input methods with priority ordering: stdin > JSON string > named flags
  - Support for both `--key value` and `--key=value` argument formats
  - Automatic type conversion using JSON Schema hints
  - Three output formats: text (default), json (with metadata), and raw (MCP response)
  - JSON Schema validation with `--no-validate` flag to skip validation
  - Proper exit codes: 0 (success), 1 (argument error), 2 (tool error), 3 (connection error)
  - Automatic cleanup of MCP connections on exit

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
