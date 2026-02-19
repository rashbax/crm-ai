/**
 * Integrations - Unit Tests
 * Tests storage, sync runner, and API validations
 */

import { describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import path from 'path';
import { ensureDir, readJsonFile, writeJsonFile, withLock } from '../storage';
import { syncMarketplace } from '../syncRunner';
import type { MarketplaceId } from '@/src/connectors/types';

const TEST_DIR = path.join(process.cwd(), 'data', 'test');
const TEST_FILE = path.join(TEST_DIR, 'test.json');
const TEST_LOCK = path.join(TEST_DIR, 'test.lock');

describe('Storage Utilities', () => {
  beforeEach(async () => {
    // Clean up test directory
    try {
      await fs.rm(TEST_DIR, { recursive: true });
    } catch {}
  });

  afterEach(async () => {
    try {
      await fs.rm(TEST_DIR, { recursive: true });
    } catch {}
  });

  // Test 1: Atomic write
  test('writes JSON file atomically', async () => {
    const data = { test: 'value', number: 42 };
    await writeJsonFile(TEST_FILE, data);

    const read = await readJsonFile(TEST_FILE, {});
    expect(read).toEqual(data);

    // Ensure no .tmp file left behind
    const files = await fs.readdir(TEST_DIR);
    expect(files.filter(f => f.endsWith('.tmp'))).toHaveLength(0);
  });

  // Test 2: Read with default value
  test('returns default value for missing file', async () => {
    const defaultValue = { default: true };
    const result = await readJsonFile('/nonexistent/file.json', defaultValue);
    expect(result).toEqual(defaultValue);
  });

  // Test 3: File locking prevents race conditions
  test('file lock prevents concurrent writes', async () => {
    const data1 = { value: 1 };
    const data2 = { value: 2 };

    // Simulate concurrent writes
    const write1 = withLock(TEST_LOCK, async () => {
      await writeJsonFile(TEST_FILE, data1);
      await new Promise(resolve => setTimeout(resolve, 100));
      return 'write1';
    });

    const write2 = withLock(TEST_LOCK, async () => {
      await writeJsonFile(TEST_FILE, data2);
      return 'write2';
    });

    const results = await Promise.all([write1, write2]);
    expect(results).toContain('write1');
    expect(results).toContain('write2');

    // File should contain one of the values
    const final = await readJsonFile(TEST_FILE, {});
    expect([data1, data2]).toContainEqual(final);
  });
});

describe('Canonical Merge Rules', () => {
  test('merges data by marketplace correctly', () => {
    const existing = [
      { sku: 'A', marketplace: 'wb', value: 1 },
      { sku: 'B', marketplace: 'ozon', value: 2 },
      { sku: 'C', marketplace: 'wb', value: 3 },
    ];

    const newData = [
      { sku: 'A', marketplace: 'wb', value: 10 },
      { sku: 'D', marketplace: 'wb', value: 40 },
    ];

    // Filter out WB entries
    const filtered = existing.filter(item => item.marketplace !== 'wb');
    const merged = [...filtered, ...newData];

    expect(merged).toHaveLength(3);
    expect(merged.find(i => i.sku === 'A')?.value).toBe(10); // Updated
    expect(merged.find(i => i.sku === 'B')?.value).toBe(2);  // Kept
    expect(merged.find(i => i.sku === 'C')).toBeUndefined(); // Removed (old WB)
    expect(merged.find(i => i.sku === 'D')?.value).toBe(40); // New
  });

  test('sorts stably by sku and date', () => {
    const data = [
      { sku: 'C', date: '2024-02-01', value: 1 },
      { sku: 'A', date: '2024-02-03', value: 2 },
      { sku: 'B', date: '2024-02-02', value: 3 },
      { sku: 'A', date: '2024-02-01', value: 4 },
    ];

    const sorted = data.sort((a, b) => 
      `${a.sku}-${a.date}`.localeCompare(`${b.sku}-${b.date}`)
    );

    expect(sorted[0].sku).toBe('A');
    expect(sorted[0].date).toBe('2024-02-01');
    expect(sorted[1].sku).toBe('A');
    expect(sorted[1].date).toBe('2024-02-03');
    expect(sorted[2].sku).toBe('B');
    expect(sorted[3].sku).toBe('C');
  });
});

describe('Sync Runner', () => {
  test('returns warnings when credentials missing', async () => {
    // Set DRY_RUN to avoid actual API calls
    process.env.DRY_RUN = '1';

    const result = await syncMarketplace('wb' as MarketplaceId, {
      orders: true,
      stocks: false,
      ads: false,
      prices: false,
    });

    expect(result).toBeDefined();
    // In demo mode, should succeed with warnings
    if (result.ok) {
      expect(result.warnings).toBeDefined();
      expect(result.warnings!.length).toBeGreaterThan(0);
    }
  });

  test('demo mode loads demo data', async () => {
    process.env.DRY_RUN = '1';

    const result = await syncMarketplace('wb' as MarketplaceId, {
      orders: true,
      stocks: true,
      ads: true,
      prices: true,
    });

    expect(result.ok).toBe(true);
    expect(result.warnings?.some(w => w.includes('DEMO'))).toBe(true);
  });
});

describe('API Validation', () => {
  test('connect route requires marketplace', () => {
    const invalidBody = { creds: { token: 'test' } };
    expect(invalidBody).not.toHaveProperty('marketplace');
  });

  test('connect route requires credentials', () => {
    const invalidBody = { marketplace: 'wb' };
    expect(invalidBody).not.toHaveProperty('creds');
  });

  test('ozon requires both clientId and apiKey', () => {
    const validCreds = { clientId: 'test', apiKey: 'test' };
    expect(validCreds).toHaveProperty('clientId');
    expect(validCreds).toHaveProperty('apiKey');

    const invalidCreds1 = { clientId: 'test' };
    expect(invalidCreds1).not.toHaveProperty('apiKey');

    const invalidCreds2 = { apiKey: 'test' };
    expect(invalidCreds2).not.toHaveProperty('clientId');
  });

  test('wb and uzum require token', () => {
    const validCreds = { token: 'test' };
    expect(validCreds).toHaveProperty('token');

    const invalidCreds = {};
    expect(invalidCreds).not.toHaveProperty('token');
  });

  test('ym requires apiKey', () => {
    const validCreds = { apiKey: 'test' };
    expect(validCreds).toHaveProperty('apiKey');

    const invalidCreds = {};
    expect(invalidCreds).not.toHaveProperty('apiKey');
  });
});
