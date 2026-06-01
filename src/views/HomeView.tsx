import { useConnectionStore, useIsConnected } from "@/stores/connection-store";
import { Database, Plus, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";

export function HomeView() {
  const { connections } = useConnectionStore();
  const isConnected = useIsConnected();
  const navigate = useNavigate();

  if (!isConnected) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100%",
          alignItems: "center",
          justifyContent: "center",
          padding: "48px 32px",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "32px",
            textAlign: "center",
            maxWidth: "420px",
            width: "100%",
          }}
        >
          <div
            style={{
              width: "64px",
              height: "64px",
              borderRadius: "16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: "rgba(62, 207, 142, 0.15)",
            }}
          >
            <Database size={32} style={{ color: "var(--color-accent)" }} />
          </div>

          <div>
            <h1
              style={{
                fontSize: "20px",
                fontWeight: 600,
                color: "var(--color-text-primary)",
                marginBottom: "8px",
              }}
            >
              Welcome to PgStudio
            </h1>
            <p
              style={{
                fontSize: "14px",
                color: "var(--color-text-secondary)",
                lineHeight: 1.6,
              }}
            >
              AI-native PostgreSQL client. Connect to a database to get started.
            </p>
          </div>

          {connections.length > 0 ? (
            <div style={{ width: "100%" }}>
              <p
                style={{
                  fontSize: "11px",
                  fontWeight: 500,
                  color: "var(--color-text-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  marginBottom: "12px",
                }}
              >
                Recent Connections
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {connections.map((conn) => (
                  <button
                    key={conn.id}
                    onClick={() => navigate("/settings")}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "12px",
                      width: "100%",
                      borderRadius: "12px",
                      border: "1px solid var(--color-border)",
                      backgroundColor: "var(--color-bg-secondary)",
                      padding: "16px 20px",
                      textAlign: "left",
                      cursor: "pointer",
                      transition: "background-color 0.15s",
                    }}
                  >
                    <div
                      style={{
                        width: "10px",
                        height: "10px",
                        borderRadius: "50%",
                        flexShrink: 0,
                        backgroundColor: conn.color || "var(--color-accent)",
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: "14px",
                          fontWeight: 500,
                          color: "var(--color-text-primary)",
                        }}
                      >
                        {conn.name}
                      </div>
                      <div
                        style={{
                          fontSize: "12px",
                          color: "var(--color-text-muted)",
                          marginTop: "2px",
                        }}
                      >
                        {conn.host}:{conn.port}/{conn.database}
                      </div>
                    </div>
                    <ArrowRight
                      size={14}
                      style={{ color: "var(--color-text-muted)", flexShrink: 0 }}
                    />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <button
              onClick={() => navigate("/settings")}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                borderRadius: "10px",
                backgroundColor: "var(--color-accent)",
                padding: "12px 24px",
                fontSize: "14px",
                fontWeight: 500,
                color: "white",
                border: "none",
                cursor: "pointer",
              }}
            >
              <Plus size={16} />
              New Connection
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "auto", padding: "32px" }}>
      <div>
        <h1 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)" }}>
          Dashboard
        </h1>
        <p style={{ fontSize: "14px", color: "var(--color-text-secondary)", marginTop: "4px" }}>
          Database overview and quick actions
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "16px",
          marginTop: "32px",
        }}
      >
        <DashboardCard
          title="SQL Editor"
          description="Write and execute queries"
          onClick={() => navigate("/sql")}
        />
        <DashboardCard
          title="Table Editor"
          description="Browse and edit table data"
          onClick={() => navigate("/tables")}
        />
        <DashboardCard
          title="Schema Browser"
          description="Explore database objects"
          onClick={() => navigate("/schema")}
        />
      </div>
    </div>
  );
}

function DashboardCard({
  title,
  description,
  onClick,
}: {
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        borderRadius: "12px",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg-secondary)",
        padding: "20px",
        textAlign: "left",
        cursor: "pointer",
        transition: "background-color 0.15s",
      }}
    >
      <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-text-primary)" }}>
        {title}
      </span>
      <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
        {description}
      </span>
    </button>
  );
}
