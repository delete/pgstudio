import { useConnectionStore, useIsConnected } from "@/stores/connection-store";
import { useAIStore } from "@/stores/ai-store";
import { Cpu } from "lucide-react";

export function StatusBar() {
  const { activeConnectionId, connections, connectedIds } = useConnectionStore();
  const isConnected = useIsConnected();
  const conn = connections.find((c) => c.id === activeConnectionId);
  const aiConfig = useAIStore((s) => s.aiConfig);

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
        {aiConfig && (
          <>
            <span style={{ display: "flex", alignItems: "center", gap: "5px" }}>
              <Cpu size={12} />
              {aiConfig.model}
              {aiConfig.effort && <span style={{ opacity: 0.7 }}>· {aiConfig.effort}</span>}
            </span>
            <span style={{ width: "1px", height: "14px", backgroundColor: "var(--color-border)" }} />
          </>
        )}
        <span>PgStudio v0.1.0</span>
      </div>
    </footer>
  );
}
