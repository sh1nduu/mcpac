/**
 * IPC Protocol Types
 * JSON-RPC 2.0 style protocol for communication between parent process (mcpac execute)
 * and user code process
 */

/**
 * Request from user code to parent process to call an MCP tool
 */
export interface IPCRequest {
  jsonrpc: '2.0';
  id: number | string;
  method: 'callTool';
  params: {
    server: string;
    tool: string;
    arguments: Record<string, unknown>;
  };
}

/**
 * Successful response from parent process to user code
 */
export interface IPCSuccessResponse {
  jsonrpc: '2.0';
  id: number | string;
  result: unknown;
}

/**
 * Error response from parent process to user code
 */
export interface IPCErrorResponse {
  jsonrpc: '2.0';
  id: number | string;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
}

/**
 * Union type for all response types
 */
export type IPCResponse = IPCSuccessResponse | IPCErrorResponse;

/**
 * Error codes following JSON-RPC 2.0 specification
 */
export enum IPCErrorCode {
  PARSE_ERROR = -32700,
  INVALID_REQUEST = -32600,
  METHOD_NOT_FOUND = -32601,
  INVALID_PARAMS = -32602,
  INTERNAL_ERROR = -32603,
  // Custom error codes
  SERVER_NOT_FOUND = -32000,
  TOOL_NOT_FOUND = -32001,
  TOOL_EXECUTION_FAILED = -32002,
  MCP_CONNECTION_ERROR = -32003,
}

/**
 * Type guard to check if response is an error
 */
export function isErrorResponse(response: IPCResponse): response is IPCErrorResponse {
  return 'error' in response;
}

/**
 * Create a success response
 */
export function createSuccessResponse(id: number | string, result: unknown): IPCSuccessResponse {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  id: number | string,
  code: IPCErrorCode,
  message: string,
  data?: unknown,
): IPCErrorResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
      data,
    },
  };
}
