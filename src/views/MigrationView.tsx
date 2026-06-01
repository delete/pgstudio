import { useState, useEffect, useCallback } from "react";
import { useConnectionStore, useIsConnected } from "@/stores/connection-store";
import {
  detectPgTools,
  pgDumpToFile,
  pgRestoreFromFile,
  pgTransfer,
  getTables,
} from "@/lib/tauri";
import type { PgToolsStatus, TableInfo } from "@/lib/tauri";
import { ArrowLeftRight, Download, Upload, CheckCircle2, AlertCircle } from "lucide-react";

type MigrationTab = "transfer" | "export" | "import";

export function MigrationView() {
  const { connectedIds, connections, connectionData } = useConnectionStore();
  const isConnected = useIsConnected();
  const [activeTab, setActiveTab] = useState<MigrationTab>("transfer");
  const [pgTools, setPgTools] = useState<PgToolsStatus | null>(null);
  const [detecting, setDetecting] = useState(true);

  useEffect(() => {
    setDetecting(true);
    detectPgTools()
      .then(setPgTools)
      .catch(() => setPgTools({ pg_dump: null, pg_restore: null, version: null }))
      .finally(() => setDetecting(false));
  }, []);

  const connectedConnections = connections.filter((c) => connectedIds.includes(c.id));
  const toolsAvailable = pgTools?.pg_dump != null && pgTools?.pg_restore != null;

  if (!isConnected) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", padding: "32px", fontSize: "14px", color: "var(--color-text-muted)" }}>
        Connect to a database to use migration tools
      </div>
    );
  }

  const tabs: { key: MigrationTab; label: string; icon: typeof ArrowLeftRight }[] = [
    { key: "transfer", label: "Transfer", icon: ArrowLeftRight },
    { key: "export", label: "Export", icon: Download },
    { key: "import", label: "Import", icon: Upload },
  ];

  return (
    <div style={{ display: "flex", height: "100%", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", borderBottom: "1px solid var(--color-border)", padding: "14px 20px" }}>
        <ArrowLeftRight size={16} style={{ color: "var(--color-accent)" }} />
        <h1 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>Schema Migration</h1>
        <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
          Transfer, export, and import database schemas and data
        </span>
      </div>

      {/* pg_tools detection banner */}
      {!detecting && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 20px",
          borderBottom: "1px solid var(--color-border)",
          backgroundColor: toolsAvailable ? "rgba(62,207,142,0.05)" : "rgba(239,68,68,0.05)",
          fontSize: "12px",
        }}>
          {toolsAvailable ? (
            <>
              <CheckCircle2 size={14} style={{ color: "var(--color-accent)", flexShrink: 0 }} />
              <span style={{ color: "var(--color-accent)" }}>
                pg_dump & pg_restore detected
              </span>
              {pgTools?.version && (
                <span style={{ color: "var(--color-text-muted)" }}>
                  — {pgTools.version}
                </span>
              )}
            </>
          ) : (
            <>
              <AlertCircle size={14} style={{ color: "var(--color-danger)", flexShrink: 0 }} />
              <span style={{ color: "var(--color-danger)" }}>
                {!pgTools?.pg_dump && !pgTools?.pg_restore
                  ? "pg_dump and pg_restore not found"
                  : !pgTools?.pg_dump
                    ? "pg_dump not found"
                    : "pg_restore not found"}
              </span>
              <span style={{ color: "var(--color-text-muted)" }}>
                — Install PostgreSQL client tools: <code style={{ fontFamily: "monospace", backgroundColor: "var(--color-bg-tertiary)", padding: "1px 4px", borderRadius: "3px" }}>brew install libpq</code>
              </span>
            </>
          )}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", padding: "0 16px", flexShrink: 0 }}>
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 16px",
                fontSize: "13px",
                fontWeight: activeTab === tab.key ? 600 : 400,
                color: activeTab === tab.key ? "var(--color-accent)" : "var(--color-text-muted)",
                borderBottom: activeTab === tab.key ? "2px solid var(--color-accent)" : "2px solid transparent",
                background: "none",
                border: "none",
                borderBottomStyle: "solid",
                cursor: "pointer",
                transition: "color 0.15s ease",
              }}
            >
              <Icon size={13} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto", padding: "24px 20px" }}>
        {activeTab === "transfer" && (
          <TransferPanel
            connectedConnections={connectedConnections}
            connectionData={connectionData}
            toolsAvailable={toolsAvailable}
          />
        )}
        {activeTab === "export" && (
          <ExportPanel
            connectedConnections={connectedConnections}
            connectionData={connectionData}
            toolsAvailable={toolsAvailable}
          />
        )}
        {activeTab === "import" && (
          <ImportPanel
            connectedConnections={connectedConnections}
            toolsAvailable={toolsAvailable}
          />
        )}
      </div>
    </div>
  );
}

