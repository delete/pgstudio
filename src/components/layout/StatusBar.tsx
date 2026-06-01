import { useConnectionStore, useIsConnected } from "@/stores/connection-store";

export function StatusBar() {
  const { activeConnectionId, connections, connectedIds } = useConnectionStore();
  const isConnected = useIsConnected();
  const conn = connections.find((c) => c.id === activeConnectionId);

  return (
    <footer
      style={{
        display: "flex",
        height: "28px",
        alignItems: "center",
        justifyContent: "space-between",
        borderTop: "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg-secondary)",
        padding: "0 16px",
        fontSize: "12px",
        color: "var(--color-text-muted)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        {conn && isConnected && (
          <span>
            {conn.user}@{conn.host}:{conn.port}/{conn.database}
          </span>
        )}
        {connectedIds.length > 1 && (
          <span style={{ opacity: 0.7 }}>
            ({connectedIds.length} connections)
          </span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <span>PgStudio v0.1.0</span>
      </div>
    </footer>
  );
}
