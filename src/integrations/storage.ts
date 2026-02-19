/**
 * Integration Storage Utilities
 * Atomic file operations with locking
 */

import fs from "fs/promises";
import path from "path";

/**
 * Ensure directory exists
 */
export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.access(dirPath);
  } catch {
    await fs.mkdir(dirPath, { recursive: true });
  }
}

/**
 * Read JSON file
 */
export async function readJsonFile<T>(filePath: string, defaultValue: T): Promise<T> {
  try {
    const data = await fs.readFile(filePath, "utf-8");
    return JSON.parse(data);
  } catch {
    return defaultValue;
  }
}

/**
 * Write JSON file atomically
 */
export async function writeJsonFile(filePath: string, data: any): Promise<void> {
  await ensureDir(path.dirname(filePath));

  const tmpPath = `${filePath}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

/**
 * Simple file lock with retry
 */
export async function withLock<T>(
  lockPath: string,
  fn: () => Promise<T>,
  maxRetries: number = 5
): Promise<T> {
  // Ensure lock directory exists before creating lock file.
  await ensureDir(path.dirname(lockPath));

  for (let i = 0; i < maxRetries; i++) {
    try {
      // Try to create lock file
      await fs.writeFile(lockPath, Date.now().toString(), { flag: "wx" });

      try {
        return await fn();
      } finally {
        // Remove lock
        await fs.unlink(lockPath).catch(() => {});
      }
    } catch (error: any) {
      if (error.code === "EEXIST") {
        // Lock exists, wait and retry
        await new Promise((resolve) => setTimeout(resolve, 100 * (i + 1)));
        continue;
      }
      throw error;
    }
  }

  throw new Error("Could not acquire lock");
}

/**
 * Get connection for a marketplace
 */
export async function getConnection(
  filePath: string,
  marketplaceId: string
): Promise<any> {
  const data = await readJsonFile<any>(filePath, { connections: {} });
  return data.connections?.[marketplaceId] || null;
}

/**
 * Save connection for a marketplace
 */
export async function saveConnection(
  filePath: string,
  marketplaceId: string,
  connection: any
): Promise<void> {
  const data = await readJsonFile<any>(filePath, { connections: {} });
  if (!data.connections) {
    data.connections = {};
  }
  data.connections[marketplaceId] = connection;
  await writeJsonFile(filePath, data);
}

/**
 * Get status for a marketplace
 */
export async function getStatus(
  filePath: string,
  marketplaceId: string
): Promise<any> {
  const data = await readJsonFile<any>(filePath, { status: {} });
  return data.status?.[marketplaceId] || null;
}

/**
 * Save status for a marketplace
 */
export async function saveStatus(
  filePath: string,
  marketplaceId: string,
  status: any
): Promise<void> {
  const data = await readJsonFile<any>(filePath, { status: {} });
  if (!data.status) {
    data.status = {};
  }
  data.status[marketplaceId] = status;
  await writeJsonFile(filePath, data);
}

/**
 * Get all connections from storage
 */
export async function getConnections(filePath: string): Promise<any[]> {
  const data = await readJsonFile<any>(filePath, { connections: [] });
  return data.connections || [];
}

/**
 * Save all connections to storage
 */
export async function saveConnections(filePath: string, connections: any[]): Promise<void> {
  await writeJsonFile(filePath, { connections });
}

/**
 * Find connection by ID
 */
export async function findConnectionById(
  filePath: string,
  connectionId: string
): Promise<any | null> {
  const connections = await getConnections(filePath);
  return connections.find((c: any) => c.id === connectionId) || null;
}

/**
 * Update connection by ID
 */
export async function updateConnection(
  filePath: string,
  connectionId: string,
  updates: Partial<any>
): Promise<void> {
  const connections = await getConnections(filePath);
  const index = connections.findIndex((c: any) => c.id === connectionId);
  
  if (index >= 0) {
    connections[index] = { ...connections[index], ...updates, updatedAt: new Date().toISOString() };
    await saveConnections(filePath, connections);
  }
}

/**
 * Remove connection by ID
 */
export async function removeConnection(
  filePath: string,
  connectionId: string
): Promise<void> {
  const connections = await getConnections(filePath);
  const filtered = connections.filter((c: any) => c.id !== connectionId);
  await saveConnections(filePath, filtered);
}
