import { describe, expect, test } from 'bun:test';
import { validateArguments } from '../../src/tools/schema-validator.js';

describe('validateArguments', () => {
  describe('basic type validation', () => {
    test('should validate string type', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const result = validateArguments({ name: 'test' }, schema);
      expect(result.valid).toBe(true);
    });

    test('should reject invalid string type', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
      };

      const result = validateArguments({ name: 123 }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Property '/name' must be of type string");
    });

    test('should validate number type', () => {
      const schema = {
        type: 'object',
        properties: {
          age: { type: 'number' },
        },
      };

      const result = validateArguments({ age: 42 }, schema);
      expect(result.valid).toBe(true);
    });

    test('should validate boolean type', () => {
      const schema = {
        type: 'object',
        properties: {
          enabled: { type: 'boolean' },
        },
      };

      const result = validateArguments({ enabled: true }, schema);
      expect(result.valid).toBe(true);
    });

    test('should validate array type', () => {
      const schema = {
        type: 'object',
        properties: {
          tags: { type: 'array', items: { type: 'string' } },
        },
      };

      const result = validateArguments({ tags: ['tag1', 'tag2'] }, schema);
      expect(result.valid).toBe(true);
    });
  });

  describe('required properties', () => {
    test('should validate required properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number' },
        },
        required: ['name'],
      };

      const result = validateArguments({ name: 'test' }, schema);
      expect(result.valid).toBe(true);
    });

    test('should reject missing required properties', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      };

      const result = validateArguments({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Missing required property: 'name'");
    });
  });

  describe('enum validation', () => {
    test('should validate enum values', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive', 'pending'] },
        },
      };

      const result = validateArguments({ status: 'active' }, schema);
      expect(result.valid).toBe(true);
    });

    test('should reject invalid enum values', () => {
      const schema = {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['active', 'inactive'] },
        },
      };

      const result = validateArguments({ status: 'invalid' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('must be one of');
    });
  });

  describe('numeric constraints', () => {
    test('should validate minimum', () => {
      const schema = {
        type: 'object',
        properties: {
          age: { type: 'number', minimum: 0 },
        },
      };

      const valid = validateArguments({ age: 10 }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validateArguments({ age: -1 }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors?.[0]).toContain('must be >=');
    });

    test('should validate maximum', () => {
      const schema = {
        type: 'object',
        properties: {
          percentage: { type: 'number', maximum: 100 },
        },
      };

      const valid = validateArguments({ percentage: 50 }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validateArguments({ percentage: 101 }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors?.[0]).toContain('must be <=');
    });
  });

  describe('string constraints', () => {
    test('should validate minLength', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 3 },
        },
      };

      const valid = validateArguments({ name: 'test' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validateArguments({ name: 'ab' }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors?.[0]).toContain('must be at least');
    });

    test('should validate maxLength', () => {
      const schema = {
        type: 'object',
        properties: {
          code: { type: 'string', maxLength: 5 },
        },
      };

      const valid = validateArguments({ code: 'ABC12' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validateArguments({ code: 'ABC123' }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors?.[0]).toContain('must be at most');
    });

    test('should validate pattern', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string', pattern: '^[a-z]+@[a-z]+\\.[a-z]+$' },
        },
      };

      const valid = validateArguments({ email: 'test@example.com' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validateArguments({ email: 'invalid-email' }, schema);
      expect(invalid.valid).toBe(false);
      expect(invalid.errors?.[0]).toContain('must match pattern');
    });
  });

  describe('format validation', () => {
    test('should validate email format', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' },
        },
      };

      const valid = validateArguments({ email: 'test@example.com' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validateArguments({ email: 'not-an-email' }, schema);
      expect(invalid.valid).toBe(false);
    });

    test('should validate uri format', () => {
      const schema = {
        type: 'object',
        properties: {
          url: { type: 'string', format: 'uri' },
        },
      };

      const valid = validateArguments({ url: 'https://example.com' }, schema);
      expect(valid.valid).toBe(true);

      const invalid = validateArguments({ url: 'not a url' }, schema);
      expect(invalid.valid).toBe(false);
    });
  });

  describe('additional properties', () => {
    test('should reject additional properties when additionalProperties is false', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
      };

      const result = validateArguments({ name: 'test', extra: 'value' }, schema);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Unknown property');
    });

    test('should allow additional properties when additionalProperties is true', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: true,
      };

      const result = validateArguments({ name: 'test', extra: 'value' }, schema);
      expect(result.valid).toBe(true);
    });
  });

  describe('complex schemas', () => {
    test('should validate nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              age: { type: 'number' },
            },
            required: ['name'],
          },
        },
      };

      const valid = validateArguments(
        {
          user: { name: 'John', age: 30 },
        },
        schema,
      );
      expect(valid.valid).toBe(true);

      const invalid = validateArguments(
        {
          user: { age: 30 },
        },
        schema,
      );
      expect(invalid.valid).toBe(false);
    });

    test('should validate multiple errors', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0 },
        },
        required: ['name', 'age'],
      };

      const result = validateArguments({}, schema);
      expect(result.valid).toBe(false);
      expect(result.errors?.length).toBeGreaterThan(1);
    });
  });

  describe('error handling', () => {
    test('should handle invalid schema', () => {
      const result = validateArguments({ test: 'value' }, null);
      expect(result.valid).toBe(false);
      expect(result.errors?.[0]).toContain('Invalid schema');
    });

    test('should handle empty arguments', () => {
      const schema = {
        type: 'object',
        properties: {},
      };

      const result = validateArguments({}, schema);
      expect(result.valid).toBe(true);
    });
  });
});
