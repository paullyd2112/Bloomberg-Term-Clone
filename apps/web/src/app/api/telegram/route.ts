import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/user";

const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME ?? "PlebsFinanceBot";

export async function GET() {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { data } = await supabase
    .from("profiles")
    .select("telegram_chat_id")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    connected: !!data?.telegram_chat_id,
  });
}

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));

  if (body.action === "disconnect") {
    const supabase = createClient();
    await supabase
      .from("profiles")
      .update({ telegram_chat_id: null, telegram_link_code: null })
      .eq("id", user.id);
    return NextResponse.json({ ok: true, connected: false });
  }

  const linkCode = randomBytes(16).toString("hex");

  const supabase = createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ telegram_link_code: linkCode })
    .eq("id", user.id);

  if (error) {
    return NextResponse.json({ error: "Failed to generate link" }, { status: 500 });
  }

  const deepLink = `https://t.me/${BOT_USERNAME}?start=${linkCode}`;

  return NextResponse.json({ ok: true, deepLink });
}
