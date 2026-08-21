import { useState, useEffect, useRef } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useSearchUsers,
  useListConnections,
  useRequestConnection,
  useAcceptConnection,
  useDeclineConnection,
  useDeleteConnection,
  getListConnectionsQueryKey,
  getSearchUsersQueryKey,
} from "@workspace/api-client-react";
import type {
  ConnectionRecord,
  ConnectionsResponse,
  UserSearchEntry,
} from "@workspace/api-client-react";

// ── Shared fetch options so session cookies are always sent ──────────────────
const REQ = { credentials: "include" as const };

type Tab = "search" | "pending" | "connections";

interface Props {
  onClose: () => void;
  showToast: (message: string, kind: "success" | "warning") => void;
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function Avatar({ username, displayName }: { username: string | null; displayName?: string | null }) {
  const letter = (displayName ?? username ?? "?")[0]?.toUpperCase() ?? "?";
  return (
    <div className="w-9 h-9 rounded-full bg-slate-700 flex items-center justify-center text-sm font-semibold text-slate-300 shrink-0">
      {letter}
    </div>
  );
}

function UserLabel({ username, displayName }: { username: string | null; displayName?: string | null }) {
  return (
    <div className="min-w-0">
      {displayName && (
        <p className="text-sm font-medium text-slate-100 truncate">{displayName}</p>
      )}
      <p className={`text-xs truncate ${displayName ? "text-slate-400" : "text-sm text-slate-100"}`}>
        @{username ?? "unknown"}
      </p>
    </div>
  );
}

function Spinner() {
  return (
    <div className="w-5 h-5 rounded-full border-2 border-slate-600 border-t-slate-300 animate-spin" />
  );
}

// ── Search tab ────────────────────────────────────────────────────────────────

interface SearchTabProps {
  connectionsData: ConnectionsResponse | undefined;
  showToast: Props["showToast"];
}

function SearchTab({ connectionsData, showToast }: SearchTabProps) {
  const qc = useQueryClient();
  const [rawQuery, setRawQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(rawQuery.trim().toLowerCase());
    }, 350);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [rawQuery]);

  const enabled = debouncedQuery.length >= 2;
  const { data: searchData, isFetching } = useSearchUsers(
    { q: debouncedQuery },
    {
      query: {
        queryKey: getSearchUsersQueryKey({ q: debouncedQuery }),
        enabled,
      },
      request: REQ,
    },
  );

  // Build a map of known connections keyed by otherUser.userId
  const relationshipMap = new Map<string, { id: string; status: string; direction: string }>();
  if (connectionsData) {
    for (const c of connectionsData.pending.incoming) {
      if (c.otherUser?.userId) relationshipMap.set(c.otherUser.userId, { id: c.id, status: "pending", direction: "incoming" });
    }
    for (const c of connectionsData.pending.outgoing) {
      if (c.otherUser?.userId) relationshipMap.set(c.otherUser.userId, { id: c.id, status: "pending", direction: "outgoing" });
    }
    for (const c of connectionsData.accepted) {
      if (c.otherUser?.userId) relationshipMap.set(c.otherUser.userId, { id: c.id, status: "accepted", direction: "accepted" });
    }
  }

  const requestMutation = useRequestConnection({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
        void qc.invalidateQueries({ queryKey: getSearchUsersQueryKey({ q: debouncedQuery }) });
        showToast("Connection request sent!", "success");
      },
      onError: () => showToast("Failed to send connection request.", "warning"),
    },
    request: REQ,
  });

  const deleteMutation = useDeleteConnection({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
        showToast("Request cancelled.", "success");
      },
      onError: () => showToast("Failed to cancel request.", "warning"),
    },
    request: REQ,
  });

  function renderRelationship(user: UserSearchEntry) {
    const rel = relationshipMap.get(user.userId);

    if (!rel) {
      return (
        <button
          onClick={() => requestMutation.mutate({ userId: user.userId })}
          disabled={requestMutation.isPending}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white transition-colors"
        >
          Connect
        </button>
      );
    }

    if (rel.status === "accepted") {
      return (
        <span className="shrink-0 text-xs text-emerald-400 font-medium px-3 py-1.5">
          ✓ Connected
        </span>
      );
    }

    if (rel.direction === "outgoing") {
      return (
        <button
          onClick={() => deleteMutation.mutate({ connectionId: rel.id })}
          disabled={deleteMutation.isPending}
          className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-rose-700 disabled:opacity-50 text-slate-300 hover:text-white transition-colors"
          title="Cancel request"
        >
          Pending · Cancel
        </button>
      );
    }

    // incoming
    return (
      <span className="shrink-0 text-xs text-amber-400 font-medium px-3 py-1.5">
        Wants to connect
      </span>
    );
  }

  const users = searchData?.users ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Search input */}
      <div className="relative">
        <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="text-slate-400">
            <circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M9.5 9.5l3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </span>
        <input
          type="text"
          autoFocus
          value={rawQuery}
          onChange={e => setRawQuery(e.target.value)}
          placeholder="Search by username or display name…"
          className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-colors"
        />
        {isFetching && (
          <span className="absolute inset-y-0 right-3 flex items-center">
            <Spinner />
          </span>
        )}
      </div>

      {/* Results */}
      {!enabled ? (
        <p className="text-sm text-slate-500 text-center py-6">Type at least 2 characters to search.</p>
      ) : users.length === 0 && !isFetching ? (
        <p className="text-sm text-slate-500 text-center py-6">No users found for "<span className="text-slate-400">{debouncedQuery}</span>".</p>
      ) : (
        <ul className="flex flex-col divide-y divide-slate-800">
          {users.map(user => (
            <li key={user.userId} className="flex items-center gap-3 py-3">
              <Avatar username={user.username} displayName={user.displayName} />
              <UserLabel username={user.username} displayName={user.displayName} />
              <div className="ml-auto">{renderRelationship(user)}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Pending tab ───────────────────────────────────────────────────────────────

interface PendingTabProps {
  data: ConnectionsResponse | undefined;
  isLoading: boolean;
  showToast: Props["showToast"];
}

function PendingTab({ data, isLoading, showToast }: PendingTabProps) {
  const qc = useQueryClient();

  const acceptMutation = useAcceptConnection({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
        showToast("Connection accepted!", "success");
      },
      onError: () => showToast("Failed to accept connection.", "warning"),
    },
    request: REQ,
  });

  const declineMutation = useDeclineConnection({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
        showToast("Request declined.", "success");
      },
      onError: () => showToast("Failed to decline request.", "warning"),
    },
    request: REQ,
  });

  const cancelMutation = useDeleteConnection({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
        showToast("Request cancelled.", "success");
      },
      onError: () => showToast("Failed to cancel request.", "warning"),
    },
    request: REQ,
  });

  if (isLoading) {
    return <div className="flex justify-center py-10"><Spinner /></div>;
  }

  const incoming = data?.pending.incoming ?? [];
  const outgoing = data?.pending.outgoing ?? [];

  if (incoming.length === 0 && outgoing.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-10">No pending requests.</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {incoming.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Incoming ({incoming.length})
          </h3>
          <ul className="flex flex-col divide-y divide-slate-800">
            {incoming.map((c: ConnectionRecord) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <Avatar username={c.otherUser?.username ?? null} displayName={c.otherUser?.displayName} />
                <UserLabel username={c.otherUser?.username ?? null} displayName={c.otherUser?.displayName} />
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => acceptMutation.mutate({ connectionId: c.id })}
                    disabled={acceptMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-teal-700 hover:bg-teal-600 disabled:opacity-50 text-white transition-colors"
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => declineMutation.mutate({ connectionId: c.id })}
                    disabled={declineMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-slate-300 hover:text-white transition-colors"
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {outgoing.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Sent ({outgoing.length})
          </h3>
          <ul className="flex flex-col divide-y divide-slate-800">
            {outgoing.map((c: ConnectionRecord) => (
              <li key={c.id} className="flex items-center gap-3 py-3">
                <Avatar username={c.otherUser?.username ?? null} displayName={c.otherUser?.displayName} />
                <UserLabel username={c.otherUser?.username ?? null} displayName={c.otherUser?.displayName} />
                <div className="ml-auto flex items-center gap-2">
                  <span className="text-xs text-amber-400 font-medium">Pending</span>
                  <button
                    onClick={() => cancelMutation.mutate({ connectionId: c.id })}
                    disabled={cancelMutation.isPending}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-rose-700 disabled:opacity-50 text-slate-300 hover:text-white transition-colors"
                    title="Cancel request"
                  >
                    Cancel
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

// ── Connections tab ───────────────────────────────────────────────────────────

interface ConnectionsTabProps {
  data: ConnectionsResponse | undefined;
  isLoading: boolean;
  showToast: Props["showToast"];
}

function ConnectionsTab({ data, isLoading, showToast }: ConnectionsTabProps) {
  const qc = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const removeMutation = useDeleteConnection({
    mutation: {
      onSuccess: () => {
        void qc.invalidateQueries({ queryKey: getListConnectionsQueryKey() });
        setConfirmId(null);
        showToast("Connection removed.", "success");
      },
      onError: () => {
        setConfirmId(null);
        showToast("Failed to remove connection.", "warning");
      },
    },
    request: REQ,
  });

  if (isLoading) {
    return <div className="flex justify-center py-10"><Spinner /></div>;
  }

  const accepted = data?.accepted ?? [];

  if (accepted.length === 0) {
    return (
      <div className="text-center py-10">
        <p className="text-sm text-slate-500">No connections yet.</p>
        <p className="text-xs text-slate-600 mt-1">Search for travelers to connect with.</p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col divide-y divide-slate-800">
      {accepted.map((c: ConnectionRecord) => (
        <li key={c.id} className="flex items-center gap-3 py-3">
          <Avatar username={c.otherUser?.username ?? null} displayName={c.otherUser?.displayName} />
          <UserLabel username={c.otherUser?.username ?? null} displayName={c.otherUser?.displayName} />
          <div className="ml-auto flex items-center gap-2">
            {confirmId === c.id ? (
              <>
                <span className="text-xs text-slate-400">Remove?</span>
                <button
                  onClick={() => removeMutation.mutate({ connectionId: c.id })}
                  disabled={removeMutation.isPending}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-700 hover:bg-rose-600 disabled:opacity-50 text-white transition-colors"
                >
                  {removeMutation.isPending ? "Removing…" : "Confirm"}
                </button>
                <button
                  onClick={() => setConfirmId(null)}
                  disabled={removeMutation.isPending}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                >
                  Keep
                </button>
              </>
            ) : (
              <button
                onClick={() => setConfirmId(c.id)}
                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-white transition-colors"
              >
                Remove
              </button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

const TAB_ORDER: Tab[] = ["search", "pending", "connections"];

const TITLE_ID = "connections-panel-title";
const tabId = (t: Tab) => `connections-tab-${t}`;
const panelId = (t: Tab) => `connections-tabpanel-${t}`;

// Selector for focusable elements used by the focus trap.
const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

export default function ConnectionsPanel({ onClose, showToast }: Props) {
  const [tab, setTab] = useState<Tab>("search");

  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const tabRefs = useRef<Record<Tab, HTMLButtonElement | null>>({
    search: null,
    pending: null,
    connections: null,
  });

  const { data, isLoading } = useListConnections<ConnectionsResponse>({
    query: {
      queryKey: getListConnectionsQueryKey(),
      staleTime: 20_000,
    },
    request: REQ,
  });

  const incomingCount = data?.pending.incoming.length ?? 0;
  const acceptedCount = data?.accepted.length ?? 0;

  // Tab definitions
  const tabs: { id: Tab; label: string; badge?: number }[] = [
    { id: "search", label: "Search" },
    { id: "pending", label: "Pending", badge: incomingCount },
    { id: "connections", label: "Connections", badge: acceptedCount > 0 ? acceptedCount : undefined },
  ];

  // Move initial focus to the close control when the dialog mounts.
  useEffect(() => {
    closeButtonRef.current?.focus();
  }, []);

  // Close on Escape + robust Tab/Shift+Tab focus trap (no background escape).
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter(el => el.offsetParent !== null || el === document.activeElement);

      if (focusable.length === 0) {
        e.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement as HTMLElement | null;

      if (e.shiftKey) {
        if (active === first || !dialog.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last || !dialog.contains(active)) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onClose]);

  // Arrow-left/right + Home/End keyboard navigation for the tablist.
  function handleTabKeyDown(e: ReactKeyboardEvent<HTMLButtonElement>) {
    const currentIndex = TAB_ORDER.indexOf(tab);
    let nextIndex: number | null = null;

    switch (e.key) {
      case "ArrowRight":
        nextIndex = (currentIndex + 1) % TAB_ORDER.length;
        break;
      case "ArrowLeft":
        nextIndex = (currentIndex - 1 + TAB_ORDER.length) % TAB_ORDER.length;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = TAB_ORDER.length - 1;
        break;
      default:
        return;
    }

    e.preventDefault();
    const nextTab = TAB_ORDER[nextIndex];
    setTab(nextTab);
    tabRefs.current[nextTab]?.focus();
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="min-h-full max-w-2xl mx-auto p-6 md:p-10"
        onClick={e => e.stopPropagation()}
      >
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={TITLE_ID}
          tabIndex={-1}
          className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl focus:outline-none"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 md:px-8 py-5 border-b border-slate-800 sticky top-6 md:top-10 bg-slate-900/95 backdrop-blur-sm rounded-t-2xl z-10">
            <div>
              <h2 id={TITLE_ID} className="text-xl font-bold text-white">Connections</h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Search for travelers, manage requests
              </p>
            </div>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              title="Close"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1l12 12M13 1L1 13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </button>
          </div>

          {/* Tab bar */}
          <div
            role="tablist"
            aria-label="Connections views"
            className="flex gap-1 px-6 md:px-8 pt-4 border-b border-slate-800"
          >
            {tabs.map(t => {
              const selected = tab === t.id;
              return (
                <button
                  key={t.id}
                  ref={el => { tabRefs.current[t.id] = el; }}
                  id={tabId(t.id)}
                  role="tab"
                  type="button"
                  aria-selected={selected}
                  aria-controls={panelId(t.id)}
                  tabIndex={selected ? 0 : -1}
                  data-testid={`connections-tab-${t.id}`}
                  onClick={() => setTab(t.id)}
                  onKeyDown={handleTabKeyDown}
                  className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    selected
                      ? "bg-slate-800 text-white border border-b-0 border-slate-700"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-800/50"
                  }`}
                >
                  {t.label}
                  {t.badge != null && t.badge > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 text-xs rounded-full font-semibold ${
                      t.id === "pending" ? "bg-rose-600 text-white" : "bg-slate-600 text-slate-300"
                    }`}>
                      {t.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab body — stable tabpanels; inactive panels hidden and their content not rendered */}
          <div className="px-6 md:px-8 py-6">
            <div
              id={panelId("search")}
              role="tabpanel"
              aria-labelledby={tabId("search")}
              tabIndex={0}
              hidden={tab !== "search"}
              className="focus:outline-none"
            >
              {tab === "search" && (
                <SearchTab
                  connectionsData={data}
                  showToast={showToast}
                />
              )}
            </div>
            <div
              id={panelId("pending")}
              role="tabpanel"
              aria-labelledby={tabId("pending")}
              tabIndex={0}
              hidden={tab !== "pending"}
              className="focus:outline-none"
            >
              {tab === "pending" && (
                <PendingTab
                  data={data}
                  isLoading={isLoading}
                  showToast={showToast}
                />
              )}
            </div>
            <div
              id={panelId("connections")}
              role="tabpanel"
              aria-labelledby={tabId("connections")}
              tabIndex={0}
              hidden={tab !== "connections"}
              className="focus:outline-none"
            >
              {tab === "connections" && (
                <ConnectionsTab
                  data={data}
                  isLoading={isLoading}
                  showToast={showToast}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
