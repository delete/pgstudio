import { useEffect } from "react";
import { Routes, Route } from "react-router-dom";
import { Sidebar } from "@/components/layout/Sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { StatusBar } from "@/components/layout/StatusBar";
import { OnboardingView } from "@/views/OnboardingView";
import { HomeView } from "@/views/HomeView";
import { SQLEditorView } from "@/views/SQLEditorView";
import { TableEditorView } from "@/views/TableEditorView";
import { HistoryView } from "@/views/HistoryView";
import { SavedQueriesView } from "@/views/SavedQueriesView";
import { AIView } from "@/views/AIView";
import { MigrationView } from "@/views/MigrationView";
import { ConnectionView } from "@/views/ConnectionView";
import { AISettingsView } from "@/views/AISettingsView";
import { useAIStore } from "@/stores/ai-store";
import { useConnectionStore } from "@/stores/connection-store";
import { aiStatus, listConnections } from "@/lib/tauri";

export default function App() {
  const { onboardingDone, setOnboardingDone, setConfigured } = useAIStore();
  const { setConnections } = useConnectionStore();

  // Check if AI is already configured on launch
  useEffect(() => {
    aiStatus()
      .then((configured) => {
        setConfigured(configured);
        if (configured) {
          setOnboardingDone(true);
        }
      })
      .catch(() => {});
  }, [setConfigured, setOnboardingDone]);

  // Load saved connections on launch
  useEffect(() => {
    listConnections()
      .then(setConnections)
      .catch(() => {});
  }, [setConnections]);

  // Show onboarding on first launch
  if (!onboardingDone) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", backgroundColor: "var(--color-bg-primary)" }}>
        <div
          data-tauri-drag-region
          style={{ height: "44px", flexShrink: 0, backgroundColor: "var(--color-bg-secondary)", borderBottom: "1px solid var(--color-border)" }}
        />
        <main style={{ flex: 1, overflowY: "auto", backgroundColor: "var(--color-bg-primary)" }}>
          <OnboardingView />
        </main>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", width: "100vw", backgroundColor: "var(--color-bg-primary)" }}>
      <TopBar />
      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
        <Sidebar />
        <main style={{ flex: 1, overflowY: "auto", backgroundColor: "var(--color-bg-primary)" }}>
          <Routes>
            <Route path="/" element={<HomeView />} />
            <Route path="/sql" element={<SQLEditorView />} />
            <Route path="/tables" element={<TableEditorView />} />
            <Route path="/history" element={<HistoryView />} />
            <Route path="/saved" element={<SavedQueriesView />} />
            <Route path="/ai" element={<AIView />} />
            <Route path="/migration" element={<MigrationView />} />
            <Route path="/settings" element={<ConnectionView />} />
            <Route path="/ai-settings" element={<AISettingsView />} />
          </Routes>
        </main>
      </div>
      <StatusBar />
    </div>
  );
}
