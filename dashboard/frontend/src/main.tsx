import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App";
import { Layout } from "./components/Layout";
import { SourcesPage } from "./components/SourcesPage";
import { TrainingPage } from "./components/TrainingPage";
import { CompetitorsPage } from "./components/CompetitorsPage";
import { CategoriesPage } from "./components/CategoriesPage";
import "./styles.css";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false } },
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<App />} />
            <Route path="competitors" element={<CompetitorsPage />} />
            <Route path="categories" element={<CategoriesPage />} />
            <Route path="training" element={<TrainingPage />} />
            <Route path="sources" element={<SourcesPage />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
