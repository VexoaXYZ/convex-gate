import { useEffect, useState } from "react";
import { Authenticated, Unauthenticated, AuthLoading } from "convex/react";
import { Shield, Loader2 } from "lucide-react";
import { SignIn } from "./components/SignIn";
import { SignUp } from "./components/SignUp";
import { Dashboard } from "./components/Dashboard";
import { authClient } from "./lib/auth-client";

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

function isDebugEnabled() {
  if (typeof window === "undefined") {
    return false;
  }
  const url = new URL(window.location.href);
  return (
    url.searchParams.get("debugAuth") === "1" ||
    url.searchParams.has("ott") ||
    window.localStorage.getItem("convex-gate-debug") === "1"
  );
}

function DebugAuthPanel() {
  const [tick, setTick] = useState(0);
  const { data: session, isPending } = authClient.useSession();

  useEffect(() => {
    if (!isDebugEnabled()) {
      return;
    }
    const timer = window.setInterval(() => setTick((value) => value + 1), 500);
    return () => window.clearInterval(timer);
  }, []);

  if (!isDebugEnabled()) {
    return null;
  }

  const url = typeof window === "undefined" ? "" : window.location.href;
  const ott =
    typeof window === "undefined" ? null : new URL(window.location.href).searchParams.get("ott");
  const cookieStore =
    typeof window === "undefined" ? null : window.localStorage.getItem("better-auth_cookie");
  const sessionStore =
    typeof window === "undefined"
      ? null
      : window.localStorage.getItem("better-auth_session_data");
  const events =
    typeof window === "undefined"
      ? []
      : (
          (window as Window & {
            __CONVEX_GATE_DEBUG__?: Array<{
              at: string;
              event: string;
              data?: unknown;
            }>;
          }).__CONVEX_GATE_DEBUG__ ?? []
        ).slice(-12);

  return (
    <div className="fixed left-4 bottom-4 z-50 w-[min(560px,calc(100vw-2rem))] rounded-xl border border-[var(--border)] bg-black/85 text-white shadow-2xl backdrop-blur">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div>
          <p className="text-[12px] font-[700] tracking-[0.12em] uppercase text-[var(--accent)]">
            Auth Debug
          </p>
          <p className="text-[11px] text-white/60">tick {tick}</p>
        </div>
        <button
          onClick={() => {
            window.localStorage.setItem("convex-gate-debug", "0");
            window.location.reload();
          }}
          className="text-[11px] text-white/70 hover:text-white cursor-pointer"
        >
          Hide
        </button>
      </div>
      <div className="space-y-3 px-4 py-3 text-[11px]">
        <pre className="overflow-auto whitespace-pre-wrap text-white/80">url: {url}</pre>
        <pre className="overflow-auto whitespace-pre-wrap text-white/80">ott: {ott ?? "(none)"}</pre>
        <pre className="overflow-auto whitespace-pre-wrap text-white/80">
          useSession: {JSON.stringify({ isPending, session }, null, 2)}
        </pre>
        <pre className="overflow-auto whitespace-pre-wrap text-white/80">
          better-auth_cookie: {cookieStore ?? "(empty)"}
        </pre>
        <pre className="overflow-auto whitespace-pre-wrap text-white/80">
          better-auth_session_data: {sessionStore ?? "(empty)"}
        </pre>
        <pre className="max-h-56 overflow-auto whitespace-pre-wrap text-white/80">
          events: {JSON.stringify(events, null, 2)}
        </pre>
      </div>
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
      <DebugAuthPanel />
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
