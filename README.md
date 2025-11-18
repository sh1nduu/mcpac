# MCPaC (mcpac) — *MCP as Code*

Execute TypeScript/JavaScript code using MCP servers as if they were libraries —  
AI agents call functions instead of generating raw MCP JSON.

---

## ⚠️ Security Warning

**CRITICAL: This tool executes arbitrary code that may interact with your system. Use with extreme caution.**

- **Code Execution Risk**: Code run via `mcpac execute` can access your filesystem, network, and system resources
- **MCP Server Risk**: MCP servers may access your system depending on their configuration (filesystem paths, API keys, HTTP endpoints, etc.)
- **Untrusted Code**: Never execute code from untrusted sources
- **Sensitive Data**: Be very careful when MCP servers can see secrets, source code, or production data
- **Review Before Execution**: Always review:
  - The MCP servers you configure
  - The permissions you grant with `--grant`
  - The code you are about to execute

**By using MCPaC, you acknowledge these risks and take full responsibility for any consequences.**

---

## Overview

MCPaC is a CLI tool that:

- Connects to MCP servers (filesystem, GitHub, HTTP APIs, etc.)
- Generates TypeScript type definitions for their tools
- Executes TypeScript/JavaScript code that calls those tools via a special injected `runtime` object

Typical use cases:

- Let AI coding agents (Claude, Cursor, etc.) call MCP tools without generating MCP JSON
- Keep occasionally used MCP servers available to agents via code, without maintaining full direct-tool integration
- Experiment with MCP servers from TypeScript instead of hand-written MCP JSON in a small, isolated sandbox

This project is one concrete implementation of the “code execution with MCP” idea described in Anthropic’s blog post: https://www.anthropic.com/engineering/code-execution-with-mcp

## Positioning / Scope

MCPaC is not intended to replace traditional MCP direct tool calls across your entire stack. It is a complementary approach that works best when:

- you want AI coding agents to occasionally use MCP servers without loading all tool definitions into context
- you prefer agents to write short pieces of code that compose multiple tools, rather than issuing many individual direct tool calls
- you are experimenting with new or low-frequency MCP servers and do not want to maintain full, first-class integrations yet

For high-frequency or latency-sensitive tools, traditional direct MCP tool calling may still be a better fit. MCPaC is designed as an additional option, not a universal replacement.

---

## Features

- 🚀 **TypeScript Code Generation from MCP Servers**  
  Automatically convert MCP tool definitions into type-safe APIs

- 💻 **Code Execution Environment**  
  Execute TypeScript/JavaScript using the generated MCP libraries

- 🔐 **Capability-Based Permission System**  
  Tools must be explicitly declared in code and explicitly granted via CLI

- 🔧 **Server Management**  
  Add, list, test, and remove MCP servers (STDIO & HTTP)

- 🌐 **Multiple Transport Support**  
  - STDIO: local processes (`npx @modelcontextprotocol/server-*`, etc.)
  - HTTP: remote MCP servers

- 🔍 **Tool Exploration**  
  Discover tools and their argument types via CLI

- 📦 **Single Binary (with a current limitation)**  
  Distributed as a single executable, but still requires Bun at execution time today — future versions aim to remove this dependency.

- ⚡ **Automatic Cleanup**  
  MCP connections are managed and cleaned up automatically

---

## Installation

Download the latest release from:  
https://github.com/sh1nduu/mcpac/releases

### macOS (Apple Silicon example)

```bash
curl -L https://github.com/sh1nduu/mcpac/releases/download/v0.4.0/mcpac-0.4.0-darwin-arm64 -o mcpac
chmod +x mcpac
sudo mv mcpac /usr/local/bin/
mcpac --version
```

> Similar binaries are available for Linux (x64), macOS (Intel), and Windows (x64).  
> See the release page for exact filenames and installation paths.

### Build from Source

```bash
git clone https://github.com/sh1nduu/mcpac.git
cd mcpac
bun install
bun run build
./mcpac --version
```

