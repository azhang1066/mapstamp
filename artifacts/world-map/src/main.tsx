import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setBaseUrl } from "@workspace/api-client-react";
import AuthRoot from "./AuthRoot";
import "./index.css";

// Point the generated API client at the correct base path for this artifact
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
setBaseUrl(basePath);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,      // 30 s — good default for social data
      retry: 1,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <AuthRoot />
  </QueryClientProvider>,
);
