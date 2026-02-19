/**
 * Schema Validation
 * Validates credentials against marketplace credential schemas
 */

import type { FieldSchema } from "@/src/marketplaces/types";

export interface ValidationResult {
  valid: boolean;
  errors: Record<string, string>;
}

/**
 * Validate credentials against field schema
 */
export function validateCredentials(
  schema: FieldSchema[],
  creds: Record<string, any>
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const field of schema) {
    const value = creds[field.key];

    // Check required
    if (field.required && (!value || String(value).trim() === "")) {
      errors[field.key] = `${field.label} is required`;
      continue;
    }

    // Skip further validation if not required and empty
    if (!value || String(value).trim() === "") {
      continue;
    }

    const strValue = String(value).trim();

    // Check minLength
    if (field.minLength && strValue.length < field.minLength) {
      errors[field.key] = `${field.label} must be at least ${field.minLength} characters`;
      continue;
    }

    // Check pattern
    if (field.pattern) {
      const regex = new RegExp(field.pattern);
      if (!regex.test(strValue)) {
        errors[field.key] = `${field.label} has invalid format`;
        continue;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}
