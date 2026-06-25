import { Suspense } from "react";
import SignupForm from "./SignupForm";

export default function SignupPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <span className="text-2xl font-bold tracking-tight text-white">plebs</span>
          <span className="text-2xl font-bold tracking-tight text-green-400">.finance</span>
          <p className="mt-2 text-sm text-zinc-400">Start your 14-day free trial</p>
        </div>
        <Suspense fallback={<div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 h-72 animate-pulse" />}>
          <SignupForm />
        </Suspense>
      </div>
    </div>
  );
}