---

## 🧠 Core Concepts

MCPaC revolves around 4 ideas:

1. **Server registration**  
   You register MCP servers with `mcpac server add`.

2. **Code generation**  
   You run `mcpac generate` to create TypeScript type definitions for all servers and tools.

3. **Injected runtime**  
   When you run `mcpac execute`, MCPaC injects a special `runtime` object into your code.  
   You **do not create or import** this object yourself.

4. **Capability-based permissions**  
   Your code declares which tools it needs, and you must pass matching `--grant` flags when executing.

If **declared permissions** and **granted permissions** do not match, execution fails with a clear error.

---

## 🚀 Quick Start

### 1. Add an MCP server

Example: Filesystem server allowing access to a specific directory.

```bash
mcpac server add filesystem \
  --command npx \
  --args @modelcontextprotocol/server-filesystem \
  --args ./allowed-directory
```

### 2. Generate TypeScript code

```bash
mcpac generate
```

Generated structure:

```text
servers/
├── _mcpac_runtime.ts   # Runtime implementation (IPC, capability system)
├── _types.d.ts         # Root types for explicit import
├── global.d.ts         # MCPaC ambient namespace (for mcpac execute)
└── filesystem/
    ├── index.d.ts      # Server-level types
    ├── read_file.d.ts  # Individual tool definitions (original MCP names)
    └── write_file.d.ts
```

### 3. Write code

Create `example.ts`:

```ts
// Recommended: MCPaC ambient namespace (for mcpac execute)
// DO NOT create runtime yourself – it is injected at execution time.
declare const runtime: MCPaC.McpRequires<['filesystem.read_file', 'filesystem.write_file']>;

// Read file
const readResult = await runtime.filesystem.read_file({ path: 'example.txt' });
const text = readResult.content.find(c => c.type === 'text')?.text;
console.log('File content:', text);

// Write file
await runtime.filesystem.write_file({
  path: 'output.txt',
  content: 'Hello from MCPaC!'
});
```

### 4. Execute with permissions

```bash
mcpac execute -f example.ts \
  --grant filesystem.read_file,filesystem.write_file
```

If the requested tools in `McpRequires<...>` do not match the tools in `--grant`, execution is blocked.

---

## 🧰 Types & Runtime: Ambient Namespace vs Explicit Import

MCPaC exposes types in two ways:

### 1. Ambient namespace (recommended for `mcpac execute`)

```ts
// Available only when you run via `mcpac execute` after `mcpac generate`
declare const runtime: MCPaC.McpRequires<['filesystem.read_file']>;
```

This relies on `servers/global.d.ts`:

```ts
declare namespace MCPaC {
  export type McpRequires<T extends readonly string[]> =
    import('./_types.d.ts').McpRequires<T>;
}
```

> ⚠️ The ambient `MCPaC` namespace is intended for the `mcpac execute` environment only.
> It may not work as expected in bundlers, ts-node, or other tooling without extra configuration.

### 2. Explicit import (advanced / custom integration)

```ts
import type { McpRequires } from './servers/_types.js';

declare const runtime: McpRequires<['filesystem.read_file']>;
```

Use this style if you want to reuse MCPaC’s generated types inside your own runtime or agent harness and are comfortable wiring up MCP connections and capability checks yourself. The primary supported path is still `mcpac execute`; this explicit-import style is an advanced/custom option.

---

## 🔐 Permission System

**In code (declaring capabilities):**

```ts
declare const runtime: MCPaC.McpRequires<[
  'filesystem.list_directory',
  'filesystem.read_file'
]>;
```

**At execution time (granting capabilities):**

```bash
mcpac execute -f script.ts \
  --grant filesystem.list_directory,filesystem.read_file
```

Rules:

- Your code can only call tools listed in `McpRequires<...>`
- `mcpac execute` will only allow tools listed in `--grant`
- Both lists must match, otherwise execution fails

---

## CLI Usage

