import Link from "next/link";
import ResetPasswordForm from "./ResetPasswordForm";

export default function ResetPasswordPage() {
  return (
    <div className="relative min-h-screen bg-background flex items-center justify-center px-4 overflow-hidden">
      {/* backdrop */}
      <div className="pointer-events-none absolute inset-0 bg-grid mask-fade opacity-60" />
      <div className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[620px] -translate-x-1/2 rounded-full bg-emerald-500/[0.07] blur-[130px]" />

      <div className="relative w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link
            href="/"
            className="text-2xl font-semibold tracking-tightest text-white"
            aria-label="Plebs home"
          >
            Plebs<span className="text-emerald-400">.</span>
          </Link>
          <p className="mt-3 text-sm text-secondary-foreground">Reset your password</p>
        </div>
        <ResetPasswordForm />
        <p className="mt-6 text-center text-xs text-muted-foreground">
          <Link href="/login" className="text-emerald-400 hover:text-emerald-300 transition-colors">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
