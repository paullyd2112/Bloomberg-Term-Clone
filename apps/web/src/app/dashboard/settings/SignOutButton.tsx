"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function SignOutButton() {
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <button
      onClick={signOut}
      className="bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors"
    >
      Sign out
    </button>
  );
}
