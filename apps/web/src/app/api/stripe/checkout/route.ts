import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/user";
import { createCheckoutSession, PlanParam } from "@/lib/checkout";

const Body = z.object({
  plan: PlanParam,
  ref:  z.string().max(64).optional(),
});

export async function POST(req: Request) {
  let user;
  try {
    user = await requireUser();
  } catch {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
  }

  const result = await createCheckoutSession({
    userId: user.id,
    email:  user.email!,
    plan:   parsed.data.plan,
    ref:    parsed.data.ref ?? null,
  });

  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ url: result.url });
}
