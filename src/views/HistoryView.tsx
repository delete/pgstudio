import { useState, useEffect } from "react";
import { useConnectionStore, useIsConnected } from "@/stores/connection-store";
import { getQueryHistory } from "@/lib/tauri";
import type { QueryHistoryEntry } from "@/lib/tauri";
import { CheckCircle2, XCircle, Clock, Search, Copy, Database } from "lucide-react";

export function HistoryView() {
  const { activeConnectionId, connections } = useConnectionStore();
  const isConnected = useIsConnected();
  const [history, setHistory] = useState<QueryHistoryEntry[]>([]);
  const [search, setSearch] = useState("");
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [filterConnId, setFilterConnId] = useState<string>("__current__");

  useEffect(() => {
    if (!isConnected) return;
    const connId = filterConnId === "__all__" ? undefined : filterConnId === "__current__" ? activeConnectionId ?? undefined : filterConnId;
    getQueryHistory(connId, 500)
      .then(setHistory)
      .catch(console.error);
  }, [activeConnectionId, isConnected, filterConnId]);

  const filtered = search
    ? history.filter(
        (h) =>
          h.sql.toLowerCase().includes(search.toLowerCase()) ||
          h.error_message?.toLowerCase().includes(search.toLowerCase()),
      )
    : history;

  const handleCopy = (entry: QueryHistoryEntry) => {
    navigator.clipboard.writeText(entry.sql);
    setCopiedId(entry.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const getConnectionName = (connId: string) => {
    const conn = connections.find((c) => c.id === connId);
    return conn ? conn.name : connId.slice(0, 8);
  };

  if (!isConnected) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", padding: "32px", fontSize: "14px", color: "var(--color-text-muted)" }}>
        Connect to a database to view query history
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid var(--color-border)", padding: "14px 20px" }}>
        <h1 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", flexShrink: 0 }}>
          Query History
        </h1>

        {/* Connection filter */}
        <div style={{ display: "flex", alignItems: "center", gap: "6px", flexShrink: 0 }}>
          <Database size={12} style={{ color: "var(--color-text-muted)" }} />
          <select
            value={filterConnId}
            onChange={(e) => setFilterConnId(e.target.value)}
            style={{
              borderRadius: "6px",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-bg-tertiary)",
              padding: "4px 8px",
              fontSize: "12px",
              color: "var(--color-text-primary)",
              outline: "none",
            }}
          >
            <option value="__current__">Current connection</option>
            <option value="__all__">All connections</option>
            {connections.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", flex: 1, alignItems: "center", gap: "8px", borderRadius: "8px", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-tertiary)", padding: "6px 12px" }}>
          <Search size={12} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search queries..."
            style={{ flex: 1, backgroundColor: "transparent", fontSize: "12px", color: "var(--color-text-primary)", outline: "none", border: "none" }}
          />
        </div>
        <span style={{ fontSize: "12px", color: "var(--color-text-muted)", flexShrink: 0 }}>
          {filtered.length} {filtered.length === 1 ? "query" : "queries"}
        </span>
      </div>
      <div style={{ flex: 1, overflow: "auto" }}>
        {filtered.length === 0 ? (
          <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "14px" }}>
            {search ? "No matching queries" : "No queries executed yet"}
          </div>
        ) : (
          <div>
            {filtered.map((entry) => (
              <div
                key={entry.id}
                style={{ display: "flex", alignItems: "flex-start", gap: "12px", padding: "16px 20px", transition: "background-color 0.15s ease", borderBottom: "1px solid var(--color-border)" }}
              >
                {entry.success ? (
                  <CheckCircle2
                    size={14}
                    style={{ marginTop: "4px", color: "var(--color-accent)", flexShrink: 0 }}
                  />
                ) : (
                  <XCircle
                    size={14}
                    style={{ marginTop: "4px", color: "var(--color-danger)", flexShrink: 0 }}
                  />
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <pre style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-primary)", whiteSpace: "pre-wrap", maxHeight: "80px", overflow: "hidden", lineHeight: 1.6 }}>
                    {entry.sql}
                  </pre>
                  <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "16px", fontSize: "12px", color: "var(--color-text-muted)" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <Clock size={10} />
                      {entry.execution_time_ms}ms
                    </span>
                    <span>
                      {entry.row_count} row{entry.row_count !== 1 ? "s" : ""}
                    </span>
                    {filterConnId === "__all__" && (
                      <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                        <Database size={10} />
                        {getConnectionName(entry.connection_id)}
                      </span>
                    )}
                    <span>{new Date(entry.created_at).toLocaleString()}</span>
                  </div>
                  {entry.error_message && (
                    <p style={{ marginTop: "8px", fontSize: "12px", color: "var(--color-danger)", lineHeight: 1.6 }}>
                      {entry.error_message}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleCopy(entry)}
                  style={{
                    flexShrink: 0,
                    borderRadius: "8px",
                    padding: "6px",
                    transition: "background-color 0.15s ease",
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: copiedId === entry.id ? "var(--color-accent)" : "var(--color-text-muted)",
                  }}
                  title="Copy to clipboard"
                >
                  <Copy size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
