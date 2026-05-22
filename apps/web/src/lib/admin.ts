import { redirect } from "next/navigation";
import { getUser } from "@/lib/user";

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export async function requireAdmin() {
  const user = await getUser();
  if (!user) redirect("/login");
  if (!ADMIN_EMAILS.includes(user.email!.toLowerCase())) redirect("/dashboard");
  return user;
}

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