### Getting Started

```bash
mcpac getting-started   # Interactive setup
mcpac info              # Show current configuration & servers
mcpac examples          # Show example snippets
```

### Server Management

```bash
# Add server (STDIO)
mcpac server add <name> --command <cmd> --args <args...>

# Add server (HTTP)
mcpac server add <name> --type http --url <url> --headers "KEY=VALUE"

# List servers
mcpac server list

# Test server connection
mcpac server test <name>

# Remove server
mcpac server remove <name>
```

### Code Generation

```bash
# Generate for all servers
mcpac generate

# Generate for a specific server
mcpac generate -s <server-name>

# Overwrite existing generated files
mcpac generate --force
```

### Tool Exploration

```bash
# List all tools
mcpac tools list

# List tools for a specific server
mcpac tools list -s <server-name>

# Show detailed tool description (schema, examples, etc.)
# Use original MCP tool name (e.g., read_file, not readFile)
mcpac tools describe <function_name>
```

### Direct Tool Invocation (no code)

```bash
# Call tool with flags (use original MCP tool name)
mcpac tools call read_file --path example.txt

# Call with JSON string
mcpac tools call read_file --json '{"path":"example.txt"}'

# Call with JSON from stdin
echo '{"path":"example.txt"}' | mcpac tools call read_file --stdin
```

Output formats:

```bash
mcpac tools call read_file --path example.txt --output-format text  # Default
mcpac tools call read_file --path example.txt --output-format json  # With metadata
mcpac tools call read_file --path example.txt --output-format raw   # Raw MCP response
```

Extra flags:

- `--no-validate` : Skip argument validation
- `-q` / `--quiet`: Suppress non-critical output
- `-v` / `--verbose`: Print debug logs

Exit codes:

- `0` : Success
- `1` : Argument error / validation failure
- `2` : Tool execution error
- `3` : Server connection error

### Code Execution

```bash
# Execute from file
mcpac execute -f script.ts --grant server.tool1,server.tool2

# Execute inline code
mcpac execute -c "/* code here */" --grant filesystem.read_file

# Execute from stdin
cat script.ts | mcpac execute --stdin --grant filesystem.read_file

# Skip type checking (faster, but less safe)
mcpac execute -f script.ts --no-typecheck --grant filesystem.read_file

# Verbose / quiet
mcpac execute -f script.ts -v --grant filesystem.read_file
mcpac execute -f script.ts -q --grant filesystem.read_file
```

---

## Examples

### Example 1: File Operations

```ts
// Declare required permissions (use original MCP tool names)
declare const runtime: MCPaC.McpRequires<[
  'filesystem.list_directory',
  'filesystem.read_file'
]>;

// List directory
const dir = await runtime.filesystem.list_directory({ path: '.' });
const listText = dir.content.find(c => c.type === 'text')?.text;
console.log('Directory listing:', listText);

// Read file
const file = await runtime.filesystem.read_file({ path: 'README.md' });
const content = file.content.find(c => c.type === 'text')?.text;
console.log('Content length:', content?.length);
```

Run:

```bash
mcpac execute -f script.ts \
  --grant filesystem.list_directory,filesystem.read_file
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

```ts
declare const runtime: MCPaC.McpRequires<['github.create_issue']>;

const result = await runtime.github.create_issue({
  owner: 'username',
  repo: 'repository',
  title: 'Bug Report',
  body: 'Description of the bug'
});

const text = result.content.find(c => c.type === 'text')?.text;
console.log('Created issue:', text);
```

Run:

```bash
mcpac execute -f script.ts --grant github.create_issue
```

### Example 3: Multi-tool workflow with loops

This example shows how an agent can coordinate multiple tools in a loop.  
Assume you have a local JSON file that defines GitHub issues to create:

```json
[
  { "title": "Bug: login fails", "body": "Steps to reproduce..." },
  { "title": "Feature: dark mode", "body": "It would be nice if..." }
]
```

You can let an agent write code that reads this configuration and creates issues on GitHub:

```ts
// Use both filesystem and GitHub tools in a loop
declare const runtime: MCPaC.McpRequires<[
  'filesystem.read_file',
  'github.create_issue'
]>;

