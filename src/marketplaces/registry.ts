/**
 * Marketplace Registry
 * Central registry for all marketplace definitions
 */

import type { MarketplaceDefinition, FieldSchema, ValidationResult } from "./types";
import { wildberriesDefinition } from "./definitions/wb";
import { ozonDefinition } from "./definitions/ozon";
import { uzumDefinition, yandexMarketDefinition } from "./definitions/uzum-ym";

// Registry of all available marketplaces
const marketplaces: Record<string, MarketplaceDefinition> = {
  wb: wildberriesDefinition,
  ozon: ozonDefinition,
  uzum: uzumDefinition,
  ym: yandexMarketDefinition,
};

/**
 * List all registered marketplaces
 */
export function listMarketplaces(): MarketplaceDefinition[] {
  return Object.values(marketplaces);
}

/**
 * Get marketplace definition by ID
 */
export function getMarketplace(id: string): MarketplaceDefinition | null {
  return marketplaces[id] || null;
}

/**
 * Check if marketplace exists
 */
export function hasMarketplace(id: string): boolean {
  return id in marketplaces;
}

/**
 * Validate credentials against schema
 */
export function validateCredentials(
  schema: FieldSchema[],
  creds: Record<string, any>
): ValidationResult {
  const errors: Record<string, string> = {};

  for (const field of schema) {
    const value = creds[field.key];

    // Check required
    if (field.required && (!value || value.trim() === "")) {
      errors[field.key] = `${field.label} обязательно для заполнения`;
      continue;
    }

    if (!value) continue; // Skip validation if not required and empty

    const strValue = String(value).trim();

    // Check minLength
    if (field.minLength && strValue.length < field.minLength) {
      errors[field.key] = `${field.label} должно быть минимум ${field.minLength} символов`;
      continue;
    }

    // Check pattern
    if (field.pattern) {
      const regex = new RegExp(field.pattern);
      if (!regex.test(strValue)) {
        errors[field.key] = `${field.label} имеет неверный формат`;
        continue;
      }
    }
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Get connector ID for marketplace
 */
export function getConnectorId(marketplaceId: string): string | null {
  const marketplace = getMarketplace(marketplaceId);
  return marketplace?.connectorId || null;
}
