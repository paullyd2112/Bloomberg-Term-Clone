import { createAdminClient } from "@/lib/supabase/admin";
import GenerateCodeButton from "./GenerateCodeButton";

export const revalidate = 0;

type Code = {
  id: number;
  code: string;
  redeemed_by: string | null;
  redeemed_at: string | null;
  created_at: string;
};

async function getCodes(): Promise<Code[]> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("redemption_codes")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  return (data as Code[]) ?? [];
}

export default async function AdminCodesPage() {
  const codes = await getCodes();
  const available = codes.filter((c) => !c.redeemed_by).length;

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold text-white">
          Redemption codes{" "}
          <span className="text-zinc-600 text-sm font-normal">
            ({available} available / {codes.length} total)
          </span>
        </h1>
        <GenerateCodeButton />
      </div>

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        {codes.length === 0 ? (
          <div className="p-6 text-center text-zinc-500 text-sm">No codes yet.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800">
                {["Code", "Status", "Created"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id} className="border-b border-zinc-800/60">
                  <td className="px-4 py-3 font-mono text-xs text-zinc-200">{c.code}</td>
                  <td className="px-4 py-3 text-xs">
                    {c.redeemed_by ? (
                      <span className="text-zinc-500">
                        Redeemed {c.redeemed_at ? new Date(c.redeemed_at).toLocaleDateString() : ""}
                      </span>
                    ) : (
                      <span className="text-green-400">Available</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-zinc-500 text-xs">
                    {new Date(c.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