// ── Transfer Panel ──

interface ConnOption {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
}

function TransferPanel({
  connectedConnections,
  connectionData,
  toolsAvailable,
}: {
  connectedConnections: ConnOption[];
  connectionData: Record<string, { schemas: { name: string }[] }>;
  toolsAvailable: boolean;
}) {
  const [sourceId, setSourceId] = useState<string>("");
  const [targetId, setTargetId] = useState<string>("");
  const [scope, setScope] = useState<"full" | "tables">("full");
  const [schemaOnly, setSchemaOnly] = useState(false);
  const [clean, setClean] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  // Table selection
  const [sourceTables, setSourceTables] = useState<TableInfo[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  useEffect(() => {
    if (!sourceId || scope !== "tables") return;
    setLoadingTables(true);
    const schemas = connectionData[sourceId]?.schemas ?? [];
    const publicSchema = schemas.find((s) => s.name === "public") ?? schemas[0];
    if (!publicSchema) { setLoadingTables(false); return; }
    getTables(sourceId, publicSchema.name)
      .then((tables) => { setSourceTables(tables); setSelectedTables([]); })
      .catch(() => setSourceTables([]))
      .finally(() => setLoadingTables(false));
  }, [sourceId, scope, connectionData]);

  const handleTransfer = useCallback(async () => {
    if (!sourceId || !targetId) return;
    setRunning(true);
    setResult(null);
    try {
      const tables = scope === "tables" && selectedTables.length > 0 ? selectedTables : undefined;
      const res = await pgTransfer(sourceId, targetId, tables, schemaOnly, clean);
      setResult({ success: res.success, error: res.error ?? undefined });
    } catch (e) {
      setResult({ success: false, error: String(e) });
    } finally {
      setRunning(false);
    }
  }, [sourceId, targetId, scope, selectedTables, schemaOnly, clean]);

  const targetOptions = connectedConnections.filter((c) => c.id !== sourceId);

  return (
    <div style={{ maxWidth: "560px" }}>
      <SectionHeader title="Direct Database Transfer" subtitle="Transfer schema and data between two connected databases" />

      <FormField label="Source Connection">
        <ConnectionSelect
          connections={connectedConnections}
          value={sourceId}
          onChange={setSourceId}
          placeholder="Select source..."
        />
      </FormField>

      <FormField label="Target Connection">
        <ConnectionSelect
          connections={targetOptions}
          value={targetId}
          onChange={setTargetId}
          placeholder="Select target..."
        />
      </FormField>

      <FormField label="Scope">
        <div style={{ display: "flex", gap: "12px" }}>
          <RadioButton label="Full database" checked={scope === "full"} onChange={() => setScope("full")} />
          <RadioButton label="Select tables" checked={scope === "tables"} onChange={() => setScope("tables")} />
        </div>
      </FormField>

      {scope === "tables" && sourceId && (
        <FormField label="Tables">
          {loadingTables ? (
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Loading tables...</span>
          ) : sourceTables.length === 0 ? (
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No tables found</span>
          ) : (
            <div style={{ maxHeight: "200px", overflow: "auto", border: "1px solid var(--color-border)", borderRadius: "8px", padding: "4px 0" }}>
              {sourceTables.map((t) => (
                <label
                  key={`${t.schema}.${t.name}`}
                  style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", fontSize: "12px", color: "var(--color-text-primary)", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTables.includes(`${t.schema}.${t.name}`)}
                    onChange={(e) => {
                      const key = `${t.schema}.${t.name}`;
                      setSelectedTables((prev) => e.target.checked ? [...prev, key] : prev.filter((k) => k !== key));
                    }}
                  />
                  <span style={{ fontFamily: "monospace" }}>{t.schema}.{t.name}</span>
                  <span style={{ fontSize: "10px", color: "var(--color-text-muted)", marginLeft: "auto" }}>{t.size}</span>
                </label>
              ))}
            </div>
          )}
        </FormField>
      )}

      <FormField label="Options">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <CheckboxField label="Schema only (no data)" checked={schemaOnly} onChange={setSchemaOnly} />
          <CheckboxField label="Clean target before restore (DROP + CREATE)" checked={clean} onChange={setClean} />
        </div>
      </FormField>

      <ActionButton
        label={running ? "Transferring..." : "Transfer"}
        onClick={handleTransfer}
        disabled={!toolsAvailable || !sourceId || !targetId || running}
        loading={running}
      />

      <ResultBanner result={result} />
    </div>
  );
}

// ── Export Panel ──

function ExportPanel({
  connectedConnections,
  connectionData,
  toolsAvailable,
}: {
  connectedConnections: ConnOption[];
  connectionData: Record<string, { schemas: { name: string }[] }>;
  toolsAvailable: boolean;
}) {
  const [connectionId, setConnectionId] = useState<string>("");
  const [format, setFormat] = useState<"custom" | "plain" | "directory">("custom");
  const [scope, setScope] = useState<"full" | "tables">("full");
  const [schemaOnly, setSchemaOnly] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string; filePath?: string; sizeBytes?: number } | null>(null);

  // Table selection
  const [sourceTables, setSourceTables] = useState<TableInfo[]>([]);
  const [selectedTables, setSelectedTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);

  useEffect(() => {
    if (!connectionId || scope !== "tables") return;
    setLoadingTables(true);
    const schemas = connectionData[connectionId]?.schemas ?? [];
    const publicSchema = schemas.find((s) => s.name === "public") ?? schemas[0];
    if (!publicSchema) { setLoadingTables(false); return; }
    getTables(connectionId, publicSchema.name)
      .then((tables) => { setSourceTables(tables); setSelectedTables([]); })
      .catch(() => setSourceTables([]))
      .finally(() => setLoadingTables(false));
  }, [connectionId, scope, connectionData]);

  const handleExport = useCallback(async () => {
    if (!connectionId) return;

    // Use tauri native dialog for save path
    const { save } = await import("@tauri-apps/plugin-dialog");
    const ext = format === "plain" ? "sql" : format === "directory" ? "" : "dump";
    const fileName = `export.${ext || "dump"}`;
    const filePath = await save({
      defaultPath: fileName,
      filters: format === "plain"
        ? [{ name: "SQL Files", extensions: ["sql"] }]
        : format === "custom"
          ? [{ name: "Dump Files", extensions: ["dump"] }]
          : [],
    });

    if (!filePath) return;

    setRunning(true);
    setResult(null);
    try {
      const tables = scope === "tables" && selectedTables.length > 0 ? selectedTables : undefined;
      const res = await pgDumpToFile(connectionId, format, schemaOnly, tables, filePath);
      setResult({
        success: res.success,
        error: res.error ?? undefined,
        filePath: res.file_path,
        sizeBytes: res.size_bytes,
      });
    } catch (e) {
      setResult({ success: false, error: String(e) });
    } finally {
      setRunning(false);
    }
  }, [connectionId, format, scope, selectedTables, schemaOnly]);

  return (
    <div style={{ maxWidth: "560px" }}>
      <SectionHeader title="Export Database" subtitle="Dump database schema and data to a file using pg_dump" />

      <FormField label="Connection">
        <ConnectionSelect
          connections={connectedConnections}
          value={connectionId}
          onChange={setConnectionId}
          placeholder="Select connection..."
        />
      </FormField>

      <FormField label="Format">
        <div style={{ display: "flex", gap: "12px" }}>
          <RadioButton label="Custom (.dump)" checked={format === "custom"} onChange={() => setFormat("custom")} />
          <RadioButton label="Plain SQL (.sql)" checked={format === "plain"} onChange={() => setFormat("plain")} />
          <RadioButton label="Directory" checked={format === "directory"} onChange={() => setFormat("directory")} />
        </div>
      </FormField>

      <FormField label="Scope">
        <div style={{ display: "flex", gap: "12px" }}>
          <RadioButton label="Full database" checked={scope === "full"} onChange={() => setScope("full")} />
          <RadioButton label="Select tables" checked={scope === "tables"} onChange={() => setScope("tables")} />
        </div>
      </FormField>

      {scope === "tables" && connectionId && (
        <FormField label="Tables">
          {loadingTables ? (
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Loading tables...</span>
          ) : sourceTables.length === 0 ? (
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>No tables found</span>
          ) : (
            <div style={{ maxHeight: "200px", overflow: "auto", border: "1px solid var(--color-border)", borderRadius: "8px", padding: "4px 0" }}>
              {sourceTables.map((t) => (
                <label
                  key={`${t.schema}.${t.name}`}
                  style={{ display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", fontSize: "12px", color: "var(--color-text-primary)", cursor: "pointer" }}
                >
                  <input
                    type="checkbox"
                    checked={selectedTables.includes(`${t.schema}.${t.name}`)}
                    onChange={(e) => {
                      const key = `${t.schema}.${t.name}`;
                      setSelectedTables((prev) => e.target.checked ? [...prev, key] : prev.filter((k) => k !== key));
                    }}
                  />
                  <span style={{ fontFamily: "monospace" }}>{t.schema}.{t.name}</span>
                  <span style={{ fontSize: "10px", color: "var(--color-text-muted)", marginLeft: "auto" }}>{t.size}</span>
                </label>
              ))}
            </div>
          )}
        </FormField>
      )}

      <FormField label="Options">
        <CheckboxField label="Schema only (no data)" checked={schemaOnly} onChange={setSchemaOnly} />
      </FormField>

      <ActionButton
        label={running ? "Exporting..." : "Export"}
        onClick={handleExport}
        disabled={!toolsAvailable || !connectionId || running}
        loading={running}
      />

      {result && (
        <div style={{
          marginTop: "16px",
          padding: "12px 16px",
          borderRadius: "10px",
          backgroundColor: result.success ? "rgba(62,207,142,0.08)" : "rgba(239,68,68,0.08)",
          border: `1px solid ${result.success ? "rgba(62,207,142,0.2)" : "rgba(239,68,68,0.2)"}`,
          fontSize: "12px",
        }}>
          {result.success ? (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <CheckCircle2 size={14} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: "1px" }} />
              <div>
                <div style={{ color: "var(--color-accent)", fontWeight: 500 }}>Export complete</div>
                {result.filePath && (
                  <div style={{ color: "var(--color-text-muted)", marginTop: "4px", fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all" }}>
                    {result.filePath}
                  </div>
                )}
                {result.sizeBytes != null && result.sizeBytes > 0 && (
                  <div style={{ color: "var(--color-text-muted)", marginTop: "2px" }}>
                    {formatBytes(result.sizeBytes)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
              <AlertCircle size={14} style={{ color: "var(--color-danger)", flexShrink: 0, marginTop: "1px" }} />
              <div>
                <div style={{ color: "var(--color-danger)", fontWeight: 500 }}>Export failed</div>
                {result.error && (
                  <pre style={{ color: "var(--color-text-muted)", marginTop: "4px", fontSize: "11px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                    {result.error}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Import Panel ──

function ImportPanel({
  connectedConnections,
  toolsAvailable,
}: {
  connectedConnections: ConnOption[];
  toolsAvailable: boolean;
}) {
  const [connectionId, setConnectionId] = useState<string>("");
  const [filePath, setFilePath] = useState<string>("");
  const [clean, setClean] = useState(false);
  const [schemaOnly, setSchemaOnly] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);

  const handleSelectFile = async () => {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({
      multiple: false,
      filters: [
        { name: "Database dumps", extensions: ["dump", "sql", "backup"] },
        { name: "All files", extensions: ["*"] },
      ],
    });
    if (selected) {
      setFilePath(selected as string);
    }
  };

  const handleImport = useCallback(async () => {
    if (!connectionId || !filePath) return;
    setRunning(true);
    setResult(null);
    try {
      const res = await pgRestoreFromFile(connectionId, filePath, clean, schemaOnly);
      setResult({ success: res.success, error: res.error ?? undefined });
    } catch (e) {
      setResult({ success: false, error: String(e) });
    } finally {
      setRunning(false);
    }
  }, [connectionId, filePath, clean, schemaOnly]);

  return (
    <div style={{ maxWidth: "560px" }}>
      <SectionHeader title="Import Database" subtitle="Restore database schema and data from a file using pg_restore" />

      <FormField label="Target Connection">
        <ConnectionSelect
          connections={connectedConnections}
          value={connectionId}
          onChange={setConnectionId}
          placeholder="Select target..."
        />
      </FormField>

      <FormField label="File">
        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
          <button
            onClick={handleSelectFile}
            style={{
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              backgroundColor: "var(--color-bg-secondary)",
              padding: "8px 14px",
              fontSize: "12px",
              color: "var(--color-text-secondary)",
              cursor: "pointer",
              flexShrink: 0,
            }}
          >
            Choose file...
          </button>
          {filePath && (
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)", fontFamily: "monospace", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {filePath.split("/").pop()}
            </span>
          )}
        </div>
      </FormField>

      <FormField label="Options">
        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
          <CheckboxField label="Clean before restore (DROP + CREATE)" checked={clean} onChange={setClean} />
          <CheckboxField label="Schema only (no data)" checked={schemaOnly} onChange={setSchemaOnly} />
        </div>
      </FormField>

      <ActionButton
        label={running ? "Importing..." : "Import"}
        onClick={handleImport}
        disabled={!toolsAvailable || !connectionId || !filePath || running}
        loading={running}
      />

      <ResultBanner result={result} />
    </div>
  );
}

// ── Shared UI Components ──

function SectionHeader({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div style={{ marginBottom: "24px" }}>
      <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "4px" }}>{title}</h2>
      <p style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>{subtitle}</p>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "20px" }}>
      <label style={{ display: "block", fontSize: "12px", fontWeight: 500, color: "var(--color-text-secondary)", marginBottom: "6px" }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ConnectionSelect({
  connections,
  value,
  onChange,
  placeholder,
}: {
  connections: { id: string; name: string; host: string; port: number; database: string }[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        borderRadius: "8px",
        border: "1px solid var(--color-border)",
        backgroundColor: "var(--color-bg-secondary)",
        padding: "8px 12px",
        fontSize: "13px",
        color: value ? "var(--color-text-primary)" : "var(--color-text-muted)",
        outline: "none",
      }}
    >
      <option value="">{placeholder}</option>
      {connections.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.host}:{c.port}/{c.database})
        </option>
      ))}
    </select>
  );
}

function RadioButton({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", color: "var(--color-text-primary)", cursor: "pointer" }}>
      <input type="radio" checked={checked} onChange={onChange} style={{ accentColor: "var(--color-accent)" }} />
      {label}
    </label>
  );
}

function CheckboxField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--color-text-primary)", cursor: "pointer" }}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: "var(--color-accent)" }} />
      {label}
    </label>
  );
}

function ActionButton({ label, onClick, disabled, loading }: { label: string; onClick: () => void; disabled: boolean; loading?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        borderRadius: "10px",
        backgroundColor: "var(--color-accent)",
        padding: "10px 20px",
        fontSize: "13px",
        fontWeight: 500,
        color: "white",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.5 : 1,
        transition: "opacity 0.15s ease",
      }}
    >
      {loading && (
        <div style={{
          width: "14px",
          height: "14px",
          border: "2px solid rgba(255,255,255,0.3)",
          borderTopColor: "white",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
      )}
      {label}
    </button>
  );
}

function ResultBanner({ result }: { result: { success: boolean; error?: string } | null }) {
  if (!result) return null;
  return (
    <div style={{
      marginTop: "16px",
      padding: "12px 16px",
      borderRadius: "10px",
      backgroundColor: result.success ? "rgba(62,207,142,0.08)" : "rgba(239,68,68,0.08)",
      border: `1px solid ${result.success ? "rgba(62,207,142,0.2)" : "rgba(239,68,68,0.2)"}`,
      fontSize: "12px",
      display: "flex",
      alignItems: "flex-start",
      gap: "8px",
    }}>
      {result.success ? (
        <>
          <CheckCircle2 size={14} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: "1px" }} />
          <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>Operation completed successfully</span>
        </>
      ) : (
        <>
          <AlertCircle size={14} style={{ color: "var(--color-danger)", flexShrink: 0, marginTop: "1px" }} />
          <div>
            <div style={{ color: "var(--color-danger)", fontWeight: 500 }}>Operation failed</div>
            {result.error && (
              <pre style={{ color: "var(--color-text-muted)", marginTop: "4px", fontSize: "11px", whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
                {result.error}
              </pre>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
