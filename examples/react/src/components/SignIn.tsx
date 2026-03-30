import { useState } from "react";
import { Loader2, Github, Mail, MessageCircle, User } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const inputClass =
  "w-full h-11 px-3.5 text-[13px] font-[400] bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--text-faint)] transition-colors focus:border-[var(--border-light)] focus:bg-[var(--bg-hover)]";

const labelClass =
  "block text-[13px] font-[600] text-[var(--text)] mb-2";

export function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [socialLoading, setSocialLoading] = useState<string | null>(null);
  const [anonLoading, setAnonLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authClient.signIn.email(
        { email, password },
        { onError: (ctx) => alert(ctx.error.message) }
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSocial = async (provider: "discord" | "github" | "google") => {
    setSocialLoading(provider);
    try {
      const callbackURL =
        typeof window !== "undefined"
          ? new URL(window.location.href).toString()
          : import.meta.env.VITE_SITE_URL || "/";
      await authClient.signIn.social(
        {
          provider,
          callbackURL,
          errorCallbackURL: callbackURL,
        },
        { onError: (ctx) => alert(ctx.error.message) }
      );
    } finally {
      setSocialLoading(null);
    }
  };

  return (
    <div>
      <h2 className="text-[20px] font-[700] text-[var(--text)] mb-1">
        Sign In
      </h2>
      <p className="text-[13px] text-[var(--text-secondary)] mb-6">
        Enter your credentials to continue.
      </p>

      <form onSubmit={handleSignIn}>
        <div className="mb-4">
          <label className={labelClass}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            required
            className={inputClass}
          />
        </div>

        <div className="mb-6">
          <label className={labelClass}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            className={inputClass}
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-lg text-[13px] font-[600] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : "Sign In"}
        </button>
      </form>

      {/* Divider */}
      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 h-px bg-[var(--border)]" />
        <span className="text-[11px] font-[500] text-[var(--text-faint)] uppercase">or</span>
        <div className="flex-1 h-px bg-[var(--border)]" />
      </div>

      {/* Social */}
      <div className="grid grid-cols-3 gap-2.5">
        <button
          type="button"
          onClick={() => handleSocial("discord")}
          disabled={socialLoading !== null}
          className="h-10 rounded-lg text-[12px] font-[500] text-[var(--text-secondary)] bg-[var(--bg-input)] border border-[var(--border)] flex items-center justify-center gap-2 transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-50 cursor-pointer"
        >
          {socialLoading === "discord" ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
          Discord
        </button>
        <button
          type="button"
          onClick={() => handleSocial("github")}
          disabled={socialLoading !== null}
          className="h-10 rounded-lg text-[12px] font-[500] text-[var(--text-secondary)] bg-[var(--bg-input)] border border-[var(--border)] flex items-center justify-center gap-2 transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-50 cursor-pointer"
        >
          {socialLoading === "github" ? <Loader2 size={14} className="animate-spin" /> : <Github size={14} />}
          GitHub
        </button>
        <button
          type="button"
          onClick={() => handleSocial("google")}
          disabled={socialLoading !== null}
          className="h-10 rounded-lg text-[12px] font-[500] text-[var(--text-secondary)] bg-[var(--bg-input)] border border-[var(--border)] flex items-center justify-center gap-2 transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--text)] disabled:opacity-50 cursor-pointer"
        >
          {socialLoading === "google" ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
          Google
        </button>
      </div>

      {/* Guest */}
      <button
        type="button"
        onClick={async () => {
          setAnonLoading(true);
          try { await (authClient as any).signIn.anonymous(); }
          finally { setAnonLoading(false); }
        }}
        disabled={anonLoading}
        className="w-full mt-2.5 h-10 rounded-lg text-[12px] font-[500] text-[var(--text-muted)] flex items-center justify-center gap-2 transition-colors hover:bg-[var(--bg-input)] hover:text-[var(--text-secondary)] disabled:opacity-50 cursor-pointer"
      >
        {anonLoading ? <Loader2 size={14} className="animate-spin" /> : <User size={14} />}
        Continue as guest
      </button>
    </div>
  );
}
