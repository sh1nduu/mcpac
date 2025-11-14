# Capability-Based Permission System Implementation Plan

## Overview
MCPaCに型安全なcapability-based permission systemを導入し、AIが生成したコードの権限を型検査で抽出し、ユーザーが設定した権限と照合する仕組みを実装します。

## Background

### Reference Implementation
- Repository: https://github.com/sh1nduu/poc-capability-based-runtime
- Key concepts:
  - Type-level permission tracking using `McpRequires<T>`
  - Runtime authority with nested namespace access
  - Static validation using TypeScript Compiler API

### Design Requirements
1. **Permission Declaration**: Extract from type parameters (`McpRequires<[...]>`) using AST analysis + validate against CLI grants
2. **Entry Point**: Support global `runtime` variable injection
3. **Backward Compatibility**: Breaking change (no compatibility with v1.x)
4. **Validation**: Static (pre-execution) + Runtime (IPC boundary)
5. **Runtime Check**: Host-side validation (user code can be tampered)

---

## Phase 1: Core Type System & Runtime (Foundation)

### 1.1 Type Transformation Utilities
**New file:** `src/capability/types.ts`

Implement type-level transformations for capability system:

```typescript
// Nested server interface → Flat permission IDs
type MethodsFromServers<T> = ...

// Granted subset → Nested access
type PickNamespacedRuntime<Perms, PermissionId, Methods> = ...

// Helper types
type FilterMethods<...> = ...
type GroupByServer<...> = ...

// Public API
export type McpRequires<T extends readonly string[]> =
  PickNamespacedRuntime<T, PermissionId, Methods>
```

**Key features:**
- `MethodsFromServers`: Flattens nested server/tool structure to `'server.tool'` format
- `FilterMethods`: Filters methods by granted permissions
- `GroupByServer`: Reconstructs nested structure for runtime access
- Full type preservation through all transformations

**Dependencies:**
- None (pure TypeScript types)

---

### 1.2 Runtime Authority Implementation
**New file:** `src/capability/authority.ts`

Implement runtime authority with security features:

```typescript
export class NamespacedRuntimeAuthority<P extends string, Methods> {
  private secretKey: string;
  private methodImplementations: Methods;

  constructor(methodImplementations: Methods);
  grant<T extends readonly P[]>(...permissions: T): PickNamespacedRuntime<T, P, Methods>;
  verify(obj: any): boolean;
}
```

**Key features:**
- **Forgery prevention**: Symbol-based secret with UUID
- **Permission checking**: Per-call validation with detailed errors
- **Immutability**: Object.freeze on all nested objects
- **Nested access**: Creates `rt.server.tool()` structure

**Security properties:**
- Cannot forge runtime objects (unique symbol + UUID)
- Cannot modify granted permissions (frozen objects)
- Clear error messages with granted permission list
- Fails fast on unauthorized access

**Dependencies:**
- `crypto.randomUUID()` (Node.js built-in)
- Type utilities from `types.ts`

---

### 1.3 Permission Validator
**New file:** `src/capability/validator.ts`

Implement AST-based permission extraction and validation:

```typescript
export interface ValidationResult {
  paramName: string;
  typeName: string;
  permissions: string[];
  isValid: boolean;
  reason: string;
}

export class PermissionValidator {
  constructor(code: string, validLibraries?: string[]);

  validateFunctions(): ValidationResult[];
  extractPermissions(): string[];
}
```

**Validation logic (three checks):**
1. **Import source check**: Must import from whitelisted libraries
2. **Local definition check**: If local, must be based on `PickRuntime`
3. **PickRuntime tracing**: Recursively verify type alias chains

**Whitelist:**
- `./servers/_mcpac_runtime`
- `./servers/_types`
- `mcpac` (package name)

**Detection patterns:**
- Function parameters: `(rt: McpRequires<['filesystem.read']>)`
- Global declarations: `declare const runtime: McpRequires<[...]>`
- Type aliases: `type MyRequires = McpRequires<[...]>`

**Dependencies:**
- `typescript` (TypeScript Compiler API)
- AST traversal and type analysis

---

## Phase 2: Code Generation Updates

### 2.1 Generate Type Definitions
**Update:** `src/generator/codegen.ts`

Add method to generate consolidated type definitions:

