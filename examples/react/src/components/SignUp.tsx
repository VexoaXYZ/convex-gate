import { useState } from "react";
import { Loader2 } from "lucide-react";
import { authClient } from "@/lib/auth-client";

const inputClass =
  "w-full h-11 px-3.5 text-[13px] font-[400] bg-[var(--bg-input)] border border-[var(--border)] rounded-lg text-[var(--text)] placeholder:text-[var(--text-faint)] transition-colors focus:border-[var(--border-light)] focus:bg-[var(--bg-hover)]";

const labelClass =
  "block text-[13px] font-[600] text-[var(--text)] mb-2";

export function SignUp() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { alert("Passwords do not match"); return; }
    setLoading(true);
    try {
      await authClient.signUp.email(
        { email, password, name },
        { onError: (ctx) => alert(ctx.error.message) }
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h2 className="text-[20px] font-[700] text-[var(--text)] mb-1">
        Create Account
      </h2>
      <p className="text-[13px] text-[var(--text-secondary)] mb-6">
        Enter your information to get started.
      </p>

      <form onSubmit={handleSignUp}>
        <div className="mb-4">
          <label className={labelClass}>Full Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Doe"
            required
            className={inputClass}
          />
        </div>

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

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div>
            <label className={labelClass}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 characters"
              required
              minLength={8}
              className={inputClass}
            />
          </div>
          <div>
            <label className={labelClass}>Confirm</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
              minLength={8}
              className={inputClass}
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full h-11 rounded-lg text-[13px] font-[600] bg-[var(--accent)] hover:bg-[var(--accent-hover)] text-black transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center"
        >
          {loading ? <Loader2 size={16} className="animate-spin" /> : "Create Account"}
        </button>
      </form>
    </div>
  );
}
