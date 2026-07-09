import { useEffect, useState } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import type { AuthUser } from "@workspace/replit-auth-web";
import App from "./App";

type ServerData = Record<string, unknown>;

function applyServerDataToLocalStorage(data: ServerData) {
  const setArr = (key: string, val: unknown) => {
    if (Array.isArray(val) && val.length > 0) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
    }
  };
  const setObj = (key: string, val: unknown) => {
    if (val && typeof val === "object" && Object.keys(val).length > 0) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
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
    for (const [k, v] of Object.entries(data.notesByKey as Record<string, string>)) {
      try { localStorage.setItem(k, v); } catch {}
    }
  }
  if (typeof data.profileName === "string" && data.profileName) {
    try { localStorage.setItem("wm_profile_name", data.profileName); } catch {}
  }
}

export interface AuthProps {
  authUser: AuthUser | null;
  isAuthenticated: boolean;
  onLogin: () => void;
  onLogout: () => void;
}

export default function SyncGate() {
  const { user, isLoading, isAuthenticated, login, logout } = useAuth();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isLoading) return;
    if (!isAuthenticated) {
      setReady(true);
      return;
    }
    fetch("/api/map-data", { credentials: "include" })
      .then(r => (r.ok ? r.json() : null))
      .then((envelope: { data: ServerData | null } | null) => {
        if (envelope?.data) applyServerDataToLocalStorage(envelope.data);
        setReady(true);
      })
      .catch(() => setReady(true));
  }, [isLoading, isAuthenticated]);

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

  return (
    <App
      authUser={user ?? null}
      isAuthenticated={isAuthenticated}
      onLogin={login}
      onLogout={logout}
    />
  );
}
