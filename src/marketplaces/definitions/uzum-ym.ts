/**
 * Uzum Marketplace Definition
 */

import type { MarketplaceDefinition } from "../types";

export const uzumDefinition: MarketplaceDefinition = {
  id: "uzum",
  title: "Uzum",
  description: "Ведущий маркетплейс Узбекистана",
  logoText: "UZUM",
  docsUrl: "https://uzum.uz/seller/",
  credentialSchema: [
    {
      key: "token",
      label: "API Token",
      type: "password",
      placeholder: "Введите токен API",
      required: true,
      minLength: 10,
      helpText: "⚠️ Токен используется БЕЗ префикса 'Bearer ' в заголовке Authorization",
    },
  ],
  capabilities: {
    orders: true,
    stocks: true,
    ads: true,
    prices: true,
  },
  connectorId: "uzum",
  hints: [
    "ВАЖНО: Токен отправляется БЕЗ префикса 'Bearer '",
    "Это особенность API Uzum",
  ],
};

/**
 * Yandex Market Marketplace Definition
 */

export const yandexMarketDefinition: MarketplaceDefinition = {
  id: "ym",
  title: "Yandex Market",
  description: "Яндекс Маркет - платформа электронной коммерции",
  logoText: "YM",
  docsUrl: "https://yandex.ru/dev/market/",
  credentialSchema: [
    {
      key: "apiKey",
      label: "API Key (OAuth Token)",
      type: "password",
      placeholder: "Введите OAuth токен",
      required: true,
      minLength: 15,
      helpText: "OAuth токен для доступа к API Яндекс Маркета",
    },
  ],
  capabilities: {
    orders: true,
    stocks: true,
    ads: true,
    prices: true,
  },
  connectorId: "ym",
  hints: [
    "Получите OAuth токен в настройках кампании",
    "Токен должен иметь доступ к данным маркетплейса",
  ],
};
