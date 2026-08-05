import { useState, useEffect, type FormEvent } from "react";

// Mirrors the backend validation in artifacts/api-server/src/lib/username.ts
const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
const RESERVED = new Set([
  "me", "admin", "api", "search", "leaderboard", "compare",
  "connection", "connections", "profile", "user", "users",
  "stats", "health", "photos", "map", "mapdata", "support",
]);

function validate(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  if (v.length === 0) return null; // empty — no error yet, just disabled
  if (!USERNAME_REGEX.test(v))
    return "3–30 characters, letters, numbers, and underscores only.";
  if (RESERVED.has(v)) return "That username is reserved. Please choose another.";
  return null; // valid
}

const inputClass =
  "w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 transition-colors";

interface Props {
  /** The auto-generated placeholder username pre-filled in the input. */
  initialUsername: string;
  /** The URL prefix used for all API calls (e.g. "/world-map" or ""). */
  apiBase: string;
  /** Called after a successful save — parent can close the modal / mark done. */
  onComplete: (newUsername: string) => void;
}

export default function UsernameOnboardingModal({ initialUsername, apiBase, onComplete }: Props) {
  const [username, setUsername] = useState(initialUsername.toLowerCase());
  const [validationError, setValidationError] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Validate on every keystroke; clear server error when the user edits
  useEffect(() => {
    setValidationError(validate(username));
    setServerError(null);
  }, [username]);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // Normalise to lowercase in real time so users always see what'll be stored
    setUsername(e.target.value.toLowerCase());
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const normalized = username.trim();

    // Belt-and-suspenders: re-validate before submit
    const err = validate(normalized);
    if (err || !normalized) return;

    setSaving(true);
    setServerError(null);

    try {
      const res = await fetch(`${apiBase}/api/profile/username`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalized }),
      });

      const body = await res.json() as { ok?: boolean; username?: string; error?: string; code?: string };

      if (res.ok && body.ok && body.username) {
        onComplete(body.username);
        return;
      }

      if (res.status === 409) {
        setServerError("That username is already taken. Please choose another.");
        return;
      }

      if (res.status === 400) {
        setServerError(body.error ?? "Invalid username. Please check the format and try again.");
        return;
      }

      setServerError("Something went wrong. Please try again.");
    } catch {
      setServerError("Network error. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  const normalized = username.trim();
  const isValid = normalized.length > 0 && validate(normalized) === null;
  const displayedError = serverError ?? (username.length > 0 ? validationError : null);

  return (
    // z-[200] sits above the auth profile modal (z-[200]) and all map overlays
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-800">
          <div className="flex justify-center mb-4">
            {/* Globe icon — intentionally inline so no asset dependency */}
            <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-6 h-6 text-orange-400"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            </div>
          </div>
          <h2 className="text-xl font-bold text-slate-100 text-center">Choose your username</h2>
          <p className="text-sm text-slate-400 text-center mt-1.5 leading-relaxed">
            Your username is how other travelers find and connect with you.
            We've suggested one below — keep it or pick something you like.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="username-input" className="text-sm font-medium text-slate-300">
              Username
            </label>

            <div className="relative">
              {/* @ prefix */}
              <span className="absolute inset-y-0 left-3 flex items-center text-slate-500 text-sm select-none pointer-events-none">
                @
              </span>
              <input
                id="username-input"
                type="text"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={handleChange}
                className={`${inputClass} pl-7 ${displayedError ? "border-red-500 focus:ring-red-500" : isValid ? "border-emerald-600 focus:ring-emerald-500" : ""}`}
                placeholder="your_username"
                maxLength={30}
                spellCheck={false}
                aria-describedby={displayedError ? "username-error" : "username-hint"}
              />
            </div>

            {/* Hint / error */}
            {displayedError ? (
              <p id="username-error" className="text-xs text-red-400" role="alert">
                {displayedError}
              </p>
            ) : (
              <p id="username-hint" className="text-xs text-slate-500">
                Letters, numbers, and underscores · 3–30 characters
              </p>
            )}
          </div>

          {/* Preview */}
          {isValid && !displayedError && (
            <div className="rounded-lg bg-slate-800/60 border border-slate-700 px-4 py-2.5 flex items-center gap-2">
              <span className="text-xs text-slate-500">Your profile will appear as</span>
              <span className="text-sm font-semibold text-orange-400">@{normalized}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={!isValid || saving}
            className="w-full rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2.5 text-sm transition-colors mt-1"
          >
            {saving ? "Saving…" : "Confirm username"}
          </button>

          <p className="text-xs text-slate-500 text-center">
            You can change your username later from your profile settings.
          </p>
        </form>
      </div>
    </div>
  );
}