```typescript
export class CodeGenerator {
  // Existing methods...

  generateTypes(toolDefinitions: ToolDefinition[]): string {
    // Generate:
    // 1. interface McpServers { ... }
    // 2. type Methods = MethodsFromServers<McpServers>
    // 3. type PermissionId = keyof Methods & string
    // 4. export type McpRequires<T> = PickNamespacedRuntime<T, PermissionId, Methods>
  }
}
```

**Generated file:** `servers/_types.ts`

Example output:
```typescript
import type { MethodsFromServers, PickNamespacedRuntime } from './_mcpac_runtime.js';

export interface McpServers {
  filesystem: {
    read_file(args: { path: string }): Promise<MCPToolResult>;
    write_file(args: { path: string; content: string }): Promise<MCPToolResult>;
  };
  github: {
    create_issue(args: { title: string; body: string }): Promise<MCPToolResult>;
  };
}

export type Methods = MethodsFromServers<McpServers>;
export type PermissionId = keyof Methods & string;
export type McpRequires<T extends readonly PermissionId[]> =
  PickNamespacedRuntime<T, PermissionId, Methods>;
```

**Dependencies:**
- Tool definitions from MCP servers
- Type transformation utilities

---

### 2.2 Update Runtime Template
**Update:** `src/generator/runtime-template.ts`

Add capability system components:

```typescript
// Add to template:
// 1. Type transformation utilities (from types.ts)
// 2. NamespacedRuntimeAuthority class (from authority.ts)
// 3. createRuntime() function
// 4. Export McpRequires type

export function createRuntime<T extends readonly PermissionId[]>(
  permissions: T
): PickNamespacedRuntime<T, PermissionId, Methods> {
  // Create method implementations that call via IPC
  const methods: Methods = {
    'filesystem.read_file': async (args) => {
      return await callMCPTool('filesystem', 'read_file', args);
    },
    // ... all tools
  };

  const authority = new NamespacedRuntimeAuthority(methods);
  return authority.grant(...permissions);
}
```

**Key changes:**
- Keep existing `callMCPTool` (for internal use)
- Add `createRuntime()` as new public API
- Embed type utilities and authority class
- Export `McpRequires` for user imports

---

### 2.3 Generate Server Interface
**Update:** `src/generator/index.ts`

Modify generation flow:

```typescript
export class Generator {
  async generateAll(): Promise<void> {
    // 1. Fetch all tools from all servers
    const allTools = await this.parser.parseAllServers();

    // 2. Generate consolidated types FIRST
    const typesCode = this.codegen.generateTypes(allTools);
    await this.filesystem.writeFile('servers/_types.ts', typesCode);

    // 3. Generate individual tool files (existing flow)
    for (const toolDef of allTools) {
      // ... existing logic
    }

    // 4. Generate runtime template with capability support
    await this.generateRuntime();
  }
}
```

**Order matters:**
- Types must be generated before tools reference them
- Runtime template must include all type utilities

---

## Phase 3: Execution Layer Integration

### 3.1 Permission Extraction
**New file:** `src/executor/permission-extractor.ts`

Extract required permissions from user code:

```typescript
export interface ExtractionResult {
  permissions: string[];
  errors: ValidationError[];
  warnings: string[];
}

export class PermissionExtractor {
  constructor(private validator: PermissionValidator);

  extract(code: string): ExtractionResult {
    const results = this.validator.validateFunctions();

    // Aggregate permissions from all functions/declarations
    const permissions = new Set<string>();
    const errors: ValidationError[] = [];

    for (const result of results) {
      if (result.isValid) {
        result.permissions.forEach(p => permissions.add(p));
      } else {
        errors.push({
          param: result.paramName,
          type: result.typeName,
          reason: result.reason
        });
      }
    }

    return {
      permissions: Array.from(permissions),
      errors,
      warnings: this.generateWarnings(results)
    };
  }
}
```

**Handles:**
- Multiple `McpRequires` parameters in single file
- Global `runtime` declarations
- Type aliases and re-exports
- Invalid import sources

---

### 3.2 Permission Comparison
**New file:** `src/executor/permission-checker.ts`

Compare required vs granted permissions:

```typescript
export interface PermissionCheckResult {
  allowed: boolean;
  missing: string[];
  extra: string[];
  summary: string;
}

export class PermissionChecker {
  check(required: string[], granted: string[]): PermissionCheckResult {
    const missingPerms = required.filter(p => !granted.includes(p));
    const extraPerms = granted.filter(p => !required.includes(p));

    return {
      allowed: missingPerms.length === 0,
      missing: missingPerms,
      extra: extraPerms,
      summary: this.formatSummary(required, granted, missingPerms)
    };
  }

  private formatSummary(required: string[], granted: string[], missing: string[]): string {
    if (missing.length === 0) {
      return `✓ All required permissions granted (${required.length})`;
    }
    return `✗ Missing permissions: ${missing.join(', ')}`;
  }
}
```

**Behavior:**
- Missing permissions → Error (execution blocked)
- Extra permissions → Warning (allowed, over-provisioning)

---

### 3.3 Update IPC Executor
**Update:** `src/executor/ipc-executor.ts`

Add permission validation to execution flow:

```typescript
export class IPCExecutor {
  async executeFile(
    filePath: string,
    options: {
      grantedPermissions?: string[];
      skipPermissionCheck?: boolean;
    }
  ): Promise<ExecutionResult> {
    // Read user code
    const code = await Bun.file(filePath).text();

    // Extract required permissions (AST analysis)
    if (!options.skipPermissionCheck) {
      const extractor = new PermissionExtractor(...);
      const { permissions: required, errors } = extractor.extract(code);

      if (errors.length > 0) {
        return {
          exitCode: 1,
          error: `Permission validation failed:\n${errors.join('\n')}`
        };
      }

      // Compare with granted permissions
      const checker = new PermissionChecker();
      const checkResult = checker.check(required, options.grantedPermissions || []);

      if (!checkResult.allowed) {
        return {
          exitCode: 1,
          error: checkResult.summary
        };
      }

      // Inject runtime with granted permissions
      const injectedCode = this.injectRuntime(code, options.grantedPermissions);
      code = injectedCode;
    }

    // Execute (existing flow)
    // ...
  }
}
```

**Execution stages:**
1. Parse user code → Extract required permissions
2. Validate permissions (import source, type safety)
3. Compare required vs granted
4. Inject runtime object
5. Execute code
6. Host-side validation at IPC boundary

---

### 3.4 Runtime Injection
**New file:** `src/executor/runtime-injector.ts`

Inject runtime initialization into user code:

```typescript
export class RuntimeInjector {
  inject(code: string, grantedPermissions: string[]): string {
    // Prepend runtime setup
    const setup = `
import { createRuntime, type McpRequires } from './servers/_mcpac_runtime.js';
const runtime = createRuntime(${JSON.stringify(grantedPermissions)});
`;

    return setup + '\n' + code;
  }
}
```

**Injection strategy:**
- Prepend to user code (before any imports)
- Create global `runtime` constant
- Pass granted permissions to `createRuntime()`
- User code accesses via `runtime.server.tool()`

**Alternative (for function parameters):**
```typescript
// User code:
async function main(rt: McpRequires<['filesystem.read']>) {
  // ...
}

// Injected:
const runtime = createRuntime(['filesystem.read']);
await main(runtime);
```

---

## Phase 4: IPC Protocol Enhancement

### 4.1 Update Protocol
**Update:** `src/ipc/protocol.ts`

Add permission context to requests:

```typescript
export interface IPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: 'callTool';
  params: {
    server: string;
    tool: string;
    arguments: Record<string, unknown>;
    grantedPermissions?: string[];  // NEW
  };
}

export enum IPCErrorCode {
  ParseError = -32700,
  InvalidRequest = -32600,
  MethodNotFound = -32601,
  InvalidParams = -32602,
  InternalError = -32603,
  PermissionDenied = -32001,  // NEW
}
```

**Permission format:**
- Array of strings: `['filesystem.read_file', 'github.create_issue']`
- Passed with every tool call request
- Validated at IPC boundary

---

### 4.2 Host-Side Permission Check
**Update:** `src/ipc/server.ts`

Add permission validation at IPC layer:

```typescript
export class IPCServer {
  private async handleRequest(request: IPCRequest): Promise<IPCResponse> {
    // Existing validation...

    // NEW: Permission check
    const { server, tool, grantedPermissions } = request.params;
    const permissionId = `${server}.${tool}`;

    if (grantedPermissions && !grantedPermissions.includes(permissionId)) {
      return {
        jsonrpc: '2.0',
        id: request.id,
        error: {
          code: IPCErrorCode.PermissionDenied,
          message: `Permission denied: ${permissionId}`,
          data: {
            required: permissionId,
            granted: grantedPermissions
          }
        }
      };
    }

    // Call MCP tool (existing)
    const result = await this.mcpManager.getClient(server).callTool(tool, arguments);
    // ...
  }
}
```

**Key security feature:**
- **Host-side validation**: Cannot be bypassed by user code
- User code passes granted list with each call
- Server validates `server.tool` is in granted list
- Returns `PERMISSION_DENIED` error if unauthorized

---

## Phase 5: CLI Integration

### 5.1 Execute Command Enhancement
**Update:** `src/commands/execute.ts`

Add permission-related flags:

```typescript
program
  .command('execute')
  .option('-f, --file <path>', 'TypeScript file to execute')
  .option('--grant <permissions>', 'Comma-separated list of permissions')
  .option('--no-permission-check', 'Skip permission validation')
  .option('-v, --verbose', 'Show permission details')
  .action(async (options) => {
    const grantedPermissions = options.grant
      ? options.grant.split(',').map(p => p.trim())
      : [];

    if (options.verbose) {
      console.log(`Granted permissions: ${grantedPermissions.join(', ')}`);
    }

    const executor = new IPCExecutor(...);
    const result = await executor.executeFile(options.file, {
      grantedPermissions,
      skipPermissionCheck: !options.permissionCheck
    });

    if (options.verbose && result.requiredPermissions) {
      console.log(`Required permissions: ${result.requiredPermissions.join(', ')}`);
    }

    // ... handle result
  });
```

**Usage examples:**
```bash
# Grant specific permissions
bun run dev execute -f script.ts --grant filesystem.read_file,filesystem.write_file

# Skip permission check (testing)
bun run dev execute -f script.ts --no-permission-check

# Verbose mode shows permission details
bun run dev execute -f script.ts --grant filesystem.read_file -v
```

---

### 5.2 New Permission Utilities (Optional)
**New command:** `src/commands/permissions.ts`

Add permission analysis commands:

```typescript
// Analyze required permissions
program
  .command('permissions analyze <file>')
  .description('Show required permissions for a TypeScript file')
  .action(async (file) => {
    const code = await Bun.file(file).text();
    const extractor = new PermissionExtractor(...);
    const { permissions, errors } = extractor.extract(code);

    console.log('Required permissions:');
    permissions.forEach(p => console.log(`  - ${p}`));

    if (errors.length > 0) {
      console.error('\nValidation errors:');
      errors.forEach(e => console.error(`  ${e.reason}`));
    }
  });

// Validate permission safety
program
  .command('permissions validate <file>')
  .description('Check if permission declarations are safe')
  .action(async (file) => {
    // Similar to analyze, but focus on security validation
  });
```

---

## Phase 6: Testing

### 6.1 Unit Tests

#### Test: `tests/unit/capability/validator.test.ts`
```typescript
describe('PermissionValidator', () => {
  test('should extract permissions from McpRequires type', () => {
    const code = `
      import type { McpRequires } from './servers/_types';
      function main(rt: McpRequires<['filesystem.read_file']>) {}
    `;
    const validator = new PermissionValidator(code);
    const results = validator.validateFunctions();

    expect(results).toHaveLength(1);
    expect(results[0].permissions).toEqual(['filesystem.read_file']);
    expect(results[0].isValid).toBe(true);
  });

  test('should reject forged local types', () => {
    const code = `
      type McpRequires<T> = any;
      function main(rt: McpRequires<['filesystem.read_file']>) {}
    `;
    const validator = new PermissionValidator(code);
    const results = validator.validateFunctions();

    expect(results[0].isValid).toBe(false);
    expect(results[0].reason).toContain('Local without PickRuntime');
  });

  test('should reject malicious import sources', () => {
    const code = `
      import type { McpRequires } from '@malicious/lib';
      function main(rt: McpRequires<['filesystem.read_file']>) {}
    `;
    const validator = new PermissionValidator(code);
    const results = validator.validateFunctions();

    expect(results[0].isValid).toBe(false);
  });
});
```

