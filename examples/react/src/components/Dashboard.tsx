import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { LogOut, Trash2, Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { TodoList } from "./TodoList";
import { BrandMark } from "../App";

export function Dashboard() {
  const user = useQuery(api.auth.getCurrentUser);

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={20} className="text-[var(--accent)] animate-spin" />
      </div>
    );
  }

  const name = (user.name as string) || "User";
  const email = (user.email as string) || "";
  const image = user.image as string | null;
  const initials = name.split(" ").map((w) => w[0]).join("").toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-[var(--border)] bg-[var(--bg-sidebar)]">
        <div className="max-w-[700px] mx-auto px-6 h-14 flex items-center justify-between">
          <BrandMark />
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => {
                if (confirm("Delete your account permanently?")) authClient.deleteUser();
              }}
              className="h-8 px-2.5 rounded-md text-[var(--text-faint)] hover:text-[var(--danger)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <Trash2 size={14} />
            </button>
            <button
              onClick={() => authClient.signOut()}
              className="h-8 px-3 rounded-md text-[12px] font-[500] text-[var(--text-muted)] hover:text-[var(--text)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-[700px] w-full mx-auto px-6 py-8">
        {/* Overview section */}
        <h1 className="text-[22px] font-[700] text-[var(--text)] mb-1">Overview</h1>
        <p className="text-[13px] text-[var(--text-secondary)] mb-6">Your account at a glance.</p>

        {/* Profile card */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5 mb-6">
          <div className="flex items-center gap-4">
            {image ? (
              <img src={image} alt={name} className="w-11 h-11 rounded-full object-cover" />
            ) : (
              <div className="w-11 h-11 rounded-full bg-[var(--bg-input)] border border-[var(--border)] flex items-center justify-center">
                <span className="text-[12px] font-[700] text-[var(--accent)]">{initials}</span>
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-[600] text-[var(--text)] truncate">{name}</p>
              <p className="text-[12px] text-[var(--text-muted)] truncate">{email}</p>
            </div>
            <div className="px-2.5 py-1 rounded-md bg-[var(--green)]/10 border border-[var(--green)]/20">
              <span className="text-[10px] font-[600] text-[var(--green)]">Authenticated</span>
            </div>
          </div>
        </div>

        {/* Tasks section */}
        <div className="bg-[var(--bg-card)] border border-[var(--border)] rounded-xl p-5">
          <TodoList />
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--border)] mt-auto">
        <div className="max-w-[700px] mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-[11px] text-[var(--text-faint)]">
            Secured by <span className="text-[var(--accent-muted)]">convex-gate</span>
          </span>
          <span className="text-[11px] text-[var(--text-faint)]">Better Auth + Convex</span>
        </div>
      </footer>
    </div>
  );
}
