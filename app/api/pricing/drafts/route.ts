import { requireAuth } from '@/lib/auth-guard';
/**
 * API Route: /api/pricing/drafts
 * GET - List all drafts
 * POST - Create/update draft
 */

import { NextResponse } from "next/server";
import type { PriceDraft, PriceDraftItem } from "@/src/pricing/types";
import fs from "fs/promises";
import path from "path";
import { v4 as uuidv4 } from "uuid";

const DRAFTS_FILE = path.join(process.cwd(), "data", "canonical", "priceDrafts.json");

// Ensure data directory exists
async function ensureDataDir() {
  const dir = path.dirname(DRAFTS_FILE);
  try {
    await fs.access(dir);
  } catch {
    await fs.mkdir(dir, { recursive: true });
  }
}

// Load drafts from file
async function loadDrafts(): Promise<PriceDraft[]> {
  try {
    const data = await fs.readFile(DRAFTS_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return [];
  }
}

// Save drafts to file
async function saveDrafts(drafts: PriceDraft[]): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(DRAFTS_FILE, JSON.stringify(drafts, null, 2));
}

// GET - List all drafts
export async function GET()  {
	const { error } = await requireAuth();
	if (error) return error;
  try {
    const drafts = await loadDrafts();
    return NextResponse.json({ drafts });
  } catch (error) {
    console.error("Error loading drafts:", error);
    return NextResponse.json(
      { error: "Failed to load drafts" },
      { status: 500 }
    );
  }
}

// POST - Create/update draft
export async function POST(request: Request)  {
	const { error } = await requireAuth();
	if (error) return error;
  try {
    const body = await request.json();
    const { draftId, items, action = "upsert" } = body;

    const drafts = await loadDrafts();

    if (action === "remove" && draftId) {
      // Remove draft
      const filtered = drafts.filter((d) => d.id !== draftId);
      await saveDrafts(filtered);
      return NextResponse.json({ ok: true, message: "Draft removed" });
    }

    if (action === "upsert") {
      // Create or update draft
      let draft: PriceDraft;

      if (draftId) {
        // Update existing
        const existing = drafts.find((d) => d.id === draftId);
        if (!existing) {
          return NextResponse.json(
            { error: "Draft not found" },
            { status: 404 }
          );
        }

        draft = {
          ...existing,
          updatedAt: new Date().toISOString(),
          items: items || existing.items,
        };

        const index = drafts.findIndex((d) => d.id === draftId);
        drafts[index] = draft;
      } else {
        // Create new
        draft = {
          id: uuidv4(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          status: "DRAFT",
          items: items || [],
        };

        drafts.push(draft);
      }

      await saveDrafts(drafts);
      return NextResponse.json({ ok: true, draft });
    }

    return NextResponse.json(
      { error: "Invalid action" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error managing draft:", error);
    return NextResponse.json(
      { error: "Failed to manage draft" },
      { status: 500 }
    );
  }
}
