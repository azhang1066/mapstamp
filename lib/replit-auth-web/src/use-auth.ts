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

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetch("/api/auth/user", { credentials: "include" })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ user: AuthUser | null }>;
      })
      .then((data) => {
        if (!cancelled) {
          setUser(data.user ?? null);
          setIsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setUser(null);
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(() => {
    const returnTo = window.location.origin + window.location.pathname;
    const url = `${window.location.origin}/api/login?returnTo=${encodeURIComponent(returnTo)}`;
    // Replit's login page refuses to render inside an iframe (e.g. when this
    // app is previewed on the Canvas board), so navigate the top-level
    // window instead of just the current frame. Setting `.location.href` on
    // a cross-origin top window is allowed even though reading it is not.
    try {
      (window.top ?? window).location.href = url;
    } catch {
      window.location.href = url;
    }
  }, []);

  const logout = useCallback(() => {
    const url = `${window.location.origin}/api/logout`;
    try {
      (window.top ?? window).location.href = url;
    } catch {
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
