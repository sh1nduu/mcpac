/**
 * JSON Schema validator for tool arguments
 * Uses Ajv for validation with helpful error messages
 */

import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/**
 * Validate arguments against a JSON Schema
 */
export function validateArguments(
  args: Record<string, unknown>,
  schema: unknown,
): ValidationResult {
  // Create Ajv instance with strict mode disabled for compatibility
  const ajv = new Ajv({
    allErrors: true,
    strict: false,
    validateFormats: true,
  });

  // Add format validators (email, url, date-time, etc.)
  addFormats(ajv);

  // Ensure schema is an object
  if (typeof schema !== 'object' || schema === null) {
    return {
      valid: false,
      errors: ['Invalid schema: must be an object'],
    };
  }

  // Compile schema
  let validate: ReturnType<typeof ajv.compile>;
  try {
    validate = ajv.compile(schema);
  } catch (error) {
    return {
      valid: false,
      errors: [
        `Schema compilation failed: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  // Validate arguments
  const valid = validate(args);

  if (valid) {
    return { valid: true };
  }

  // Format error messages
  const errors = formatValidationErrors(validate.errors || []);

  return {
    valid: false,
    errors,
  };
}

/**
 * Format Ajv validation errors into human-readable messages
 */
function formatValidationErrors(errors: ErrorObject[]): string[] {
  return errors.map((error) => {
    const path = error.instancePath || '(root)';

    switch (error.keyword) {
      case 'required':
        return `Missing required property: '${error.params.missingProperty}'`;

      case 'type':
        return `Property '${path}' must be of type ${error.params.type}`;

      case 'enum':
        return `Property '${path}' must be one of: ${error.params.allowedValues.join(', ')}`;

      case 'minimum':
        return `Property '${path}' must be >= ${error.params.limit}`;

      case 'maximum':
        return `Property '${path}' must be <= ${error.params.limit}`;

      case 'minLength':
        return `Property '${path}' must be at least ${error.params.limit} characters`;

      case 'maxLength':
        return `Property '${path}' must be at most ${error.params.limit} characters`;

      case 'pattern':
        return `Property '${path}' must match pattern: ${error.params.pattern}`;

      case 'format':
        return `Property '${path}' must be a valid ${error.params.format}`;

      case 'additionalProperties':
        return `Unknown property: '${error.params.additionalProperty}'`;

      default:
        // Fallback to error message
        return `${path}: ${error.message || 'Validation failed'}`;
    }
  });
}
