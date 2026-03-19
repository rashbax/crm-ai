import { NextResponse } from "next/server";
import { getSystemUsers } from "@/lib/founder-store";

export async function GET() {
  try {
    const users = getSystemUsers();
    return NextResponse.json({ users });
  } catch (error) {
    console.error("Failed to get system users:", error);
    return NextResponse.json({ error: "Failed to load users" }, { status: 500 });
  }
}
