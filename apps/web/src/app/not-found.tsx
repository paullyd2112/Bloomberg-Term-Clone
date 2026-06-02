import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[#09090b] flex flex-col items-center justify-center px-4 text-center gap-4">
      <p className="text-zinc-600 font-mono text-sm">404</p>
      <p className="text-white font-semibold">Page not found</p>
      <Link href="/dashboard" className="text-sm text-green-400 hover:text-green-300 transition-colors">
        Back to dashboard →
      </Link>
    </div>
  );
}
