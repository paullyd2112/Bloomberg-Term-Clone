import { requireAdmin } from "@/lib/admin";
import Link from "next/link";

const NAV = [
  { href: "/admin",        label: "Overview" },
  { href: "/admin/users",  label: "Users" },
  { href: "/admin/codes",  label: "Codes" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();

  return (
    <div className="min-h-screen bg-[#09090b] text-white">
      <header className="border-b border-zinc-800 px-6 h-12 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <span className="font-bold text-sm">
            plebs<span className="text-green-400">.finance</span>
            <span className="text-zinc-600 ml-2">/ admin</span>
          </span>
          <nav className="flex gap-1">
            {NAV.map(({ href, label }) => (
              <Link
                key={href}
                href={href}
                className="text-xs text-zinc-400 hover:text-white px-3 py-1.5 rounded transition-colors hover:bg-zinc-800"
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <Link href="/dashboard" className="text-xs text-zinc-600 hover:text-zinc-400 transition-colors">
          ← Dashboard
        </Link>
      </header>
      <main className="p-6">{children}</main>
    </div>
  );
}
