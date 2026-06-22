import { NextResponse } from "next/server";
import { z } from "zod";
import { getUser } from "@/lib/user";
import { createClient } from "@/lib/supabase/server";

const CreateSchema = z.object({
  title: z.string().max(80).optional(),
});

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = createClient();
  const { data } = await supabase
    .from("pleby_conversations")
    .select("id, title, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(30);

  return NextResponse.json(data ?? []);
}

export async function POST(req: Request) {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = CreateSchema.safeParse(await req.json().catch(() => ({})));
  if (!body.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("pleby_conversations")
    .insert({ user_id: user.id, title: body.data.title || "New chat" })
    .select("id, title, created_at, updated_at")
    .single();

  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  return NextResponse.json(data);
}
