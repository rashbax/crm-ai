/**
 * Wildberries Marketplace Definition
 */

import type { MarketplaceDefinition } from "../types";

export const wildberriesDefinition: MarketplaceDefinition = {
  id: "wb",
  title: "Wildberries",
  description: "Крупнейший российский маркетплейс",
  logoText: "WB",
  docsUrl: "https://openapi.wildberries.ru/",
  credentialSchema: [
    {
      key: "token",
      label: "API Token",
      type: "password",
      placeholder: "Введите токен API",
      required: true,
      minLength: 10,
      helpText: "Токен можно получить в личном кабинете продавца в разделе API",
    },
  ],
  capabilities: {
    orders: true,
    stocks: true,
    ads: true,
    prices: true,
  },
  connectorId: "wb",
  hints: [
    "Получите токен в разделе Профиль → Настройки → API",
    "Токен должен иметь права на чтение данных",
  ],
};
