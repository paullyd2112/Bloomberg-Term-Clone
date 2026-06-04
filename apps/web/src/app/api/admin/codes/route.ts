import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";

const RATE_LIMIT_PER_HOUR = 20;

function generateCode(): string {
  return randomBytes(6).toString("hex").toUpperCase();
}

export async function POST() {
  let admin: User;
  try {
    admin = await requireAdmin();
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = createAdminClient();

  // Rate limit: max RATE_LIMIT_PER_HOUR codes generated per admin email in the last hour
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase as any)
    .from("redemption_codes")
    .select("id", { count: "exact", head: true })
    .eq("generated_by", admin.email)
    .gte("created_at", oneHourAgo);

  if ((count ?? 0) >= RATE_LIMIT_PER_HOUR) {
    return NextResponse.json(
      { error: `Rate limit: max ${RATE_LIMIT_PER_HOUR} codes per hour` },
      { status: 429 },
    );
  }

  const code = generateCode();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from("redemption_codes")
    .insert({ code, generated_by: admin.email });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ code });
}
