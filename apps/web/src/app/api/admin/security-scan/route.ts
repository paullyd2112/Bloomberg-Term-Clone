import { NextResponse } from "next/server";
import path from "path";
import { requireAdmin } from "@/lib/admin";
import { runSecurityScan } from "@/lib/security-scanner";

export const dynamic = "force-dynamic";
// Long timeout — Claude + file I/O can take 30–60 s on a large codebase
export const maxDuration = 120;

export async function POST() {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    // Scan from the monorepo root so we catch the data-service and supabase dirs too
    const rootDir = path.resolve(process.cwd(), "../..");
    const report = await runSecurityScan(rootDir);
    return NextResponse.json(report);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Scan failed" },
      { status: 500 },
    );
  }
}
