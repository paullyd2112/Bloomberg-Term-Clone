import { NextResponse } from "next/server";
import { getUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const { data: conv } = await supabase
    .from("pleby_conversations")
    .select("id, title, user_id")
    .eq("id", id)
    .single();

  if (!conv || conv.user_id !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: messages } = await supabase
    .from("pleby_messages")
    .select("id, role, content, created_at")
    .eq("conversation_id", id)
    .order("created_at");

  return NextResponse.json({ conversation: conv, messages: messages ?? [] });
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  await supabase.from("pleby_conversations").delete().eq("id", id).eq("user_id", user.id);
  return NextResponse.json({ ok: true });
}