#### Test: `tests/unit/capability/authority.test.ts`
```typescript
describe('NamespacedRuntimeAuthority', () => {
  test('should grant nested access to permissions', () => {
    const methods = {
      'filesystem.read_file': async (args) => ({ content: 'test' })
    };
    const authority = new NamespacedRuntimeAuthority(methods);
    const rt = authority.grant('filesystem.read_file');

    expect(rt.filesystem.read_file).toBeDefined();
    expect(typeof rt.filesystem.read_file).toBe('function');
  });

  test('should reject access to ungranted permissions', async () => {
    const methods = {
      'filesystem.read_file': async (args) => ({ content: 'test' }),
      'filesystem.write_file': async (args) => ({ success: true })
    };
    const authority = new NamespacedRuntimeAuthority(methods);
    const rt = authority.grant('filesystem.read_file');

    await expect(rt.filesystem.write_file({ path: '/test', content: 'data' }))
      .rejects.toThrow('Missing permission: filesystem.write_file');
  });

  test('should prevent runtime forgery', () => {
    const authority = new NamespacedRuntimeAuthority({});
    const fakeRuntime = { filesystem: { read_file: async () => {} } };

    expect(authority.verify(fakeRuntime)).toBe(false);
  });
});
```

#### Test: `tests/unit/capability/permission-checker.test.ts`
```typescript
describe('PermissionChecker', () => {
  test('should allow when all permissions granted', () => {
    const checker = new PermissionChecker();
    const result = checker.check(
      ['filesystem.read_file'],
      ['filesystem.read_file', 'github.create_issue']
    );

    expect(result.allowed).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.extra).toEqual(['github.create_issue']);
  });

  test('should block when permissions missing', () => {
    const checker = new PermissionChecker();
    const result = checker.check(
      ['filesystem.read_file', 'filesystem.write_file'],
      ['filesystem.read_file']
    );

    expect(result.allowed).toBe(false);
    expect(result.missing).toEqual(['filesystem.write_file']);
  });
});
```

---

### 6.2 Integration Tests

#### Test: `tests/e2e/capability-execute.test.ts`
```typescript
describe('Capability-based execution', () => {
  beforeEach(async () => {
    // Setup test MCP server
    // Generate code with capability support
  });

  test('should execute with valid permissions', async () => {
    const userCode = `
      import type { McpRequires } from './servers/_types';
      const content = await runtime.filesystem.read_file({ path: '/test.txt' });
      console.log(content);
    `;

    const result = await executeCode(userCode, {
      grantedPermissions: ['filesystem.read_file']
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('test content');
  });

  test('should reject missing permissions at static check', async () => {
    const userCode = `
      import type { McpRequires } from './servers/_types';
      const content = await runtime.filesystem.read_file({ path: '/test.txt' });
    `;

    const result = await executeCode(userCode, {
      grantedPermissions: []
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('Missing permissions');
  });

  test('should reject forged local types', async () => {
    const userCode = `
      type McpRequires<T> = any;
      function main(rt: McpRequires<['filesystem.read_file']>) {}
    `;

    const result = await executeCode(userCode, {
      grantedPermissions: ['filesystem.read_file']
    });

    expect(result.exitCode).toBe(1);
    expect(result.error).toContain('validation failed');
  });

  test('should enforce permissions at IPC boundary', async () => {
    // User tries to bypass static check by direct IPC call
    const userCode = `
      import { IPCClient } from './servers/_mcpac_runtime';
      const client = new IPCClient(process.env.MCPC_IPC_SOCKET);
      await client.callTool('filesystem', 'write_file', {
        path: '/hack.txt',
        content: 'evil'
      });
    `;

    const result = await executeCode(userCode, {
      grantedPermissions: ['filesystem.read_file']  // No write permission
    });

    expect(result.exitCode).not.toBe(0);
    expect(result.error).toContain('Permission denied');
  });
});
```

---

### 6.3 Security Tests

