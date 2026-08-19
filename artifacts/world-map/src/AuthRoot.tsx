import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import UsernameOnboardingModal from "./UsernameOnboardingModal";
import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  SignIn,
  UserProfile,
  useUser,
  useClerk,
  useSignUp,
} from "@clerk/react";
import FavoritesTab from "./FavoritesTab";
import { publishableKeyFromHost } from "@clerk/react/internal";
import { shadcn } from "@clerk/themes";
import { Switch, Route, useLocation, Router as WouterRouter } from "wouter";
import App from "./App";
import type { AuthUser } from "./auth-types";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

if (!clerkPubKey) {
  throw new Error("Missing VITE_CLERK_PUBLISHABLE_KEY in .env file");
}

function clearLocalTravelData() {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("wm_") || key?.startsWith("shortnote:") || key?.startsWith("photos:")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage may be unavailable in restricted browser contexts.
  }
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "#fb923c",
    colorForeground: "#f1f5f9",
    colorMutedForeground: "#94a3b8",
    colorDanger: "#f87171",
    colorBackground: "#0f172a",
    colorInput: "#1e293b",
    colorInputForeground: "#f1f5f9",
    colorNeutral: "#334155",
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, sans-serif",
    borderRadius: "0.75rem",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox:
      "bg-slate-900 border border-slate-700 rounded-2xl w-[440px] max-w-full overflow-hidden",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-slate-100",
    headerSubtitle: "text-slate-400",
    socialButtonsBlockButtonText: "text-slate-100",
    formFieldLabel: "text-slate-300",
    footerActionLink: "text-orange-400 hover:text-orange-300",
    footerActionText: "text-slate-400",
    dividerText: "text-slate-500",
    identityPreviewEditButton: "text-orange-400",
    formFieldSuccessText: "text-emerald-400",
    alertText: "text-red-400",
    logoBox: "flex justify-center py-2",
    logoImage: "h-10 w-10",
    socialButtonsBlockButton: "border-slate-700 hover:bg-slate-800",
    formButtonPrimary: "bg-orange-500 hover:bg-orange-600",
    formFieldInput: "bg-slate-800 border-slate-700 text-slate-100",
    footerAction: "text-slate-400",
    dividerLine: "bg-slate-700",
    alert: "bg-red-950 border-red-800",
    otpCodeFieldInput: "bg-slate-800 border-slate-700 text-slate-100",
    formFieldRow: "",
    main: "",
  },
};

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4">
      <SignIn
        routing="path"
        path={`${basePath}/sign-in`}
        signUpUrl={`${basePath}/sign-up`}
      />
    </div>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  if (open) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-5 w-5"
      >
        <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-7 0-11-8-11-8a20.3 20.3 0 0 1 5.06-5.94M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 11 8 11 8a20.3 20.3 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </svg>
    );
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function extractClerkError(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (
      err as { errors?: Array<{ longMessage?: string; message?: string }> }
    ).errors;
    if (errors && errors[0]) {
      return errors[0].longMessage ?? errors[0].message ?? "Something went wrong.";
    }
  }
  return "Something went wrong. Please try again.";
}

const inputClass =
  "w-full rounded-lg bg-slate-800 border border-slate-700 text-slate-100 placeholder:text-slate-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500";
const labelClass = "text-sm font-medium text-slate-300";
const primaryButtonClass =
  "w-full rounded-lg bg-orange-500 hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-2 text-sm transition-colors";

