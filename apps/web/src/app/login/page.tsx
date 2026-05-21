import { Suspense } from "react";
import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold tracking-tight text-white">plebs</span>
          <span className="text-2xl font-bold tracking-tight text-green-400">.io</span>
          <p className="mt-2 text-sm text-zinc-400">Sign in to your account</p>
        </div>
        <Suspense fallback={<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 h-64 animate-pulse" />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