#### Test: `tests/security/forgery-prevention.test.ts`
```typescript
describe('Security: Forgery prevention', () => {
  test('should reject manually crafted runtime objects', async () => {
    const userCode = `
      const fakeRuntime = {
        filesystem: {
          read_file: async () => ({ content: 'hacked' })
        }
      };
      const result = await fakeRuntime.filesystem.read_file({ path: '/secret' });
    `;

    // Should fail at validation or runtime
  });

  test('should prevent permission escalation via prototype pollution', async () => {
    const userCode = `
      Object.prototype.filesystem = {
        write_file: async () => {}
      };
      await runtime.filesystem.write_file({ path: '/evil', content: 'data' });
    `;

    const result = await executeCode(userCode, {
      grantedPermissions: ['filesystem.read_file']
    });

    expect(result.exitCode).not.toBe(0);
  });
});
```

---

## Implementation Order & Timeline

### Week 1: Foundation (Phase 1)
**Days 1-2:** Type system
- Implement `src/capability/types.ts`
- Unit tests for type transformations
- Verify in TypeScript playground

**Days 3-4:** Runtime authority
- Implement `src/capability/authority.ts`
- Unit tests for grant/verify/permission checking
- Test forgery prevention

**Days 5-7:** Permission validator
- Implement `src/capability/validator.ts`
- AST traversal and extraction logic
- Unit tests for all validation scenarios

### Week 2: Code Generation (Phase 2)
**Days 1-3:** Type generation
- Update `src/generator/codegen.ts`
- Generate `_types.ts` with server interface
- Test with real MCP servers

**Days 4-5:** Runtime template
- Update `src/generator/runtime-template.ts`
- Add `createRuntime()` function
- Embed type utilities and authority

**Days 6-7:** Integration
- Update `src/generator/index.ts`
- Test full generation pipeline
- Verify generated code structure

### Week 3: Execution Layer (Phase 3-4)
**Days 1-2:** Permission extraction
- Implement `src/executor/permission-extractor.ts`
- Implement `src/executor/permission-checker.ts`
- Unit tests

**Days 3-4:** Runtime injection
- Implement `src/executor/runtime-injector.ts`
- Test code prepending logic
- Handle edge cases (imports, etc.)

**Days 5-6:** IPC updates
- Update `src/ipc/protocol.ts`
- Update `src/ipc/server.ts` with host-side validation
- Test permission enforcement

**Day 7:** Executor integration
- Update `src/executor/ipc-executor.ts`
- Wire all components together
- Integration testing

### Week 4: CLI & Testing (Phase 5-6)
**Days 1-2:** CLI integration
- Update `src/commands/execute.ts`
- Add `--grant` flag
- Add permission utilities command (optional)

**Days 3-5:** Comprehensive testing
- E2E tests for all scenarios
- Security tests for forgery/escalation
- Performance testing

**Days 6-7:** Documentation & cleanup
- Update README.md, CLAUDE.md, CHANGELOG.md
- Write migration guide
- Code review and refinements

---

## Key Design Decisions & Rationale

### 1. Two-Layer Validation
**Static (pre-execution) + Runtime (IPC boundary)**

Rationale:
- Static: Catch errors early, better DX
- Runtime: Security boundary (user code can be tampered)
- Defense in depth approach

### 2. Permission Format
**`serverName.toolName` (flat strings)**

Rationale:
- Matches existing MCP tool naming
- Easy to parse and compare
- Human-readable in logs/errors
- Simple CLI syntax: `--grant filesystem.read,github.create`

### 3. Default Behavior
**No permissions granted (explicit opt-in)**

Rationale:
- Secure by default principle
- Forces conscious permission grants
- Better for AI-generated code review
- Prevents accidental over-provisioning

### 4. Backward Compatibility
**Breaking change (no v1.x compatibility)**

Rationale:
- Fundamental architecture change
- Old pattern is insecure for capability model
- Clean slate enables better design
- Version 2.0.0 signals breaking change

### 5. Global Runtime Injection
**`const runtime = createRuntime([...])`**

Rationale:
- Simplest UX for user code
- Works with AI code generation
- No manual wiring required
- Consistent with React/Vue patterns

### 6. TypeScript Compiler API
**For AST analysis instead of regex**

Rationale:
- Handles complex TypeScript syntax
- Accurate type extraction
- Resistant to obfuscation attempts
- Official TypeScript support

### 7. Host-Side Validation
**IPC server validates every tool call**

Rationale:
- User code runs in untrusted environment
- Cannot rely on client-side checks alone
- Prevents IPC protocol bypass
- True security boundary

---

## Breaking Changes & Migration

