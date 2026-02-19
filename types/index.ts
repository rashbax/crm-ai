export type Language = "uz" | "ru";

export interface User {
  username: string;
  password: string;
}

export interface Task {
  id: string;
  title: string;
  ref?: string;
  due?: string;
  notes?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  date: string;
  marketplace: string;
  customer: string;
  items: string;
  amount: number;
  status: "new" | "processing" | "shipped" | "cancelled";
}

export interface Product {
  id: string;
  name: string;
  article: string;
  sku: string;
  price: number;
  stock: number;
  status: "active" | "draft" | "blocked";
}

export interface Translations {
  [key: string]: {
    [key: string]: string;
  };
}
