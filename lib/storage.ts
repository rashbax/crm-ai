"use client";

import type { Language, User, Task } from "@/types";

const LANG_KEY = "rj_lang";
const LOGGED_IN_KEY = "loggedIn";
const LOGGED_USER_KEY = "loggedUser";
const USERNAME_KEY = "crmUsername";
const PASSWORD_KEY = "crmPassword";
const TASKS_KEY = "rj_tasks_v1";
const MARKETPLACE_KEY = "rj_marketplace";

export const storage = {
  // Language
  getLang(): Language {
    if (typeof window === "undefined") return "ru";
    const saved = localStorage.getItem(LANG_KEY);
    return saved === "uz" || saved === "ru" ? saved : "ru";
  },

  setLang(lang: Language): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(LANG_KEY, lang);
  },

  // Authentication
  isLoggedIn(): boolean {
    if (typeof window === "undefined") return false;
    return localStorage.getItem(LOGGED_IN_KEY) === "1";
  },

  setLoggedIn(username: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(LOGGED_IN_KEY, "1");
    localStorage.setItem(LOGGED_USER_KEY, username);
  },

  getLoggedUser(): string {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(LOGGED_USER_KEY) || "";
  },

  logout(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(LOGGED_IN_KEY);
    localStorage.removeItem(LOGGED_USER_KEY);
  },

  // Credentials
  getCredentials(): User {
    if (typeof window === "undefined") {
      return { username: "admin", password: "1234" };
    }
    return {
      username: localStorage.getItem(USERNAME_KEY) || "admin",
      password: localStorage.getItem(PASSWORD_KEY) || "1234",
    };
  },

  setCredentials(username: string, password: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(USERNAME_KEY, username);
    localStorage.setItem(PASSWORD_KEY, password);
  },

  // Tasks
  getTasks(): Task[] {
    if (typeof window === "undefined") return [];
    try {
      const raw = localStorage.getItem(TASKS_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  },

  saveTasks(tasks: Task[]): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
  },

  addTask(task: Omit<Task, "id" | "createdAt">): Task {
    const tasks = this.getTasks();
    const newTask: Task = {
      ...task,
      id: String(Date.now()),
      createdAt: new Date().toISOString(),
    };
    tasks.push(newTask);
    this.saveTasks(tasks);
    return newTask;
  },

  deleteTask(id: string): void {
    const tasks = this.getTasks().filter((t) => t.id !== id);
    this.saveTasks(tasks);
  },

  // Marketplace selector
  getMarketplace(): string {
    if (typeof window === "undefined") return "all";
    return localStorage.getItem(MARKETPLACE_KEY) || "all";
  },

  setMarketplace(id: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(MARKETPLACE_KEY, id);
  },
};
