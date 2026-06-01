import { useState, useEffect } from "react";
import { useConnectionStore, useIsConnected, useActiveSchemas } from "@/stores/connection-store";
import { getSchemas, getTables, getColumns } from "@/lib/tauri";
import type { TableInfo, ColumnInfo } from "@/lib/tauri";
import {
  Database,
  Table2,
  ChevronRight,
  ChevronDown,
  Key,
  Link2,
} from "lucide-react";

interface TreeNode {
  schema: string;
  expanded: boolean;
  tables: TableInfo[];
  loadedColumns: Record<string, ColumnInfo[]>;
  expandedTables: Set<string>;
}

interface BreadcrumbState {
  schema: string | null;
  table: string | null;
  column: string | null;
}

export function SchemaView() {
  const { activeConnectionId, setSchemas } =
    useConnectionStore();
  const isConnected = useIsConnected();
  const schemas = useActiveSchemas();
  const [tree, setTree] = useState<Record<string, TreeNode>>({});
  const [selectedColumn, setSelectedColumn] = useState<ColumnInfo | null>(null);
  const [breadcrumb, setBreadcrumb] = useState<BreadcrumbState>({
    schema: null,
    table: null,
    column: null,
  });

  useEffect(() => {
    if (!activeConnectionId || !isConnected) return;
    getSchemas(activeConnectionId).then((s) => {
      setSchemas(s);
    });
  }, [activeConnectionId, isConnected, setSchemas]);

  const toggleSchema = async (schemaName: string) => {
    const existing = tree[schemaName];
    if (existing) {
      const willExpand = !existing.expanded;
      setTree((prev) => ({
        ...prev,
        [schemaName]: { ...existing, expanded: willExpand },
      }));
      if (willExpand) {
        setBreadcrumb({ schema: schemaName, table: null, column: null });
        setSelectedColumn(null);
      } else if (breadcrumb.schema === schemaName) {
        setBreadcrumb({ schema: null, table: null, column: null });
        setSelectedColumn(null);
      }
      return;
    }

    if (!activeConnectionId) return;
    const tables = await getTables(activeConnectionId, schemaName);
    setTree((prev) => ({
      ...prev,
      [schemaName]: {
        schema: schemaName,
        expanded: true,
        tables,
        loadedColumns: {},
        expandedTables: new Set(),
      },
    }));
    setBreadcrumb({ schema: schemaName, table: null, column: null });
    setSelectedColumn(null);
  };

  const toggleTable = async (schemaName: string, tableName: string) => {
    const node = tree[schemaName];
    if (!node || !activeConnectionId) return;

    const newExpanded = new Set(node.expandedTables);
    if (newExpanded.has(tableName)) {
      newExpanded.delete(tableName);
      setTree((prev) => ({
        ...prev,
        [schemaName]: { ...node, expandedTables: newExpanded },
      }));
      if (breadcrumb.table === tableName) {
        setBreadcrumb({ schema: schemaName, table: null, column: null });
        setSelectedColumn(null);
      }
      return;
    }

    newExpanded.add(tableName);
    setBreadcrumb({ schema: schemaName, table: tableName, column: null });
    setSelectedColumn(null);

    if (!node.loadedColumns[tableName]) {
      const columns = await getColumns(
        activeConnectionId,
        schemaName,
        tableName,
      );
      setTree((prev) => ({
        ...prev,
        [schemaName]: {
          ...node,
          expandedTables: newExpanded,
          loadedColumns: { ...node.loadedColumns, [tableName]: columns },
        },
      }));
    } else {
      setTree((prev) => ({
        ...prev,
        [schemaName]: { ...node, expandedTables: newExpanded },
      }));
    }
  };

  const selectColumn = (schemaName: string, tableName: string, col: ColumnInfo) => {
    setSelectedColumn(col);
    setBreadcrumb({ schema: schemaName, table: tableName, column: col.name });
  };

  const breadcrumbGoToSchema = (schemaName: string) => {
    setBreadcrumb({ schema: schemaName, table: null, column: null });
    setSelectedColumn(null);
  };

  const breadcrumbGoToTable = (schemaName: string, tableName: string) => {
    setBreadcrumb({ schema: schemaName, table: tableName, column: null });
    setSelectedColumn(null);
  };

  const breadcrumbGoToRoot = () => {
    setBreadcrumb({ schema: null, table: null, column: null });
    setSelectedColumn(null);
  };

  if (!isConnected) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", padding: "32px", fontSize: "14px", color: "var(--color-text-muted)" }}>
        Connect to a database to browse the schema
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Tree */}
      <div style={{ display: "flex", width: "288px", flexDirection: "column", borderRight: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)", overflow: "auto" }}>
        <div style={{ borderBottom: "1px solid var(--color-border)", paddingLeft: "16px", paddingRight: "16px", paddingTop: "12px", paddingBottom: "12px", fontSize: "12px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Object Explorer
        </div>
        <div style={{ flex: 1, overflow: "auto", paddingTop: "8px", paddingBottom: "8px" }}>
          {schemas.map((schema) => {
            const node = tree[schema.name];
            return (
              <div key={schema.name}>
                <button
                  onClick={() => toggleSchema(schema.name)}
                  style={{ display: "flex", width: "100%", alignItems: "center", gap: "8px", paddingLeft: "16px", paddingRight: "16px", paddingTop: "6px", paddingBottom: "6px", fontSize: "14px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", transition: "background-color 0.15s ease" }}
                >
                  {node?.expanded ? (
                    <ChevronDown size={14} />
                  ) : (
                    <ChevronRight size={14} />
                  )}
                  <Database size={14} style={{ color: "var(--color-accent)" }} />
                  <span>{schema.name}</span>
                </button>

                {node?.expanded &&
                  node.tables.map((table) => (
                    <div key={table.name}>
                      <button
                        onClick={() => toggleTable(schema.name, table.name)}
                        style={{ display: "flex", width: "100%", alignItems: "center", gap: "8px", paddingTop: "6px", paddingBottom: "6px", paddingLeft: "36px", paddingRight: "16px", fontSize: "14px", color: "var(--color-text-secondary)", background: "none", border: "none", cursor: "pointer", transition: "background-color 0.15s ease" }}
                      >
                        {node.expandedTables.has(table.name) ? (
                          <ChevronDown size={12} />
                        ) : (
                          <ChevronRight size={12} />
                        )}
                        <Table2 size={13} style={{ color: "var(--color-info)" }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{table.name}</span>
                        <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--color-text-muted)" }}>
                          {table.size}
                        </span>
                      </button>

                      {node.expandedTables.has(table.name) &&
                        node.loadedColumns[table.name]?.map((col) => (
                          <button
                            key={col.name}
                            onClick={() => selectColumn(schema.name, table.name, col)}
                            style={{
                              display: "flex",
                              width: "100%",
                              alignItems: "center",
                              gap: "8px",
                              paddingTop: "4px",
                              paddingBottom: "4px",
                              paddingLeft: "64px",
                              paddingRight: "16px",
                              fontSize: "12px",
                              color: selectedColumn?.name === col.name
                                ? "var(--color-accent)"
                                : "var(--color-text-muted)",
                              background: "none",
                              border: "none",
                              cursor: "pointer",
                              transition: "background-color 0.15s ease",
                            }}
                          >
                            {col.is_primary_key ? (
                              <Key size={11} style={{ color: "var(--color-warning)", flexShrink: 0 }} />
                            ) : col.is_foreign_key ? (
                              <Link2 size={11} style={{ color: "var(--color-info)", flexShrink: 0 }} />
                            ) : (
                              <span style={{ width: "11px", flexShrink: 0 }} />
                            )}
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col.name}</span>
                            <span style={{ marginLeft: "auto", color: "var(--color-text-muted)" }}>
                              {col.data_type}
                            </span>
                          </button>
                        ))}
                    </div>
                  ))}
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Breadcrumbs */}
        {breadcrumb.schema && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "12px 24px",
              borderBottom: "1px solid var(--color-border)",
              fontSize: "13px",
              flexShrink: 0,
            }}
          >
            <button
              onClick={breadcrumbGoToRoot}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: "var(--color-text-muted)",
                fontSize: "13px",
              }}
            >
              Schemas
            </button>
            <ChevronRight size={12} style={{ color: "var(--color-text-muted)" }} />
            <button
              onClick={() => breadcrumbGoToSchema(breadcrumb.schema!)}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: breadcrumb.table ? "var(--color-text-muted)" : "var(--color-text-primary)",
                fontWeight: breadcrumb.table ? 400 : 500,
                fontSize: "13px",
              }}
            >
              {breadcrumb.schema}
            </button>
            {breadcrumb.table && (
              <>
                <ChevronRight size={12} style={{ color: "var(--color-text-muted)" }} />
                <button
                  onClick={() => breadcrumbGoToTable(breadcrumb.schema!, breadcrumb.table!)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    cursor: "pointer",
                    color: breadcrumb.column ? "var(--color-text-muted)" : "var(--color-text-primary)",
                    fontWeight: breadcrumb.column ? 400 : 500,
                    fontSize: "13px",
                  }}
                >
                  {breadcrumb.table}
                </button>
              </>
            )}
            {breadcrumb.column && (
              <>
                <ChevronRight size={12} style={{ color: "var(--color-text-muted)" }} />
                <span
                  style={{
                    color: "var(--color-text-primary)",
                    fontWeight: 500,
                    fontSize: "13px",
                  }}
                >
                  {breadcrumb.column}
                </span>
              </>
            )}
          </div>
        )}

        <div style={{ flex: 1, padding: "32px", overflow: "auto" }}>
          {selectedColumn ? (
            <div style={{ maxWidth: "448px", display: "flex", flexDirection: "column", gap: "24px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)" }}>
                {selectedColumn.name}
              </h2>
              <div style={{ borderRadius: "12px", border: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)", overflow: "hidden" }}>
                <DetailRow label="Type" value={selectedColumn.data_type} />
                <DetailRow
                  label="Nullable"
                  value={selectedColumn.is_nullable ? "Yes" : "No"}
                />
                <DetailRow
                  label="Default"
                  value={selectedColumn.column_default || "None"}
                />
                <DetailRow
                  label="Primary Key"
                  value={selectedColumn.is_primary_key ? "Yes" : "No"}
                />
                {selectedColumn.is_foreign_key && (
                  <DetailRow
                    label="References"
                    value={`${selectedColumn.foreign_table}.${selectedColumn.foreign_column}`}
                  />
                )}
              </div>
            </div>
          ) : breadcrumb.table ? (
            <div style={{ maxWidth: "448px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "8px" }}>
                {breadcrumb.table}
              </h2>
              <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
                Select a column from the tree to see details
              </p>
            </div>
          ) : breadcrumb.schema ? (
            <div style={{ maxWidth: "448px" }}>
              <h2 style={{ fontSize: "18px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "8px" }}>
                {breadcrumb.schema}
              </h2>
              <p style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>
                Expand a table from the tree to explore columns
              </p>
            </div>
          ) : (
            <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "14px" }}>
              Select a schema to start browsing
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--color-border)", paddingLeft: "20px", paddingRight: "20px", paddingTop: "12px", paddingBottom: "12px" }}>
      <span style={{ fontSize: "14px", color: "var(--color-text-muted)" }}>{label}</span>
      <span style={{ fontSize: "14px", color: "var(--color-text-primary)", fontFamily: "monospace" }}>{value}</span>
    </div>
  );
}
