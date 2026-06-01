import { useState, useRef, useEffect, useCallback } from "react";
import { useConnectionStore, useIsConnected } from "@/stores/connection-store";
import { connect, disconnect, getSchemas, getFullSchema, getDatabases } from "@/lib/tauri";
import type { ConnectionInput } from "@/lib/tauri";
import { Database, Circle, ChevronDown, Check, X } from "lucide-react";

const isMac = navigator.userAgent.includes("Mac");

export function TopBar() {
  const {
    activeConnectionId,
    connectedIds,
    connections,
    connectTo,
    disconnectFrom,
    setActiveConnection,
    setDatabases,
    setSchemas,
    setSchemaContext,
    setActiveDatabase,
  } = useConnectionStore();
  const isConnected = useIsConnected();
  const activeConnection = connections.find((c) => c.id === activeConnectionId);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [switching, setSwitching] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setSwitchError(null);
      }
    };
    if (dropdownOpen) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [dropdownOpen]);

  const handleSwitch = useCallback(async (connId: string) => {
    // If already connected, just switch focus
    if (connectedIds.includes(connId)) {
      setActiveConnection(connId);
      setDropdownOpen(false);
      return;
    }

    const conn = connections.find((c) => c.id === connId);
    if (!conn) return;

    setSwitching(connId);
    setSwitchError(null);

    try {
      const input: ConnectionInput = {
        ...conn,
        port: conn.port,
        password: "",
      };

      await connect(input);
      connectTo(connId);

      const [schemas, schemaCtx, databases] = await Promise.all([
        getSchemas(connId),
        getFullSchema(connId),
        getDatabases(connId),
      ]);
      setSchemas(schemas);
      setSchemaContext(schemaCtx);
      setDatabases(databases);
      const currentDb = databases.find((d) => d.is_current);
      setActiveDatabase(currentDb?.name ?? conn.database);
      setDropdownOpen(false);
    } catch (e) {
      setSwitchError(String(e));
    } finally {
      setSwitching(null);
    }
  }, [activeConnectionId, connectedIds, connections, connectTo, setActiveConnection, setSchemas, setSchemaContext, setDatabases, setActiveDatabase]);

  const handleDisconnect = useCallback(async (e: React.MouseEvent, connId: string) => {
    e.stopPropagation();
    try {
      await disconnect(connId);
    } catch {
      // ignore disconnect errors
    }
    disconnectFrom(connId);
  }, [disconnectFrom]);

  return (
    <header
      data-tauri-drag-region
      style={{
        display: "flex",
        height: "48px",
        alignItems: "center",
        borderBottom: "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg-secondary)",
        padding: "0 20px",
      }}
    >
      {/* Spacer for macOS traffic lights */}
      {isMac && <div style={{ width: "64px" }} data-tauri-drag-region />}

      <div style={{ display: "flex", alignItems: "center", gap: "12px" }} data-tauri-drag-region>
        <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)", letterSpacing: "-0.01em" }}>
          PgStudio
        </span>

        {connections.length > 0 && (
          <>
            <span style={{ color: "var(--color-text-muted)" }}>/</span>

            {/* Connection switcher */}
            <div style={{ position: "relative" }} ref={dropdownRef}>
              <button
                onClick={() => setDropdownOpen(!dropdownOpen)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderRadius: "8px",
                  padding: "6px 10px",
                  fontSize: "14px",
                  color: activeConnection ? "var(--color-text-secondary)" : "var(--color-text-muted)",
                  background: dropdownOpen ? "var(--color-bg-tertiary)" : "none",
                  border: "none",
                  cursor: "pointer",
                  transition: "background-color 0.15s ease",
                }}
              >
                <Database size={14} />
                <span>{activeConnection ? activeConnection.name : "Select connection"}</span>
                <ChevronDown size={12} style={{ color: "var(--color-text-muted)" }} />
              </button>

              {dropdownOpen && (
                <div style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  marginTop: "4px",
                  minWidth: "260px",
                  backgroundColor: "#1a1a1a",
                  border: "1px solid var(--color-border-light)",
                  borderRadius: "10px",
                  padding: "4px 0",
                  boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
                  zIndex: 9999,
                }}>
                  <div style={{ padding: "8px 14px 6px", fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Connections
                  </div>
                  {connections.map((conn) => {
                    const isActive = conn.id === activeConnectionId;
                    const isConnectedItem = connectedIds.includes(conn.id);
                    const isSwitchingThis = switching === conn.id;
                    return (
                      <button
                        key={conn.id}
                        onClick={() => handleSwitch(conn.id)}
                        disabled={!!switching}
                        style={{
                          display: "flex",
                          width: "100%",
                          alignItems: "center",
                          gap: "10px",
                          padding: "8px 14px",
                          fontSize: "13px",
                          color: isActive ? "var(--color-accent)" : "var(--color-text-primary)",
                          background: "none",
                          border: "none",
                          cursor: switching ? "default" : "pointer",
                          textAlign: "left",
                          transition: "background-color 0.1s ease",
                          opacity: switching && !isSwitchingThis ? 0.5 : 1,
                        }}
                        onMouseEnter={(e) => { if (!switching) (e.currentTarget as HTMLButtonElement).style.backgroundColor = "var(--color-bg-hover)"; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent"; }}
                      >
                        <div style={{ position: "relative", flexShrink: 0 }}>
                          <div
                            style={{
                              width: "8px",
                              height: "8px",
                              borderRadius: "50%",
                              backgroundColor: conn.color || "var(--color-accent)",
                            }}
                          />
                          {isConnectedItem && (
                            <div style={{
                              position: "absolute",
                              top: "-2px",
                              right: "-2px",
                              width: "5px",
                              height: "5px",
                              borderRadius: "50%",
                              backgroundColor: "var(--color-accent)",
                              border: "1px solid #1a1a1a",
                            }} />
                          )}
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                              {isSwitchingThis ? "Connecting..." : conn.name}
                            </span>
                            {isActive && isConnectedItem && (
                              <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--color-accent)", backgroundColor: "rgba(62,207,142,0.12)", padding: "1px 5px", borderRadius: "4px", flexShrink: 0 }}>
                                ACTIVE
                              </span>
                            )}
                            {!isActive && isConnectedItem && (
                              <span style={{ fontSize: "9px", fontWeight: 600, color: "var(--color-text-muted)", backgroundColor: "rgba(255,255,255,0.06)", padding: "1px 5px", borderRadius: "4px", flexShrink: 0 }}>
                                CONNECTED
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "1px" }}>
                            {conn.host}:{conn.port}/{conn.database}
                          </div>
                        </div>
                        {isConnectedItem && (
                          <button
                            onClick={(e) => handleDisconnect(e, conn.id)}
                            title="Disconnect"
                            style={{
                              flexShrink: 0,
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              padding: "2px",
                              color: "var(--color-text-muted)",
                              borderRadius: "4px",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.color = "var(--color-danger)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.color = "var(--color-text-muted)"; }}
                          >
                            <X size={12} />
                          </button>
                        )}
                        {isActive && !isConnectedItem && <Check size={14} style={{ flexShrink: 0, color: "var(--color-accent)" }} />}
                      </button>
                    );
                  })}

                  {switchError && (
                    <div style={{ padding: "8px 14px", fontSize: "12px", color: "var(--color-danger)", wordBreak: "break-all" }}>
                      {switchError}
                    </div>
                  )}
                </div>
              )}
            </div>

            {isConnected && (
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Circle
                  size={8}
                  style={{
                    fill: "var(--color-accent)",
                    color: "var(--color-accent)",
                  }}
                />
                <span style={{ fontSize: "12px", color: "var(--color-accent)" }}>
                  {connectedIds.length > 1
                    ? `${connectedIds.length} connected`
                    : "Connected"}
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </header>
  );
}
