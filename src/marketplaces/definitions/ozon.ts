/**
 * Ozon Marketplace Definition
 */

import type { MarketplaceDefinition } from "../types";

export const ozonDefinition: MarketplaceDefinition = {
  id: "ozon",
  title: "Ozon",
  description: "Один из крупнейших маркетплейсов России",
  logoText: "OZON",
  docsUrl: "https://docs.ozon.ru/api/seller/",
  credentialSchema: [
    {
      key: "clientId",
      label: "Client ID",
      type: "text",
      placeholder: "Введите Client ID",
      required: true,
      pattern: "^[0-9]+$",
      helpText: "Числовой идентификатор клиента",
    },
    {
      key: "apiKey",
      label: "API Key",
      type: "password",
      placeholder: "Введите API ключ",
      required: true,
      minLength: 20,
      helpText: "API ключ для доступа к данным",
    },
  ],
  capabilities: {
    orders: true,
    stocks: true,
    ads: true,
    prices: true,
  },
  connectorId: "ozon",
  hints: [
    "Получите Client ID и API Key в разделе Настройки → API ключи",
    "Client ID и API Key должны быть от одного продавца",
  ],
};