### What Breaks
```typescript
// OLD (v1.x) - Direct imports
import { read_file } from './servers/filesystem';
const result = await read_file({ path: '/data.txt' });

// NEW (v2.0) - Capability runtime
import type { McpRequires } from './servers/_types';
const content = await runtime.filesystem.read_file({ path: '/data.txt' });
```

### Migration Steps
1. Update imports: Remove direct tool imports
2. Add runtime type: `import type { McpRequires }`
3. Update function calls: `tool(args)` → `runtime.server.tool(args)`
4. Add permission grants: `--grant server.tool` to CLI
5. Test thoroughly

### Deprecation Timeline
- v2.0.0-alpha: New system available, old system works
- v2.0.0-beta: Old system deprecated with warnings
- v2.0.0: Old system removed

---

## Documentation Updates Required

### README.md
- Add "Security" section explaining capability model
- Update "Usage" examples with new runtime pattern
- Document `--grant` flag
- Add permission management guide

### CLAUDE.md
- Document new architecture in detail
- Update "Essential Commands" with --grant examples
- Add "Permission System" section
- Update testing patterns for capability tests

### CHANGELOG.md
```markdown
## [2.0.0] - YYYY-MM-DD

### Breaking Changes
- **Capability-based permission system**: All MCP tool access now requires explicit permission grants
- **New runtime API**: Replace direct imports with `runtime.server.tool()` pattern
- **CLI changes**: Add `--grant` flag for permission management

### Added
- Type-safe permission system with `McpRequires<T>` type
- AST-based permission extraction and validation
- Host-side permission enforcement at IPC boundary
- `permissions analyze` command for permission inspection

### Migration Guide
See MIGRATION.md for detailed migration instructions from v1.x to v2.0
```

### New: MIGRATION.md
Complete migration guide with:
- Step-by-step conversion process
- Before/after code examples
- Common pitfalls and solutions
- FAQ section

---

## Success Criteria

### Functional Requirements
- ✅ Type-safe permission declaration via `McpRequires<T>`
- ✅ Static validation catches forged types
- ✅ Runtime validation prevents unauthorized access
- ✅ CLI supports `--grant` flag
- ✅ Clear error messages for permission violations

### Security Requirements
- ✅ Cannot forge runtime objects
- ✅ Cannot bypass permission checks
- ✅ Host-side validation cannot be tampered
- ✅ Import source validation prevents malicious libraries
- ✅ Frozen objects prevent runtime modification

### Developer Experience
- ✅ TypeScript autocomplete shows only granted permissions
- ✅ Compile errors for unauthorized access
- ✅ Clear documentation and examples
- ✅ Migration guide for v1.x users
- ✅ Helpful error messages with permission lists

### Performance
- ✅ AST analysis < 100ms for typical user code
- ✅ No runtime overhead for granted permissions
- ✅ Minimal impact on execution time

---

## Risks & Mitigations

### Risk 1: Complex type system
**Mitigation:**
- Extensive unit tests
- TypeScript playground testing
- Clear documentation with examples

### Risk 2: AST parsing performance
**Mitigation:**
- Cache validation results
- Skip validation with --no-permission-check flag
- Optimize TypeScript Compiler API usage

### Risk 3: Migration burden
**Mitigation:**
- Detailed migration guide
- Deprecation warnings in v2.0.0-beta
- CLI tool to auto-migrate code (future)

### Risk 4: False positives in validation
**Mitigation:**
- Comprehensive test suite
- Allow escape hatch with --no-permission-check
- Collect user feedback in alpha/beta

---

## Future Enhancements

### Post-v2.0.0
1. **Permission profiles**: Predefined permission sets (read-only, admin, etc.)
2. **Auto-grant mode**: Automatically grant all required permissions (dev mode)
3. **Permission audit log**: Track all tool calls with timestamps
4. **Remote permission service**: Centralized permission management
5. **Migration tool**: CLI to auto-convert v1.x code to v2.0
6. **Permission UI**: Web interface for permission management

---

## References

- **POC Repository**: https://github.com/sh1nduu/poc-capability-based-runtime
- **Validation Sample**: https://github.com/sh1nduu/poc-capability-based-runtime/blob/main/idea/validate_with_import_check.ts
- **TypeScript Compiler API**: https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API
- **Capability-based Security**: https://en.wikipedia.org/wiki/Capability-based_security
