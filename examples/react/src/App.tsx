import { useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Shield, Loader2 } from "lucide-react";
import { SignIn } from "./components/SignIn";
import { SignUp } from "./components/SignUp";
import { Dashboard } from "./components/Dashboard";

export function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-[var(--accent)] flex items-center justify-center">
        <Shield size={14} className="text-black" strokeWidth={2.5} />
      </div>
      <span className="text-[14px] font-[700] text-[var(--text)]">
        Convex Gate
      </span>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <Loader2 size={20} className="text-[var(--accent)] animate-spin" />
    </div>
  );
}

function AuthShell() {
  const [view, setView] = useState<"signin" | "signup">("signin");

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        {/* Brand */}
        <div className="flex justify-center mb-8">
          <BrandMark />
        </div>

        {/* Card */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl overflow-hidden">
          <div className="p-6">
            {view === "signin" ? <SignIn /> : <SignUp />}
          </div>

          {/* Footer */}
          <div className="border-t border-[var(--border)] px-6 py-3.5 flex items-center justify-between">
            <span className="text-[11px] text-[var(--text-faint)]">
              Secured by <span className="text-[var(--accent-muted)]">convex-gate</span>
            </span>
            <button
              onClick={() => setView(view === "signin" ? "signup" : "signin")}
              className="text-[12px] font-[500] text-[var(--text-muted)] hover:text-[var(--text)] transition-colors cursor-pointer"
            >
              {view === "signin" ? "Create account" : "Sign in instead"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <>
      <AuthLoading>
        <LoadingScreen />
      </AuthLoading>
      <Authenticated>
        <Dashboard />
      </Authenticated>
      <Unauthenticated>
        <AuthShell />
      </Unauthenticated>
    </>
  );
}
