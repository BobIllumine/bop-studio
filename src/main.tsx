import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";

import { CALLBACK_PATH } from "./api/auth";
import "./styles/global.css";

const ScenePage = lazy(() => import("./pages/ScenePage"));
const AssetsPage = lazy(() => import("./pages/AssetsPage"));
const JobsPage = lazy(() => import("./pages/JobsPage"));
const AuthCallback = lazy(() => import("./pages/AuthCallback"));

const queries = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queries}>
      <BrowserRouter>
        <Suspense fallback={<div className="empty">Loading…</div>}>
          <Routes>
            <Route path="/" element={<Navigate to="/scene" replace />} />
            <Route path="/scene" element={<ScenePage />} />
            <Route path="/assets" element={<AssetsPage />} />
            <Route path="/jobs" element={<JobsPage />} />
            <Route path="/jobs/:id" element={<JobsPage />} />
            <Route path={CALLBACK_PATH} element={<AuthCallback />} />
            <Route path="*" element={<Navigate to="/scene" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
