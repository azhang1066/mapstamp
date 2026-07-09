import { useState, useEffect, useCallback } from "react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

function fetchUser(): Promise<AuthUser | null> {
  return fetch("/api/auth/user", { credentials: "include" })
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ user: AuthUser | null }>;
    })
    .then((data) => data.user ?? null)
    .catch(() => null);
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchUser().then((u) => {
      if (!cancelled) {
        setUser(u);
        setIsLoading(false);
      }
    });

    // Auth completes in a separate tab/window when this app is embedded in
    // an iframe (e.g. previewed on the Canvas board), where Replit's login
    // page refuses to render and top-level navigation is blocked by iframe
    // sandboxing. Re-check auth state whenever this tab regains focus so the
    // app picks up the newly-created session without a manual refresh.
    const onFocus = () => {
      fetchUser().then((u) => {
        if (!cancelled) setUser(u);
      });
    };
    window.addEventListener("focus", onFocus);

    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const login = useCallback(() => {
    const returnTo = window.location.origin + window.location.pathname;
    const url = `${window.location.origin}/api/login?returnTo=${encodeURIComponent(returnTo)}`;
    const popup = window.open(url, "_blank", "noopener=false");
    if (!popup) {
      // Popup blocked; fall back to in-place navigation.
      window.location.href = url;
    }
  }, []);

  const logout = useCallback(() => {
    const url = `${window.location.origin}/api/logout`;
    const popup = window.open(url, "_blank", "noopener=false");
    if (!popup) {
      window.location.href = url;
    }
  }, []);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
