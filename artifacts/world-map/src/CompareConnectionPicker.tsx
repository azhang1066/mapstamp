import { useEffect, useState } from "react";
import { useListConnections } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "./components/ui/dialog";

interface Props {
  userId: string;
  onClose: () => void;
  onSelect: (username: string) => void;
}

export default function CompareConnectionPicker({ userId, onClose, onSelect }: Props) {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();
  const queryKey = ["compare-picker", userId];
  const { data, isPending, isError, refetch } = useListConnections({
    query: { queryKey, staleTime: 0, gcTime: 0, refetchOnMount: "always" },
    request: { credentials: "include" },
  });
  useEffect(() => () => {
    void queryClient.cancelQueries({ queryKey: ["compare-picker", userId] });
    queryClient.removeQueries({ queryKey: ["compare-picker", userId] });
  }, [queryClient, userId]);
  const accepted = data?.accepted ?? [];
  const matches = accepted.filter(({ otherUser }) =>
    `${otherUser?.username ?? ""} ${otherUser?.displayName ?? ""}`
      .toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md border-slate-700 bg-slate-950 text-slate-100">
        <DialogHeader>
          <DialogTitle>Compare maps</DialogTitle>
          <DialogDescription>Choose one accepted connection. Comparisons stay private and read-only.</DialogDescription>
        </DialogHeader>
        <label htmlFor="compare-connection-search" className="text-sm font-medium">Search connections</label>
        <input
          id="compare-connection-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Username or display name"
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
        />
        <div className="max-h-72 overflow-y-auto" aria-live="polite">
          {isPending ? <p className="py-5 text-sm text-slate-400">Loading connections…</p> : isError ? (
            <div role="alert" className="py-4 text-sm">
              <p>Could not load your connections.</p>
              <button onClick={() => void refetch()} className="mt-2 text-sky-300 underline">Try again</button>
            </div>
          ) : matches.length ? (
            <ul className="space-y-2">
              {matches.map(({ id, otherUser }) => otherUser?.username ? (
                <li key={id}>
                  <button
                    onClick={() => onSelect(otherUser.username!)}
                    className="w-full rounded-lg border border-slate-800 p-3 text-left hover:border-sky-500 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-400"
                  >
                    <span className="block truncate font-medium">@{otherUser.username}</span>
                    {otherUser.displayName && <span className="block truncate text-sm text-slate-400">{otherUser.displayName}</span>}
                  </button>
                </li>
              ) : null)}
            </ul>
          ) : <p className="py-5 text-sm text-slate-400">{accepted.length ? "No matching connections." : "No accepted connections yet. Connect with a traveler first."}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}