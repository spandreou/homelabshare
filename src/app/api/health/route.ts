import { NextResponse } from "next/server";
import { db } from "../../../lib/db";

export async function GET() {
  try {
    await db.user.findFirst({
      select: { id: true },
    });
    return NextResponse.json({ status: "healthy" }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Database check failed";
    return NextResponse.json(
      {
        status: "degraded",
        database: "unhealthy",
        message,
      },
      { status: 200 },
    );
  }
}
