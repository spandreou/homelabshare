import { NextResponse } from "next/server";
import { UserRole } from "@prisma/client";
import { getCurrentUser } from "../../../../lib/auth";
import { collectSystemStats } from "../../../../lib/system-stats";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== UserRole.ADMIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const stats = await collectSystemStats();
    return NextResponse.json(stats, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown system stats API error";
    console.error("api/admin/system-stats failed", { message });
    return NextResponse.json({ error: "System stats unavailable" }, { status: 503 });
  }
}
