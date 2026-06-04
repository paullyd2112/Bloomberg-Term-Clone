import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/user";

const CloseBody = z.object({
  exit_price: z.number().positive(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let user;
  try { user = await requireUser(); } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = CloseBody.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }

  const supabase = createClient();

  // Fetch position to calculate P&L
  const { data: position } = await supabase
    .from("positions")
    .select("entry_price, size, direction, user_id")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .single();

  if (!position) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { exit_price } = parsed.data;
  const entry  = Number(position.entry_price);
  const size   = Number(position.size);
  const isLong = position.direction === "LONG" || position.direction === "YES";
  const pnl    = isLong
    ? (exit_price - entry) * size
    : (entry - exit_price) * size;

  const { data, error } = await supabase
    .from("positions")
    .update({
      exit_price,
      closed_at: new Date().toISOString(),
      pnl:       Math.round(pnl * 100) / 100,
    })
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  let user;
  try { user = await requireUser(); } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("positions")
    .delete()
    .eq("id", params.id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  return NextResponse.json({ deleted: true });
}