function SignUpPage() {
  const { signUp } = useSignUp();
  const { setActive } = useClerk();
  const [, setLocation] = useLocation();

  const [step, setStep] = useState<"form" | "verify">("form");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleGoogle() {
    setError(null);
    const { error: ssoError } = await signUp.sso({
      strategy: "oauth_google",
      redirectUrl: `${basePath}/sign-up/sso-callback`,
      redirectCallbackUrl: `${basePath}/sign-up/sso-callback`,
    });
    if (ssoError) {
      setError(extractClerkError(ssoError));
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    const { error: passwordError } = await signUp.password({
      emailAddress: email,
      password,
    });
    if (passwordError) {
      setError(extractClerkError(passwordError));
      setLoading(false);
      return;
    }
    const { error: codeError } = await signUp.verifications.sendEmailCode();
    setLoading(false);
    if (codeError) {
      setError(extractClerkError(codeError));
      return;
    }
    setStep("verify");
  }

  async function handleVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: verifyError } = await signUp.verifications.verifyEmailCode({
      code,
    });
    if (verifyError) {
      setError(extractClerkError(verifyError));
      setLoading(false);
      return;
    }
    if (signUp.status === "complete") {
      const { error: finalizeError } = await signUp.finalize({
        navigate: async () => {
          setLocation("/");
        },
      });
      if (finalizeError) {
        setError(extractClerkError(finalizeError));
      }
    } else {
      setError("Verification incomplete. Please check the code and try again.");
    }
    setLoading(false);
  }

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-[440px] max-w-full overflow-hidden p-8">
        <div className="flex justify-center py-2">
          <img src={`${basePath}/logo.svg`} alt="" className="h-10 w-10" />
        </div>

        {step === "form" ? (
          <>
            <h1 className="text-xl font-bold text-slate-100 text-center mt-2">
              Create your account
            </h1>
            <p className="text-sm text-slate-400 text-center mt-1 mb-6">
              Welcome! Please fill in the details to get started.
            </p>

            <button
              type="button"
              onClick={handleGoogle}
              className="w-full flex items-center justify-center gap-2 rounded-lg border border-slate-700 hover:bg-slate-800 text-slate-100 text-sm font-medium py-2 mb-4 transition-colors"
            >
              Continue with Google
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="h-px bg-slate-700 flex-1" />
              <span className="text-xs text-slate-500">or</span>
              <div className="h-px bg-slate-700 flex-1" />
            </div>

            <form onSubmit={handleCreate} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="signup-email" className={labelClass}>
                  Email address
                </label>
                <input
                  id="signup-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="Enter your email address"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="signup-password" className={labelClass}>
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-10`}
                    placeholder="Enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
                  >
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="signup-confirm-password" className={labelClass}>
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    id="signup-confirm-password"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className={`${inputClass} pr-10`}
                    placeholder="Re-enter your password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={
                      showConfirmPassword ? "Hide password" : "Show password"
                    }
                    className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
                  >
                    <EyeIcon open={showConfirmPassword} />
                  </button>
                </div>
              </div>

              <div id="clerk-captcha" />

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button type="submit" disabled={loading} className={primaryButtonClass}>
                {loading ? "Creating account…" : "Continue"}
              </button>
            </form>

            <p className="text-sm text-slate-400 text-center mt-6">
              Already have an account?{" "}
              <a
                href={`${basePath}/sign-in`}
                className="text-orange-400 hover:text-orange-300 font-medium"
              >
                Sign in
              </a>
            </p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-slate-100 text-center mt-2">
              Verify your email
            </h1>
            <p className="text-sm text-slate-400 text-center mt-1 mb-6">
              Enter the verification code sent to {email}
            </p>

            <form onSubmit={handleVerify} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="signup-code" className={labelClass}>
                  Verification code
                </label>
                <input
                  id="signup-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className={inputClass}
                  placeholder="Enter the code"
                  required
                />
              </div>

              {error && <p className="text-sm text-red-400">{error}</p>}

              <button type="submit" disabled={loading} className={primaryButtonClass}>
                {loading ? "Verifying…" : "Verify"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

function SignUpSSOCallbackPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-4">
      <AuthenticateWithRedirectCallback
        signUpForceRedirectUrl={basePath || "/"}
        signInForceRedirectUrl={basePath || "/"}
      />
    </div>
  );
}

// ─── Legacy localStorage photo migration ──────────────────────────────────────

const _migratedKeys = new Set<string>();

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, b64] = dataUrl.split(",");
  const mimeMatch = header.match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : "image/jpeg";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

async function migrateLocalStoragePhotos(apiBase: string): Promise<void> {
  const photoKeys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith("photos:") && !_migratedKeys.has(k)) photoKeys.push(k);
    }
  } catch { return; }

  for (const key of photoKeys) {
    // key format: photos:<category>:<destinationId>
    const withoutPrefix = key.slice("photos:".length);
    const firstColon = withoutPrefix.indexOf(":");
    if (firstColon === -1) continue;
    const category = withoutPrefix.slice(0, firstColon);
    const destinationId = withoutPrefix.slice(firstColon + 1);

    try {
      const raw = localStorage.getItem(key);
      if (!raw) { _migratedKeys.add(key); localStorage.removeItem(key); continue; }
      const photos = JSON.parse(raw) as Array<{
        id: string;
        base64: string;
        caption: string;
        uploadedAt: number;
      }>;

      let allOk = true;
      for (let pos = 0; pos < photos.length; pos++) {
        const photo = photos[pos];
        if (!photo.base64?.startsWith("data:")) continue;
        try {
          const blob = dataUrlToBlob(photo.base64);
          const fd = new FormData();
          fd.append("file", blob, "photo.jpg");
          fd.append("category", category);
          fd.append("destinationId", destinationId);
          fd.append("position", String(pos));
          fd.append("caption", photo.caption ?? "");
          const resp = await fetch(`${apiBase}/api/photos`, {
            method: "POST",
            body: fd,
            credentials: "include",
          });
          if (!resp.ok) { allOk = false; }
        } catch { allOk = false; }
      }

      if (allOk) {
        _migratedKeys.add(key);
        localStorage.removeItem(key);
      }
    } catch { /* silently skip malformed entries */ }
  }
}

// ─── Server data sync ─────────────────────────────────────────────────────────

type ServerData = Record<string, unknown>;

function applyServerDataToLocalStorage(data: ServerData) {
  const setArr = (key: string, val: unknown) => {
    if (Array.isArray(val) && val.length > 0) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch {}
    }
  };
  const setObj = (key: string, val: unknown) => {
    if (val && typeof val === "object" && Object.keys(val).length > 0) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch {}
    }
  };

  setArr("wm_visited_countries", data.visitedCountries);
  setArr("wm_visited_states", data.visitedStates);
  setArr("wm_visited_provinces", data.visitedProvinces);
  setArr("wm_tcc_visited", data.tccVisited);
  setArr("wm_bucket_countries", data.bucketCountries);
  setArr("wm_bucket_states", data.bucketStates);
  setArr("wm_bucket_provinces", data.bucketProvinces);
  setArr("wm_tcc_bucket", data.tccBucket);
  setObj("wm_details_countries", data.countryDetails);
  setObj("wm_details_states", data.stateDetails);
  setObj("wm_details_provinces", data.provinceDetails);
  setObj("wm_details_tcc", data.tccDetails);

  if (data.notesByKey && typeof data.notesByKey === "object") {
    for (const [k, v] of Object.entries(
      data.notesByKey as Record<string, string>,
    )) {
      try {
        localStorage.setItem(k, v);
      } catch {}
    }
  }
  if (typeof data.profileName === "string" && data.profileName) {
    try {
      localStorage.setItem("wm_profile_name", data.profileName);
    } catch {}
  }
}

type ProfileTab = "profile" | "favorites";

function AppWithSync() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);
  const [needsUsername, setNeedsUsername] = useState(false);
  const [placeholderUsername, setPlaceholderUsername] = useState("");
  // Tracks the confirmed username across the session
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [showUserProfile, setShowUserProfile] = useState(false);
  const [profileTab, setProfileTab] = useState<ProfileTab>("profile");
  const [displayName, setDisplayName] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const [nameSaved, setNameSaved] = useState(false);
  const [profileName, setProfileName] = useState<string | null>(() => localStorage.getItem("wm_profile_name") || null);

  // Username edit state (profile modal)
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameSaving, setUsernameSaving] = useState(false);
  const [usernameSaved, setUsernameSaved] = useState(false);
  const [usernameError, setUsernameError] = useState<string | null>(null);

  // Mirrors backend validation in lib/username.ts — keep in sync if rules change
  const USERNAME_REGEX = /^[a-z0-9_]{3,30}$/;
  const USERNAME_RESERVED = new Set(["me","admin","api","search","leaderboard","compare","connection","connections","profile","user","users","stats","health","photos","map","mapdata","support"]);
  function validateUsernameInput(raw: string): string | null {
    const v = raw.trim().toLowerCase();
    if (!USERNAME_REGEX.test(v)) return "3–30 characters, letters, numbers, and underscores only.";
    if (USERNAME_RESERVED.has(v)) return "That username is reserved. Please choose another.";
    return null;
  }

  // Initialise display name and username input when profile modal opens
  useEffect(() => {
    if (!showUserProfile) return;
    const stored = localStorage.getItem("wm_profile_name") ?? "";
    setDisplayName(stored || user?.firstName || "");
    setNameSaved(false);
    setUsernameSaved(false);
    setUsernameError(null);
    // Load latest username from API each time the modal opens
    if (isSignedIn) {
      fetch(`${basePath}/api/profile/me`, { credentials: "include" })
        .then(r => r.ok ? r.json() : null)
        .then((p: { username: string } | null) => {
          if (p?.username) {
            setCurrentUsername(p.username);
            setUsernameInput(p.username);
          }
        })
        .catch(() => {
          // Non-fatal — input stays pre-filled with last known value
          if (currentUsername) setUsernameInput(currentUsername);
        });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showUserProfile]);

  function saveDisplayName() {
    const trimmed = displayName.trim();
    setNameSaving(true);
    try { localStorage.setItem("wm_profile_name", trimmed); } catch { /* ignore */ }
    setProfileName(trimmed || null);
    setNameSaved(true);
    setNameSaving(false);
    setTimeout(() => setNameSaved(false), 2500);
  }

  async function saveUsername() {
    const normalized = usernameInput.trim().toLowerCase();
    const err = validateUsernameInput(normalized);
    if (err) { setUsernameError(err); return; }
    if (normalized === currentUsername) {
      setUsernameSaved(true);
      setTimeout(() => setUsernameSaved(false), 2500);
      return;
    }
    setUsernameSaving(true);
    setUsernameError(null);
    try {
      const res = await fetch(`${basePath}/api/profile/username`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: normalized }),
      });
      const body = await res.json() as { ok?: boolean; username?: string; error?: string };
      if (res.ok && body.ok && body.username) {
        setCurrentUsername(body.username);
        setUsernameInput(body.username);
        setUsernameSaved(true);
        setTimeout(() => setUsernameSaved(false), 2500);
      } else if (res.status === 409) {
        setUsernameError("That username is already taken. Please choose another.");
      } else {
        setUsernameError(body.error ?? "Failed to save username. Please try again.");
      }
    } catch {
      setUsernameError("Network error. Please try again.");
    } finally {
      setUsernameSaving(false);
    }
  }

  function handleLogout() {
    // Unmount the map before signing out so its debounced sync cannot write
    // stale in-memory data back to the server during the transition.
    clearLocalTravelData();
    setShowUserProfile(false);
    setNeedsUsername(false);
    setReady(false);
    void signOut({ redirectUrl: basePath || "/" }).catch(() => {
      // If sign-out fails, reload the signed-in data from the server.
      setReady(true);
    });
  }

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setReady(true);
      return;
    }
    fetch(`${basePath}/api/map-data`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then(async (envelope: { data: ServerData | null } | null) => {
        if (envelope?.data) applyServerDataToLocalStorage(envelope.data);
        // Migrate any legacy localStorage photos to backend storage (runs once per key).
        await migrateLocalStoragePhotos(basePath).catch(() => {});

        // Check whether the user still has an auto-generated placeholder username.
        // Failure is non-fatal — let the user into the app rather than hard-blocking.
        try {
          const profileRes = await fetch(`${basePath}/api/profile/me`, {
            credentials: "include",
          });
          if (profileRes.ok) {
            const profile = await profileRes.json() as {
              username: string;
              usernameSet: boolean;
            };
            if (!profile.usernameSet) {
              setPlaceholderUsername(profile.username);
              setNeedsUsername(true);
            }
          }
        } catch {
          // Network/server error — skip the prompt this session, retry next load.
        }

        setReady(true);
      })
      .catch(() => setReady(true));
  }, [isLoaded, isSignedIn]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-slate-600 border-t-blue-400 animate-spin" />
          <p className="text-slate-400 text-sm">Loading your travel data…</p>
        </div>
      </div>
    );
  }

  const authUser: AuthUser | null = user
    ? {
        id: user.id,
        firstName: profileName ?? user.firstName,
        profileImageUrl: user.imageUrl ?? null,
      }
    : null;

  // Show the username onboarding modal before the main app renders.
  // We don't render <App> at all while needsUsername is true — the modal
  // is a required step, not an overlay on top of the map.
  if (needsUsername) {
    return (
      <UsernameOnboardingModal
        initialUsername={placeholderUsername}
        apiBase={basePath}
        onComplete={(newUsername) => {
          setNeedsUsername(false);
          setPlaceholderUsername(newUsername);
        }}
      />
    );
  }

  return (
    <>
      <App
        key={isSignedIn ? user?.id ?? "signed-in" : "signed-out"}
        authUser={authUser}
        isAuthenticated={!!isSignedIn}
        onLogin={() => setLocation("/sign-in")}
        onLogout={handleLogout}
        onOpenProfile={() => setShowUserProfile(true)}
      />
      {showUserProfile && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(e) => { if (e.target === e.currentTarget) setShowUserProfile(false); }}
        >
          <div className="relative w-full max-w-5xl max-h-[calc(100vh-2rem)] overflow-y-auto rounded-2xl shadow-2xl flex flex-col bg-[#0f1117]">
            <button
              onClick={() => setShowUserProfile(false)}
              className="absolute top-3 right-3 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors"
              title="Close"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
            </button>

            {/* Tab bar */}
            <div className="flex gap-1 px-6 pt-5 pb-0 border-b border-slate-700/60">
              {(["profile", "favorites"] as ProfileTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setProfileTab(tab)}
                  className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors capitalize ${
                    profileTab === tab
                      ? "bg-slate-800 text-white border border-b-0 border-slate-700"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  {tab === "favorites" ? "⭐ Favorites" : "👤 Profile"}
                </button>
              ))}
            </div>

            {/* Profile tab */}
            {profileTab === "profile" && (
              <>
                {/* Username row */}
                <div className="border-b border-slate-700/60 px-8 py-5 flex items-start gap-6">
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <span className="absolute inset-y-0 left-3 flex items-center text-slate-500 text-sm select-none pointer-events-none">@</span>
                      <input
                        type="text"
                        value={usernameInput}
                        onChange={e => {
                          setUsernameInput(e.target.value.toLowerCase());
                          setUsernameError(null);
                          setUsernameSaved(false);
                        }}
                        onKeyDown={e => { if (e.key === "Enter") void saveUsername(); }}
                        placeholder="your_username"
                        maxLength={30}
                        spellCheck={false}
                        className={`w-full bg-slate-800 border rounded-lg pl-7 pr-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:border-transparent transition-colors ${
                          usernameError
                            ? "border-red-500 focus:ring-red-500"
                            : "border-slate-600 focus:ring-blue-500"
                        }`}
                      />
                    </div>
                    {usernameError ? (
                      <p className="mt-1 text-xs text-red-400">{usernameError}</p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">
                        How other travelers find and connect with you · letters, numbers, underscores
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => void saveUsername()}
                    disabled={usernameSaving || !!validateUsernameInput(usernameInput)}
                    className="shrink-0 mt-6 px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white"
                  >
                    {usernameSaving ? "Saving…" : usernameSaved ? "Saved ✓" : "Save"}
                  </button>
                </div>

                {/* Custom display name row */}
                <div className="border-b border-slate-700/60 px-8 py-5 flex items-center gap-6">
                  <div className="flex-1 min-w-0">
                    <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-1.5">
                      Display name
                    </label>
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => setDisplayName(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") saveDisplayName(); }}
                      placeholder="Enter your name"
                      className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
                    />
                    <p className="mt-1 text-xs text-slate-500">Used on your Stats card and as your profile name</p>
                  </div>
                  <button
                    onClick={saveDisplayName}
                    disabled={nameSaving}
                    className="shrink-0 px-4 py-2 text-sm font-medium rounded-lg transition-colors bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white"
                  >
                    {nameSaving ? "Saving…" : nameSaved ? "Saved ✓" : "Save"}
                  </button>
                </div>
                <UserProfile
                  routing="hash"
                  appearance={{
                    elements: {
                      rootBox: { width: "100%" },
                      card: { width: "100%", maxWidth: "100%", boxShadow: "none", borderRadius: "0 0 1rem 1rem" },
                      navbar: { width: "220px" },
                    },
                  }}
                />
              </>
            )}

            {/* Favorites tab */}
            {profileTab === "favorites" && (
              <FavoritesTab />
            )}
          </div>
        </div>
      )}
    </>
  );
}

function ClerkProviderWithRoutes() {
  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
    >
      <Switch>
        <Route path="/sign-in/*?" component={SignInPage} />
        <Route path="/sign-up/sso-callback" component={SignUpSSOCallbackPage} />
        <Route path="/sign-up/*?" component={SignUpPage} />
        <Route component={AppWithSync} />
      </Switch>
    </ClerkProvider>
  );
}

export default function AuthRoot() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}
