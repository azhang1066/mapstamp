import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import {
  AuthenticateWithRedirectCallback,
  ClerkProvider,
  SignIn,
  useUser,
  useClerk,
  useSignUp,
} from "@clerk/react";
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
                <input
                  id="signup-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Enter your password"
                  required
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label htmlFor="signup-confirm-password" className={labelClass}>
                  Confirm Password
                </label>
                <input
                  id="signup-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={inputClass}
                  placeholder="Re-enter your password"
                  required
                />
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
  setArr("wm_visited_stadiums", data.visitedStadiums);
  setArr("wm_visited_parks", data.visitedParks);
  setArr("wm_tcc_visited", data.tccVisited);
  setArr("wm_bucket_countries", data.bucketCountries);
  setArr("wm_bucket_states", data.bucketStates);
  setArr("wm_bucket_provinces", data.bucketProvinces);
  setArr("wm_bucket_stadiums", data.bucketStadiums);
  setArr("wm_bucket_parks", data.bucketParks);
  setArr("wm_tcc_bucket", data.tccBucket);
  setObj("wm_details_countries", data.countryDetails);
  setObj("wm_details_states", data.stateDetails);
  setObj("wm_details_provinces", data.provinceDetails);
  setObj("wm_details_stadiums", data.stadiumDetails);
  setObj("wm_details_parks", data.parkDetails);
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

function AppWithSync() {
  const { user, isLoaded, isSignedIn } = useUser();
  const { signOut } = useClerk();
  const [, setLocation] = useLocation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn) {
      setReady(true);
      return;
    }
    fetch(`${basePath}/api/map-data`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((envelope: { data: ServerData | null } | null) => {
        if (envelope?.data) applyServerDataToLocalStorage(envelope.data);
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
        firstName: user.firstName,
        profileImageUrl: user.imageUrl ?? null,
      }
    : null;

  return (
    <App
      authUser={authUser}
      isAuthenticated={!!isSignedIn}
      onLogin={() => setLocation("/sign-in")}
      onLogout={() => signOut({ redirectUrl: basePath || "/" })}
    />
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