// Read issue definitions from a local JSON file
const fileResult = await runtime.filesystem.read_file({ path: './issues.json' });
const text = fileResult.content.find(c => c.type === 'text')?.text ?? '[]';

type IssueDef = { title: string; body: string };
const issues = JSON.parse(text) as IssueDef[];

// Create issues on GitHub in a loop
for (const issue of issues) {
  const result = await runtime.github.create_issue({
    owner: 'username',
    repo: 'repository',
    title: issue.title,
    body: issue.body,
  });

  const created = result.content.find(c => c.type === 'text')?.text;
  console.log('Created issue:', created);
}
```

Run:

```bash
mcpac execute -f script.ts --grant filesystem.read_file,github.create_issue
```

In a real agent workflow, this kind of multi-tool loop lives entirely in the execution environment:  
the model only needs to generate the code once, and then the runtime handles all iterations and tool coordination.

---

## Configuration

Default config file:

```text
./config/mcp-servers.json
```

Override via environment variable:

```bash
MCPAC_CONFIG_PATH=/custom/path/config.json mcpac server list
```

---

## Architecture

MCPaC consists of three main layers:

1. **MCP Client Layer**  
   Manages STDIO/HTTP connections to MCP servers and routes requests/responses.

2. **Code Generation Layer**  
   Converts MCP tool definitions into TypeScript `.d.ts` files and a capability-aware runtime.

3. **Execution Layer**  
   Uses Bun to execute TypeScript/JavaScript code and injects the `runtime` object.

Generated code structure:

```text
servers/
├── _mcpac_runtime.ts       # Runtime implementation (IPC, capability system)
├── _types.d.ts             # Root types (McpServers, McpRequires, etc.)
├── global.d.ts             # Ambient MCPaC namespace for mcpac execute
└── <serverName>/
    ├── index.d.ts          # Server-level type definitions
    ├── <tool1>.d.ts        # Individual tool definitions
    └── <tool2>.d.ts
```

---

## Development

### Prerequisites

- [Bun](https://bun.sh/) >= 1.0

### Useful commands

```bash
# Development wrapper
bun run dev <command>

# Type checking
bun run typecheck

# Linting & formatting
bun run check       # Auto-fix
bun run check:ci    # CI mode

# Tests
bun test            # All tests
bun test tests/unit
bun test tests/e2e

# Build
bun run build       # Build binary
bun run build:all   # Build for all platforms
bun run clean       # Clean artifacts
```

---

## Limitations

- Executed code currently assumes Bun as the runtime
- MCP server must be reachable at both:
  - Code generation time (for type generation)
  - Execution time (for actual calls)
- The current MCP protocol typically describes input schemas but not the full shape of tool responses (e.g. JSON structures embedded inside `text` content blocks), so MCPaC cannot always generate precise response types beyond `ContentBlock`; agents may still need to infer or learn response shapes from documentation or examples
- HTTP transport does not support SSE streaming yet
- Windows binary may trigger antivirus warnings (false positives)

---

## Troubleshooting

### "Server not found"

```bash
mcpac server list
mcpac server test <name>
```

### Type check errors

```bash
# Skip type checking (for quick debugging)
mcpac execute -f script.ts --no-typecheck

# Inspect the generated types for a tool
mcpac tools describe <function_name>
```

### Connection issues

```bash
# See detailed MCP logs
mcpac execute -f script.ts -v

# Check the MCP server's stderr output
```

---

## Resources

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Official MCP Servers](https://github.com/modelcontextprotocol/servers)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- Anthropic blog: *Code execution with MCP: Building more efficient agents*

---

## License

MIT

---

## Contributing

Contributions are welcome! Please feel free to open issues or submit pull requests.