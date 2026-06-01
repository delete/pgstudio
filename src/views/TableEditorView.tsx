import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useConnectionStore, useIsConnected, useActiveDatabases, useActiveDatabase, useActiveSchemas } from "@/stores/connection-store";
import { DataGrid } from "@/components/table/DataGrid";
import {
  getTables,
  getTableData,
  getColumns,
  getConstraints,
  getIndexes,
  getTriggers,
  getRules,
  getPolicies,
  getSchemas,
  getDatabases,
  switchDatabase,
  getFullSchema,
  executeQuery,
  exportFile,
  searchTableHistory,
  listConnections,
  connect,
} from "@/lib/tauri";
import type {
  TableInfo,
  QueryResult,
  ColumnInfo,
  ConstraintInfo,
  IndexInfo,
  TriggerInfo,
  RuleInfo,
  PolicyInfo,
  SchemaInfo,
  QueryHistoryEntry,
  ConnectionInput,
} from "@/lib/tauri";
import {
  Table2,
  ChevronRight,
  ChevronDown,
  X,
  Copy,
  Hash,
  Terminal,
  FileCode2,
  Download,
  Trash2,
  Key,
  Link2,
  Info,
  Database,
  FolderOpen,
  Folder,
  Columns3,
  GitMerge,
  ListTree,
  Zap,
  ScrollText,
  Shield,
  Plug,
  AlertCircle,
} from "lucide-react";

// ── Types ──

interface TableTab {
  id: string;
  kind: "data" | "details";
  schema: string;
  table: string;
  data: QueryResult | null;
  columns: ColumnInfo[] | null;
  loading: boolean;
  error: string | null;
  page: number;
  pageSize: number;
  totalRows: number | null;
  sortColumn: string | null;
  sortDirection: "ASC" | "DESC" | null;
  recentSortColumns: string[];
}

interface ContextMenu {
  x: number;
  y: number;
  schema: string;
  table: string;
  sub: "scripts" | "export" | "querytool" | null;
}

type TableSubCategory = "columns" | "constraints" | "indexes" | "triggers" | "rules" | "policies";

interface TreeState {
  expandedDatabases: Set<string>;
  expandedSchemas: Set<string>;
  expandedTables: Set<string>;
  // Which sub-categories are expanded: key = "db.schema.table.category"
  expandedSubCategories: Set<string>;
  loadedSchemas: Record<string, SchemaInfo[]>;
  loadedTables: Record<string, TableInfo[]>;
  loadedColumns: Record<string, ColumnInfo[]>;
  loadedConstraints: Record<string, ConstraintInfo[]>;
  loadedIndexes: Record<string, IndexInfo[]>;
  loadedTriggers: Record<string, TriggerInfo[]>;
  loadedRules: Record<string, RuleInfo[]>;
  loadedPolicies: Record<string, PolicyInfo[]>;
}

interface TableDefinitionsModal {
  schema: string;
  table: string;
  columns: ColumnInfo[];
  constraints: ConstraintInfo[];
  indexes: IndexInfo[];
  triggers: TriggerInfo[];
  rules: RuleInfo[];
  policies: PolicyInfo[];
}

interface ItemDefinitionModal {
  title: string;
  definition: string;
}

const SUB_CATEGORIES: { key: TableSubCategory; label: string; icon: typeof Columns3 }[] = [
  { key: "columns", label: "Columns", icon: Columns3 },
  { key: "constraints", label: "Constraints", icon: GitMerge },
  { key: "indexes", label: "Indexes", icon: ListTree },
  { key: "triggers", label: "Triggers", icon: Zap },
  { key: "rules", label: "Rules", icon: ScrollText },
  { key: "policies", label: "RLS Policies", icon: Shield },
];

// ── Main Component ──

export function TableEditorView() {
  const {
    connections,
    setConnections,
    activeConnectionId,
    connectTo,
    setPendingSql,
    setSchemas,
    setSchemaContext,
    setDatabases,
    setActiveDatabase,
  } = useConnectionStore();
  const isConnected = useIsConnected();
  const databases = useActiveDatabases();
  const activeDatabase = useActiveDatabase();
  const schemas = useActiveSchemas();
  const navigate = useNavigate();
  const [tabs, setTabs] = useState<TableTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenu | null>(null);
  const [countResult, setCountResult] = useState<string | null>(null);
  const [recentTableQueries, setRecentTableQueries] = useState<QueryHistoryEntry[]>([]);
  const [hoveredQueryId, setHoveredQueryId] = useState<number | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [switchingDb, setSwitchingDb] = useState<string | null>(null);
  const [tableDefModal, setTableDefModal] = useState<TableDefinitionsModal | null>(null);
  const [tableDefTab, setTableDefTab] = useState<TableSubCategory>("columns");
  const [tableDefLoading, setTableDefLoading] = useState(false);
  const [itemDefModal, setItemDefModal] = useState<ItemDefinitionModal | null>(null);

  const [tree, setTree] = useState<TreeState>({
    expandedDatabases: new Set(),
    expandedSchemas: new Set(),
    expandedTables: new Set(),
    expandedSubCategories: new Set(),
    loadedSchemas: {},
    loadedTables: {},
    loadedColumns: {},
    loadedConstraints: {},
    loadedIndexes: {},
    loadedTriggers: {},
    loadedRules: {},
    loadedPolicies: {},
  });

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? null;

  // Auto-expand the current database when connecting
  useEffect(() => {
    if (!activeDatabase || !isConnected) return;
    setTree((prev) => {
      const newExpanded = new Set(prev.expandedDatabases);
      newExpanded.add(activeDatabase);
      return {
        ...prev,
        expandedDatabases: newExpanded,
        loadedSchemas: { ...prev.loadedSchemas, [activeDatabase]: schemas },
      };
    });
  }, [activeDatabase, isConnected, schemas]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    if (ctxMenu) {
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }
  }, [ctxMenu]);

  // Close context menu / modals on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setCtxMenu(null);
        setTableDefModal(null);
        setItemDefModal(null);
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  const fqTable = (schema: string, table: string) => `"${schema}"."${table}"`;

  // ── Tree toggle handlers ──

  const toggleDatabase = async (dbName: string) => {
    if (!activeConnectionId) return;
    const isExpanded = tree.expandedDatabases.has(dbName);
    if (isExpanded) {
      setTree((prev) => {
        const newExpanded = new Set(prev.expandedDatabases);
        newExpanded.delete(dbName);
        return { ...prev, expandedDatabases: newExpanded };
      });
      return;
    }
    if (dbName !== activeDatabase) {
      setSwitchingDb(dbName);
      try {
        await switchDatabase(activeConnectionId, dbName);
        const [newSchemas, newSchemaCtx, newDatabases] = await Promise.all([
          getSchemas(activeConnectionId),
          getFullSchema(activeConnectionId),
          getDatabases(activeConnectionId),
        ]);
        setSchemas(newSchemas);
        setSchemaContext(newSchemaCtx);
        setDatabases(newDatabases);
        setActiveDatabase(dbName);
        setTree((prev) => {
          const newExp = new Set(prev.expandedDatabases);
          newExp.add(dbName);
          return { ...prev, expandedDatabases: newExp, loadedSchemas: { ...prev.loadedSchemas, [dbName]: newSchemas } };
        });
      } catch (e) {
        console.error("Failed to switch database:", e);
      } finally {
        setSwitchingDb(null);
      }
      return;
    }
    setTree((prev) => {
      const newExp = new Set(prev.expandedDatabases);
      newExp.add(dbName);
      return { ...prev, expandedDatabases: newExp, loadedSchemas: { ...prev.loadedSchemas, [dbName]: schemas } };
    });
  };

  const toggleSchema = async (dbName: string, schemaName: string) => {
    if (!activeConnectionId) return;
    const key = `${dbName}.${schemaName}`;
    if (tree.expandedSchemas.has(key)) {
      setTree((prev) => { const s = new Set(prev.expandedSchemas); s.delete(key); return { ...prev, expandedSchemas: s }; });
      return;
    }
    if (dbName !== activeDatabase) {
      setSwitchingDb(dbName);
      try {
        await switchDatabase(activeConnectionId, dbName);
        const [ns, nsc, nd] = await Promise.all([getSchemas(activeConnectionId), getFullSchema(activeConnectionId), getDatabases(activeConnectionId)]);
        setSchemas(ns); setSchemaContext(nsc); setDatabases(nd); setActiveDatabase(dbName);
      } catch (e) { console.error(e); setSwitchingDb(null); return; }
      setSwitchingDb(null);
    }
    if (!tree.loadedTables[key]) {
      try {
        const tables = await getTables(activeConnectionId, schemaName);
        setTree((prev) => { const s = new Set(prev.expandedSchemas); s.add(key); return { ...prev, expandedSchemas: s, loadedTables: { ...prev.loadedTables, [key]: tables } }; });
      } catch (e) { console.error(e); }
    } else {
      setTree((prev) => { const s = new Set(prev.expandedSchemas); s.add(key); return { ...prev, expandedSchemas: s }; });
    }
  };

  const toggleTable = (dbName: string, schemaName: string, tableName: string) => {
    const key = `${dbName}.${schemaName}.${tableName}`;
    setTree((prev) => {
      const s = new Set(prev.expandedTables);
      if (s.has(key)) s.delete(key); else s.add(key);
      return { ...prev, expandedTables: s };
    });
  };

  const toggleSubCategory = async (dbName: string, schemaName: string, tableName: string, category: TableSubCategory) => {
    if (!activeConnectionId) return;
    const catKey = `${dbName}.${schemaName}.${tableName}.${category}`;
    const tableKey = `${dbName}.${schemaName}.${tableName}`;

    if (tree.expandedSubCategories.has(catKey)) {
      setTree((prev) => { const s = new Set(prev.expandedSubCategories); s.delete(catKey); return { ...prev, expandedSubCategories: s }; });
      return;
    }

    // Load data for category if not loaded
    const loaderMap: Record<TableSubCategory, { loaded: Record<string, unknown[]>; field: string; fn: () => Promise<unknown[]> }> = {
      columns: { loaded: tree.loadedColumns, field: "loadedColumns", fn: () => getColumns(activeConnectionId!, schemaName, tableName) },
      constraints: { loaded: tree.loadedConstraints, field: "loadedConstraints", fn: () => getConstraints(activeConnectionId!, schemaName, tableName) },
      indexes: { loaded: tree.loadedIndexes, field: "loadedIndexes", fn: () => getIndexes(activeConnectionId!, schemaName, tableName) },
      triggers: { loaded: tree.loadedTriggers, field: "loadedTriggers", fn: () => getTriggers(activeConnectionId!, schemaName, tableName) },
      rules: { loaded: tree.loadedRules, field: "loadedRules", fn: () => getRules(activeConnectionId!, schemaName, tableName) },
      policies: { loaded: tree.loadedPolicies, field: "loadedPolicies", fn: () => getPolicies(activeConnectionId!, schemaName, tableName) },
    };

    const loader = loaderMap[category];
    if (!loader.loaded[tableKey]) {
      try {
        const data = await loader.fn();
        setTree((prev) => {
          const s = new Set(prev.expandedSubCategories);
          s.add(catKey);
          return { ...prev, expandedSubCategories: s, [loader.field]: { ...(prev as unknown as Record<string, Record<string, unknown[]>>)[loader.field], [tableKey]: data } };
        });
      } catch (e) { console.error(e); }
    } else {
      setTree((prev) => { const s = new Set(prev.expandedSubCategories); s.add(catKey); return { ...prev, expandedSubCategories: s }; });
    }
  };

  // ── Open Table Definitions modal ──

  const openTableDefinitions = async (schemaName: string, tableName: string) => {
    if (!activeConnectionId) return;
    setTableDefLoading(true);
    setTableDefTab("columns");
    try {
      const [columns, constraints, indexes, triggers, rules, policies] = await Promise.all([
        getColumns(activeConnectionId, schemaName, tableName),
        getConstraints(activeConnectionId, schemaName, tableName),
        getIndexes(activeConnectionId, schemaName, tableName),
        getTriggers(activeConnectionId, schemaName, tableName),
        getRules(activeConnectionId, schemaName, tableName),
        getPolicies(activeConnectionId, schemaName, tableName),
      ]);
      setTableDefModal({ schema: schemaName, table: tableName, columns, constraints, indexes, triggers, rules, policies });
    } catch (e) {
      console.error(e);
    } finally {
      setTableDefLoading(false);
    }
  };

  // ── Tab operations ──

  const DEFAULT_PAGE_SIZE = 100;

  const openTable = useCallback(
    async (schemaName: string, tableName: string) => {
      if (!activeConnectionId) return;
      const tabId = `data:${schemaName}.${tableName}`;
      const existingTab = tabs.find((t) => t.id === tabId);
      if (existingTab) { setActiveTabId(existingTab.id); return; }
      const newTab: TableTab = { id: tabId, kind: "data", schema: schemaName, table: tableName, data: null, columns: null, loading: true, error: null, page: 0, pageSize: DEFAULT_PAGE_SIZE, totalRows: null, sortColumn: null, sortDirection: null, recentSortColumns: [] };
      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(tabId);
      try {
        const [data, countResult] = await Promise.all([
          getTableData(activeConnectionId, schemaName, tableName, DEFAULT_PAGE_SIZE, 0),
          executeQuery(activeConnectionId, `SELECT COUNT(*) FROM "${schemaName}"."${tableName}"`),
        ]);
        const total = Number(countResult.rows[0]?.[0] ?? 0);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data, totalRows: total, loading: false } : t)));
      } catch (e) {
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, error: String(e), loading: false } : t));
      }
    },
    [activeConnectionId, tabs],
  );

  const closeTab = useCallback(
    (tabId: string) => {
      const idx = tabs.findIndex((t) => t.id === tabId);
      const newTabs = tabs.filter((t) => t.id !== tabId);
      setTabs(newTabs);
      if (activeTabId === tabId) {
        setActiveTabId(newTabs.length > 0 ? newTabs[Math.max(0, idx - 1)].id : null);
      }
    },
    [tabs, activeTabId],
  );

  const refreshTab = useCallback(
    async (tabId: string) => {
      if (!activeConnectionId) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, loading: true, error: null } : t));
      try {
        const offset = tab.page * tab.pageSize;
        const [data, countResult] = await Promise.all([
          getTableData(activeConnectionId, tab.schema, tab.table, tab.pageSize, offset, tab.sortColumn, tab.sortDirection),
          executeQuery(activeConnectionId, `SELECT COUNT(*) FROM "${tab.schema}"."${tab.table}"`),
        ]);
        const total = Number(countResult.rows[0]?.[0] ?? 0);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data, totalRows: total, loading: false } : t)));
      } catch (e) {
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, error: String(e), loading: false } : t));
      }
    },
    [activeConnectionId, tabs],
  );

  const handlePageChange = useCallback(
    async (tabId: string, newPage: number) => {
      if (!activeConnectionId) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      const offset = newPage * tab.pageSize;
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, page: newPage, loading: true, error: null } : t));
      try {
        const data = await getTableData(activeConnectionId, tab.schema, tab.table, tab.pageSize, offset, tab.sortColumn, tab.sortDirection);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data, loading: false } : t)));
      } catch (e) {
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, error: String(e), loading: false } : t));
      }
    },
    [activeConnectionId, tabs],
  );

  const handlePageSizeChange = useCallback(
    async (tabId: string, newSize: number) => {
      if (!activeConnectionId) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, page: 0, pageSize: newSize, loading: true, error: null } : t));
      try {
        const [data, countResult] = await Promise.all([
          getTableData(activeConnectionId, tab.schema, tab.table, newSize, 0, tab.sortColumn, tab.sortDirection),
          executeQuery(activeConnectionId, `SELECT COUNT(*) FROM "${tab.schema}"."${tab.table}"`),
        ]);
        const total = Number(countResult.rows[0]?.[0] ?? 0);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data, totalRows: total, loading: false } : t)));
      } catch (e) {
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, error: String(e), loading: false } : t));
      }
    },
    [activeConnectionId, tabs],
  );

  const handleSortChange = useCallback(
    async (tabId: string, column: string | null, direction: "ASC" | "DESC" | null) => {
      if (!activeConnectionId) return;
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      // Track recent sort columns (most recent first, max 5)
      const updatedRecent = column
        ? [column, ...tab.recentSortColumns.filter((c) => c !== column)].slice(0, 5)
        : tab.recentSortColumns;
      setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, page: 0, sortColumn: column, sortDirection: direction, recentSortColumns: updatedRecent, loading: true, error: null } : t));
      try {
        const data = await getTableData(activeConnectionId, tab.schema, tab.table, tab.pageSize, 0, column, direction);
        setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, data, loading: false } : t)));
      } catch (e) {
        setTabs((prev) => prev.map((t) => t.id === tabId ? { ...t, error: String(e), loading: false } : t));
      }
    },
    [activeConnectionId, tabs],
  );

  const handleDeleteRows = useCallback(
    async (rowIndices: number[]) => {
      if (!activeConnectionId || !activeTab?.data) return;
      const cols = activeTab.data.columns;
      const rows = activeTab.data.rows;
      const deletes: string[] = [];
      for (const idx of rowIndices) {
        const row = rows[idx];
        const conditions = cols
          .map((col, colIdx) => {
            const val = row[colIdx];
            if (val === null) return `"${col.name}" IS NULL`;
            if (typeof val === "number" || typeof val === "boolean") return `"${col.name}" = ${val}`;
            const s = typeof val === "object" ? JSON.stringify(val) : String(val);
            return `"${col.name}" = '${s.replace(/'/g, "''")}'`;
          })
          .join(" AND ");
        deletes.push(`DELETE FROM ${fqTable(activeTab.schema, activeTab.table)} WHERE ${conditions};`);
      }
      try {
        for (const sql of deletes) { await executeQuery(activeConnectionId, sql); }
        await refreshTab(activeTab.id);
      } catch (e) { console.error("Delete failed:", e); }
    },
    [activeConnectionId, activeTab, refreshTab],
  );

  // ── Context menu actions ──

  const handleContextMenu = (e: React.MouseEvent, schemaName: string, table: TableInfo) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, schema: schemaName, table: table.name, sub: null });
    setCountResult(null);
    setRecentTableQueries([]);
    // Load recent queries for this table in background
    if (activeConnectionId) {
      searchTableHistory(activeConnectionId, table.name, 8)
        .then(setRecentTableQueries)
        .catch(() => {});
    }
  };

  const closeMenu = () => setCtxMenu(null);

  const handleCopyName = () => { if (!ctxMenu) return; navigator.clipboard.writeText(ctxMenu.table); closeMenu(); };

  const handleCopySchema = async () => {
    if (!ctxMenu || !activeConnectionId) return;
    try {
      const cols = await getColumns(activeConnectionId, ctxMenu.schema, ctxMenu.table);
      navigator.clipboard.writeText(generateCreateScript(ctxMenu.schema, ctxMenu.table, cols));
    } catch (e) { console.error(e); }
    closeMenu();
  };

  const handleCountRows = async () => {
    if (!ctxMenu || !activeConnectionId) return;
    try {
      const result = await executeQuery(activeConnectionId, `SELECT COUNT(*) FROM ${fqTable(ctxMenu.schema, ctxMenu.table)};`);
      setCountResult(String(result.rows[0]?.[0]));
    } catch { setCountResult("Error"); }
  };

  const handleQueryTool = () => { if (!ctxMenu) return; setPendingSql(`SELECT * FROM ${fqTable(ctxMenu.schema, ctxMenu.table)} LIMIT 100;`); closeMenu(); navigate("/sql"); };

  const handleTableDefinitions = () => {
    if (!ctxMenu) return;
    openTableDefinitions(ctxMenu.schema, ctxMenu.table);
    closeMenu();
  };

  const handleScript = async (type: "SELECT" | "INSERT" | "UPDATE" | "DELETE" | "CREATE") => {
    if (!ctxMenu || !activeConnectionId) return;
    const { schema, table } = ctxMenu;
    let sql: string;
    const cols = await getColumns(activeConnectionId, schema, table);
    if (type === "CREATE") { sql = generateCreateScript(schema, table, cols); }
    else {
      const colNames = cols.map((c) => `"${c.name}"`).join(", ");
      const ft = fqTable(schema, table);
      switch (type) {
        case "SELECT": sql = `SELECT ${colNames}\nFROM ${ft}\nLIMIT 100;`; break;
        case "INSERT": sql = `INSERT INTO ${ft} (${colNames})\nVALUES (${cols.map(() => "?").join(", ")});`; break;
        case "UPDATE": { const pk = cols.find((c) => c.is_primary_key); const sc = cols.filter((c) => !c.is_primary_key).map((c) => `"${c.name}" = ?`).join(",\n  "); sql = `UPDATE ${ft}\nSET ${sc}\nWHERE ${pk ? `"${pk.name}" = ?` : "/* condition */"};`; break; }
        case "DELETE": { const pk = cols.find((c) => c.is_primary_key); sql = `DELETE FROM ${ft}\nWHERE ${pk ? `"${pk.name}" = ?` : "/* condition */"};`; break; }
      }
    }
    setPendingSql(sql); closeMenu(); navigate("/sql");
  };

  const handleExport = async (format: "csv" | "sql" | "html" | "json") => {
    if (!ctxMenu || !activeConnectionId) return;
    try {
      const data = await getTableData(activeConnectionId, ctxMenu.schema, ctxMenu.table, 10000);
      const content = formatExport(format, ctxMenu.schema, ctxMenu.table, data);
      await exportFile(content, `${ctxMenu.table}.${format}`);
    } catch (e) { console.error("Export failed:", e); }
    closeMenu();
  };

  const handleDeleteTable = async () => {
    if (!ctxMenu || !activeConnectionId) return;
    const { schema, table } = ctxMenu;
    if (!window.confirm(`Are you sure you want to drop "${schema}"."${table}"? This cannot be undone.`)) { closeMenu(); return; }
    try {
      await executeQuery(activeConnectionId, `DROP TABLE ${fqTable(schema, table)};`);
      for (const prefix of ["data:", "details:"]) {
        const tid = `${prefix}${schema}.${table}`;
        if (tabs.find((t) => t.id === tid)) closeTab(tid);
      }
      if (activeDatabase) {
        const sk = `${activeDatabase}.${schema}`;
        const updated = await getTables(activeConnectionId, schema);
        setTree((prev) => ({ ...prev, loadedTables: { ...prev.loadedTables, [sk]: updated } }));
      }
    } catch (e) { console.error("Drop failed:", e); }
    closeMenu();
  };

  // Load saved connections when not connected
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected) {
      listConnections().then(setConnections).catch(() => {});
    }
  }, [isConnected, setConnections]);

  const handleConnectFromList = async (connId: string) => {
    const conn = connections.find((c) => c.id === connId);
    if (!conn) return;
    setConnectingId(connId);
    setConnectError(null);
    const input: ConnectionInput = { ...conn, port: conn.port, password: "" };
    try {
      await connect(input);
      connectTo(connId);
      const [newSchemas, schemaCtx, dbs] = await Promise.all([
        getSchemas(connId),
        getFullSchema(connId),
        getDatabases(connId),
      ]);
      setSchemas(newSchemas);
      setSchemaContext(schemaCtx);
      setDatabases(dbs);
      const currentDb = dbs.find((d) => d.is_current);
      setActiveDatabase(currentDb?.name ?? conn.database);
    } catch (e) {
      setConnectError(String(e));
    } finally {
      setConnectingId(null);
    }
  };

  if (!isConnected) {
    return (
      <div style={{ height: "100%", overflowY: "auto" }}>
        <div style={{ maxWidth: "520px", margin: "0 auto", padding: "48px 32px" }}>
          <div style={{ marginBottom: "28px" }}>
            <h2 style={{ fontSize: "16px", fontWeight: 600, color: "var(--color-text-primary)", marginBottom: "6px" }}>
              Database Explorer
            </h2>
            <p style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
              Select a connection to browse databases, schemas, and tables.
            </p>
          </div>

          {connectError && (
            <div style={{
              display: "flex", alignItems: "flex-start", gap: "10px",
              borderRadius: "10px", padding: "12px 14px", fontSize: "12px",
              marginBottom: "16px", backgroundColor: "rgba(239,68,68,0.1)",
              color: "var(--color-danger)", lineHeight: 1.5,
            }}>
              <AlertCircle size={14} style={{ marginTop: "2px", flexShrink: 0 }} />
              <span style={{ wordBreak: "break-all" }}>{connectError}</span>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            {connections.map((conn) => {
              const isConnecting = connectingId === conn.id;
              return (
                <button
                  key={conn.id}
                  onClick={() => handleConnectFromList(conn.id)}
                  disabled={!!connectingId}
                  style={{
                    display: "flex", alignItems: "center", gap: "14px",
                    borderRadius: "12px", border: "1px solid var(--color-border)",
                    backgroundColor: "var(--color-bg-secondary)", padding: "16px 20px",
                    cursor: connectingId ? "default" : "pointer",
                    opacity: connectingId && !isConnecting ? 0.5 : 1,
                    transition: "background-color 0.15s ease, border-color 0.15s ease",
                    textAlign: "left", width: "100%",
                  }}
                  onMouseEnter={(e) => { if (!connectingId) e.currentTarget.style.borderColor = "var(--color-accent)"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--color-border)"; }}
                >
                  <div style={{
                    width: "10px", height: "10px", borderRadius: "50%", flexShrink: 0,
                    backgroundColor: conn.color || "var(--color-accent)",
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--color-text-primary)" }}>
                      {conn.name}
                    </div>
                    <div style={{ fontSize: "11px", color: "var(--color-text-muted)", marginTop: "3px" }}>
                      {conn.user}@{conn.host}:{conn.port}/{conn.database}
                    </div>
                  </div>
                  <div style={{
                    display: "flex", alignItems: "center", gap: "6px",
                    fontSize: "12px", color: isConnecting ? "var(--color-accent)" : "var(--color-text-muted)",
                    flexShrink: 0,
                  }}>
                    <Plug size={12} />
                    {isConnecting ? "Connecting..." : "Connect"}
                  </div>
                </button>
              );
            })}

            {connections.length === 0 && (
              <div style={{
                borderRadius: "12px", border: "1px dashed var(--color-border)",
                padding: "48px 20px", textAlign: "center",
              }}>
                <Database size={24} style={{ color: "var(--color-text-muted)", marginBottom: "12px", opacity: 0.5 }} />
                <p style={{ fontSize: "13px", color: "var(--color-text-muted)" }}>
                  No saved connections. Go to <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>Home</span> to add one.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* ── Database tree sidebar ── */}
      <div style={{ display: "flex", width: "280px", flexDirection: "column", borderRight: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)" }}>
        <div style={{ borderBottom: "1px solid var(--color-border)", padding: "10px 16px", fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
          Object Explorer
        </div>
        <div style={{ flex: 1, overflow: "auto", paddingTop: "4px", paddingBottom: "4px" }}>
          {databases.map((db) => {
            const isCurrentDb = db.name === activeDatabase;
            const isDbExpanded = tree.expandedDatabases.has(db.name);
            const isSwitching = switchingDb === db.name;
            const dbSchemas = tree.loadedSchemas[db.name] || [];

            return (
              <div key={db.name}>
                {/* Database row */}
                <TreeRow depth={0} expanded={isDbExpanded} onClick={() => toggleDatabase(db.name)} icon={<Database size={14} style={{ color: isCurrentDb ? "var(--color-accent)" : "var(--color-text-muted)" }} />} label={isSwitching ? `${db.name} (connecting...)` : db.name} bold={isCurrentDb} accent={isCurrentDb} dimmed={!!isSwitching} />

                {isDbExpanded && dbSchemas.map((schema) => {
                  const schemaKey = `${db.name}.${schema.name}`;
                  const isSchemaExpanded = tree.expandedSchemas.has(schemaKey);
                  const schemaTables = tree.loadedTables[schemaKey] || [];

                  return (
                    <div key={schemaKey}>
                      <TreeRow depth={1} expanded={isSchemaExpanded} onClick={() => toggleSchema(db.name, schema.name)} icon={isSchemaExpanded ? <FolderOpen size={13} style={{ color: "var(--color-info)" }} /> : <Folder size={13} style={{ color: "var(--color-info)" }} />} label={schema.name} />

                      {isSchemaExpanded && schemaTables.map((table) => {
                        const tableKey = `${db.name}.${schema.name}.${table.name}`;
                        const isTableExpanded = tree.expandedTables.has(tableKey);
                        const isOpen = tabs.some((t) => t.schema === schema.name && t.table === table.name);

                        return (
                          <div key={tableKey}>
                            {/* Table row: chevron + clickable name */}
                            <div style={{ display: "flex", alignItems: "center", padding: "3px 8px 3px 44px", ...(activeTab?.schema === schema.name && activeTab?.table === table.name ? { backgroundColor: "rgba(62,207,142,0.08)" } : {}) }}>
                              <button onClick={() => toggleTable(db.name, schema.name, table.name)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: "16px", height: "16px", flexShrink: 0, background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--color-text-muted)" }}>
                                {isTableExpanded ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
                              </button>
                              <button
                                onClick={() => openTable(schema.name, table.name)}
                                onContextMenu={(e) => handleContextMenu(e, schema.name, table)}
                                style={{ display: "flex", flex: 1, alignItems: "center", gap: "6px", textAlign: "left", fontSize: "12px", background: "none", border: "none", cursor: "pointer", padding: "1px 0", minWidth: 0, color: activeTab?.schema === schema.name && activeTab?.table === table.name ? "var(--color-accent)" : isOpen ? "var(--color-text-primary)" : "var(--color-text-secondary)" }}
                              >
                                <Table2 size={12} style={{ flexShrink: 0 }} />
                                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{table.name}</span>
                              </button>
                              <span style={{ fontSize: "10px", color: "var(--color-text-muted)", flexShrink: 0, opacity: 0.7 }}>{table.size}</span>
                            </div>

                            {/* Sub-categories under table */}
                            {isTableExpanded && SUB_CATEGORIES.map((cat) => {
                              const catKey = `${tableKey}.${cat.key}`;
                              const isCatExpanded = tree.expandedSubCategories.has(catKey);
                              const CatIcon = cat.icon;

                              return (
                                <div key={catKey}>
                                  <TreeRow depth={4} expanded={isCatExpanded} onClick={() => toggleSubCategory(db.name, schema.name, table.name, cat.key)} icon={<CatIcon size={11} style={{ color: "var(--color-text-muted)" }} />} label={cat.label} small />

                                  {isCatExpanded && renderSubCategoryItems(tree, tableKey, cat.key, schema.name, table.name)}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                      {isSchemaExpanded && schemaTables.length === 0 && <TreeEmpty depth={3} text="No tables" />}
                    </div>
                  );
                })}
                {isDbExpanded && dbSchemas.length === 0 && <TreeEmpty depth={1} text="Loading schemas..." />}
              </div>
            );
          })}
          {databases.length === 0 && <TreeEmpty depth={0} text="No databases found" />}
        </div>
      </div>

      {/* ── Main content: tabs + data ── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tabs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)", flexShrink: 0, overflowX: "auto" }}>
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTabId(tab.id)} style={{ display: "flex", alignItems: "center", gap: "8px", borderTop: "none", borderBottom: "none", borderLeft: "none", borderRight: "1px solid var(--color-border)", padding: "8px 16px", fontSize: "12px", backgroundColor: tab.id === activeTabId ? "var(--color-bg-primary)" : "transparent", color: tab.id === activeTabId ? "var(--color-text-primary)" : "var(--color-text-muted)", cursor: "pointer", whiteSpace: "nowrap", transition: "background-color 0.15s ease" }}>
                <Table2 size={12} style={{ flexShrink: 0 }} />
                <span>{tab.schema}.{tab.table}</span>
                <X size={12} style={{ flexShrink: 0 }} onClick={(e) => { e.stopPropagation(); closeTab(tab.id); }} />
              </button>
            ))}
          </div>
        )}
        <div style={{ flex: 1, overflow: "hidden" }}>
          {activeTab ? (
            activeTab.loading ? <CenteredMessage text="Loading..." /> :
            activeTab.error ? <CenteredMessage text={activeTab.error} danger /> :
            activeTab.data ? <DataGrid columns={activeTab.data.columns} rows={activeTab.data.rows} rowCount={activeTab.data.row_count} tableName={activeTab.table} schemaName={activeTab.schema} onDeleteRows={handleDeleteRows} totalRows={activeTab.totalRows} page={activeTab.page} pageSize={activeTab.pageSize} rowOffset={activeTab.page * activeTab.pageSize} onPageChange={(p) => handlePageChange(activeTab.id, p)} onPageSizeChange={(s) => handlePageSizeChange(activeTab.id, s)} sortColumn={activeTab.sortColumn} sortDirection={activeTab.sortDirection} onSortChange={(col, dir) => handleSortChange(activeTab.id, col, dir)} recentSortColumns={activeTab.recentSortColumns} /> : null
          ) : <CenteredMessage text="Select a table to view its data" />}
        </div>
      </div>

      {/* ── Context menu ── */}
      {ctxMenu && (
        <div ref={menuRef} style={{ position: "fixed", top: ctxMenu.y, left: ctxMenu.x, zIndex: 9999, minWidth: "200px", backgroundColor: "#1a1a1a", border: "1px solid var(--color-border-light)", borderRadius: "8px", padding: "4px 0", boxShadow: "0 8px 30px rgba(0,0,0,0.5)", fontSize: "13px" }}>
          <MenuItem icon={<Copy size={14} />} label="Copy name" onClick={handleCopyName} />
          <MenuItem icon={<FileCode2 size={14} />} label="Copy table schema" onClick={handleCopySchema} />
          <MenuDivider />
          <MenuItem icon={<Info size={14} />} label="Table Definitions" onClick={handleTableDefinitions} />
          <MenuItem icon={<Hash size={14} />} label={countResult !== null ? `Count: ${countResult}` : "Count Rows"} onClick={handleCountRows} />
          <div style={{ position: "relative" }} onMouseEnter={() => setCtxMenu((p) => p ? { ...p, sub: "querytool" } : null)} onMouseLeave={() => setCtxMenu((p) => p ? { ...p, sub: null } : null)}>
            <div onClick={handleQueryTool} style={{ cursor: "pointer" }}>
              <MenuItemWithArrow icon={<Terminal size={14} />} label="Query Tool" />
            </div>
            {ctxMenu.sub === "querytool" && (
              <SubMenu>
                <MenuItem label="SELECT * LIMIT 100" onClick={handleQueryTool} />
                {recentTableQueries.length > 0 && <MenuDivider />}
                {recentTableQueries.length > 0 && (
                  <div style={{ padding: "4px 14px 2px", fontSize: "10px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>Recent queries</div>
                )}
                {recentTableQueries.map((q) => (
                  <div key={q.id} style={{ position: "relative" }} onMouseEnter={() => setHoveredQueryId(q.id)} onMouseLeave={() => setHoveredQueryId(null)}>
                    <MenuItem label={q.sql.replace(/\s+/g, " ").slice(0, 45) + (q.sql.length > 45 ? "..." : "")} onClick={() => { setPendingSql(q.sql, true); closeMenu(); navigate("/sql"); }} />
                    {hoveredQueryId === q.id && (
                      <div style={{
                        position: "absolute", left: "100%", top: 0, marginLeft: "4px",
                        width: "320px", maxHeight: "240px", overflow: "auto",
                        backgroundColor: "#1a1a1a", border: "1px solid var(--color-border-light)",
                        borderRadius: "8px", padding: "12px 14px",
                        boxShadow: "0 8px 30px rgba(0,0,0,0.5)", zIndex: 1,
                      }}>
                        <pre style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.6, margin: 0 }}>{q.sql}</pre>
                        <div style={{ marginTop: "8px", fontSize: "11px", color: "var(--color-text-muted)" }}>
                          {q.row_count} row{q.row_count !== 1 ? "s" : ""} &middot; {q.execution_time_ms}ms &middot; {new Date(q.created_at).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </SubMenu>
            )}
          </div>
          <MenuDivider />
          <div style={{ position: "relative" }} onMouseEnter={() => setCtxMenu((p) => p ? { ...p, sub: "scripts" } : null)} onMouseLeave={() => setCtxMenu((p) => p ? { ...p, sub: null } : null)}>
            <MenuItemWithArrow icon={<FileCode2 size={14} />} label="Scripts" />
            {ctxMenu.sub === "scripts" && (
              <SubMenu>
                <MenuItem label="SELECT Script" onClick={() => handleScript("SELECT")} />
                <MenuItem label="INSERT Script" onClick={() => handleScript("INSERT")} />
                <MenuItem label="UPDATE Script" onClick={() => handleScript("UPDATE")} />
                <MenuItem label="DELETE Script" onClick={() => handleScript("DELETE")} />
                <MenuDivider />
                <MenuItem label="CREATE Script" onClick={() => handleScript("CREATE")} />
              </SubMenu>
            )}
          </div>
          <div style={{ position: "relative" }} onMouseEnter={() => setCtxMenu((p) => p ? { ...p, sub: "export" } : null)} onMouseLeave={() => setCtxMenu((p) => p ? { ...p, sub: null } : null)}>
            <MenuItemWithArrow icon={<Download size={14} />} label="Export data" />
            {ctxMenu.sub === "export" && (
              <SubMenu>
                <MenuItem label="Export as CSV" onClick={() => handleExport("csv")} />
                <MenuItem label="Export as SQL" onClick={() => handleExport("sql")} />
                <MenuItem label="Export as HTML" onClick={() => handleExport("html")} />
                <MenuItem label="Export as JSON" onClick={() => handleExport("json")} />
              </SubMenu>
            )}
          </div>
          <MenuDivider />
          <MenuItem icon={<Trash2 size={14} />} label="Delete table" onClick={handleDeleteTable} danger />
        </div>
      )}

      {/* ── Table Definitions Modal ── */}
      {(tableDefModal || tableDefLoading) && (
        <ModalOverlay onClose={() => setTableDefModal(null)}>
          {tableDefLoading ? (
            <div style={{ padding: "48px", textAlign: "center", color: "var(--color-text-muted)" }}>Loading table definitions...</div>
          ) : tableDefModal && (
            <div style={{ display: "flex", flexDirection: "column", width: "min(900px, 90vw)", maxHeight: "80vh", borderRadius: "14px", backgroundColor: "var(--color-bg-secondary)", border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
              {/* Header */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
                <div>
                  <h2 style={{ fontSize: "15px", fontWeight: 600, color: "var(--color-text-primary)" }}>{tableDefModal.schema}.{tableDefModal.table}</h2>
                  <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>Table Definitions</span>
                </div>
                <button onClick={() => setTableDefModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: "4px" }}><X size={16} /></button>
              </div>

              {/* Tabs */}
              <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)", padding: "0 16px", gap: "0", flexShrink: 0 }}>
                {SUB_CATEGORIES.map((cat) => {
                  const count = (tableDefModal as unknown as Record<string, unknown[]>)[cat.key]?.length ?? 0;
                  return (
                    <button key={cat.key} onClick={() => setTableDefTab(cat.key)} style={{ padding: "10px 14px", fontSize: "12px", fontWeight: tableDefTab === cat.key ? 600 : 400, color: tableDefTab === cat.key ? "var(--color-accent)" : "var(--color-text-muted)", borderBottom: tableDefTab === cat.key ? "2px solid var(--color-accent)" : "2px solid transparent", background: "none", border: "none", borderBottomStyle: "solid", cursor: "pointer", transition: "color 0.15s ease" }}>
                      {cat.label} ({count})
                    </button>
                  );
                })}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
                {tableDefTab === "columns" && <ColumnsDefTable columns={tableDefModal.columns} />}
                {tableDefTab === "constraints" && <ConstraintsDefTable items={tableDefModal.constraints} />}
                {tableDefTab === "indexes" && <IndexesDefTable items={tableDefModal.indexes} />}
                {tableDefTab === "triggers" && <TriggersDefTable items={tableDefModal.triggers} />}
                {tableDefTab === "rules" && <RulesDefTable items={tableDefModal.rules} />}
                {tableDefTab === "policies" && <PoliciesDefTable items={tableDefModal.policies} />}
              </div>
            </div>
          )}
        </ModalOverlay>
      )}

      {/* ── Item Definition Modal (single item) ── */}
      {itemDefModal && (
        <ModalOverlay onClose={() => setItemDefModal(null)}>
          <div style={{ display: "flex", flexDirection: "column", width: "min(700px, 85vw)", maxHeight: "70vh", borderRadius: "14px", backgroundColor: "var(--color-bg-secondary)", border: "1px solid var(--color-border)", overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.6)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid var(--color-border)" }}>
              <h2 style={{ fontSize: "14px", fontWeight: 600, color: "var(--color-text-primary)" }}>{itemDefModal.title}</h2>
              <button onClick={() => setItemDefModal(null)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--color-text-muted)", padding: "4px" }}><X size={16} /></button>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "16px 20px" }}>
              <pre style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--color-text-primary)", whiteSpace: "pre-wrap", lineHeight: 1.7 }}>{itemDefModal.definition}</pre>
            </div>
          </div>
        </ModalOverlay>
      )}
    </div>
  );

  // ── Render sub-category items in tree ──

  function renderSubCategoryItems(treeState: TreeState, tableKey: string, category: TableSubCategory, _schemaName: string, _tableName: string) {
    const depth = 5;
    switch (category) {
      case "columns": {
        const items = treeState.loadedColumns[tableKey];
        if (!items) return <TreeEmpty depth={depth} text="Loading..." />;
        if (items.length === 0) return <TreeEmpty depth={depth} text="No columns" />;
        return items.map((col) => (
          <TreeLeaf key={col.name} depth={depth} label={col.name} suffix={col.data_type}
            icon={col.is_primary_key ? <Key size={9} style={{ color: "var(--color-warning)" }} /> : col.is_foreign_key ? <Link2 size={9} style={{ color: "var(--color-info)" }} /> : undefined}
            onClick={() => setItemDefModal({ title: col.name, definition: formatColumnDef(col) })} />
        ));
      }
      case "constraints": {
        const items = treeState.loadedConstraints[tableKey];
        if (!items) return <TreeEmpty depth={depth} text="Loading..." />;
        if (items.length === 0) return <TreeEmpty depth={depth} text="No constraints" />;
        return items.map((c) => (
          <TreeLeaf key={c.name} depth={depth} label={c.name} suffix={c.constraint_type}
            onClick={() => setItemDefModal({ title: c.name, definition: c.definition })} />
        ));
      }
      case "indexes": {
        const items = treeState.loadedIndexes[tableKey];
        if (!items) return <TreeEmpty depth={depth} text="Loading..." />;
        if (items.length === 0) return <TreeEmpty depth={depth} text="No indexes" />;
        return items.map((i) => (
          <TreeLeaf key={i.name} depth={depth} label={i.name} suffix={`${i.index_type}${i.is_unique ? " UNIQUE" : ""}`}
            onClick={() => setItemDefModal({ title: i.name, definition: i.definition })} />
        ));
      }
      case "triggers": {
        const items = treeState.loadedTriggers[tableKey];
        if (!items) return <TreeEmpty depth={depth} text="Loading..." />;
        if (items.length === 0) return <TreeEmpty depth={depth} text="No triggers" />;
        return items.map((t) => (
          <TreeLeaf key={t.name} depth={depth} label={t.name} suffix={`${t.timing} ${t.event}`}
            onClick={() => setItemDefModal({ title: t.name, definition: t.definition })} />
        ));
      }
      case "rules": {
        const items = treeState.loadedRules[tableKey];
        if (!items) return <TreeEmpty depth={depth} text="Loading..." />;
        if (items.length === 0) return <TreeEmpty depth={depth} text="No rules" />;
        return items.map((r) => (
          <TreeLeaf key={r.name} depth={depth} label={r.name} suffix={r.event}
            onClick={() => setItemDefModal({ title: r.name, definition: r.definition })} />
        ));
      }
      case "policies": {
        const items = treeState.loadedPolicies[tableKey];
        if (!items) return <TreeEmpty depth={depth} text="Loading..." />;
        if (items.length === 0) return <TreeEmpty depth={depth} text="No policies" />;
        return items.map((p) => (
          <TreeLeaf key={p.name} depth={depth} label={p.name} suffix={p.command}
            onClick={() => setItemDefModal({ title: p.name, definition: formatPolicyDef(p) })} />
        ));
      }
    }
  }
}

// ── Tree helper components ──

function TreeRow({ depth, expanded, onClick, icon, label, bold, accent, dimmed, small }: {
  depth: number; expanded: boolean; onClick: () => void; icon: React.ReactNode; label: string;
  bold?: boolean; accent?: boolean; dimmed?: boolean; small?: boolean;
}) {
  const pl = 10 + depth * 16;
  return (
    <button onClick={onClick} style={{
      display: "flex", width: "100%", alignItems: "center", gap: "5px",
      padding: small ? `2px 8px 2px ${pl}px` : `5px 8px 5px ${pl}px`,
      fontSize: small ? "11px" : "13px", fontWeight: bold ? 500 : 400,
      color: accent ? "var(--color-accent)" : "var(--color-text-secondary)",
      background: "none", border: "none", cursor: "pointer",
      opacity: dimmed ? 0.5 : 1, transition: "background-color 0.15s ease",
    }}>
      {expanded ? <ChevronDown size={small ? 9 : 11} style={{ flexShrink: 0 }} /> : <ChevronRight size={small ? 9 : 11} style={{ flexShrink: 0 }} />}
      <span style={{ flexShrink: 0 }}>{icon}</span>
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>{label}</span>
    </button>
  );
}

function TreeLeaf({ depth, label, suffix, icon, onClick }: {
  depth: number; label: string; suffix?: string; icon?: React.ReactNode; onClick?: () => void;
}) {
  const pl = 10 + depth * 16 + 16; // extra indent (no chevron)
  return (
    <button onClick={onClick} style={{
      display: "flex", width: "100%", alignItems: "center", gap: "5px",
      padding: `2px 8px 2px ${pl}px`, fontSize: "11px",
      color: "var(--color-text-muted)", background: "none", border: "none",
      cursor: onClick ? "pointer" : "default", transition: "background-color 0.1s ease",
    }}
    onMouseEnter={(e) => { if (onClick) (e.currentTarget).style.backgroundColor = "rgba(255,255,255,0.03)"; }}
    onMouseLeave={(e) => { (e.currentTarget).style.backgroundColor = "transparent"; }}
    >
      {icon && <span style={{ flexShrink: 0 }}>{icon}</span>}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, textAlign: "left" }}>{label}</span>
      {suffix && <span style={{ fontSize: "10px", color: "var(--color-text-muted)", flexShrink: 0, opacity: 0.6 }}>{suffix}</span>}
    </button>
  );
}

function TreeEmpty({ depth, text }: { depth: number; text: string }) {
  return <div style={{ padding: `3px 8px 3px ${10 + depth * 16 + 16}px`, fontSize: "11px", color: "var(--color-text-muted)", opacity: 0.6 }}>{text}</div>;
}

function CenteredMessage({ text, danger }: { text: string; danger?: boolean }) {
  return <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: "14px", color: danger ? "var(--color-danger)" : "var(--color-text-muted)", padding: "32px" }}>{text}</div>;
}

// ── Modal overlay ──

function ModalOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "fixed", inset: 0, zIndex: 10000, display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.6)", backdropFilter: "blur(2px)" }}>
      {children}
    </div>
  );
}

// ── Definition table components for modal tabs ──

function ColumnsDefTable({ columns }: { columns: ColumnInfo[] }) {
  if (columns.length === 0) return <EmptyState text="No columns" />;
  return (
    <DefTable headers={["Column", "Type", "Nullable", "Default", "Key"]}>
      {columns.map((col) => (
        <DefRow key={col.name} cells={[
          <span style={{ display: "flex", alignItems: "center", gap: "6px", fontFamily: "monospace", fontWeight: 500 }}>
            {col.is_primary_key && <Key size={10} style={{ color: "var(--color-warning)" }} />}
            {col.is_foreign_key && !col.is_primary_key && <Link2 size={10} style={{ color: "var(--color-info)" }} />}
            {col.name}
          </span>,
          <span style={{ fontFamily: "monospace" }}>{col.data_type}</span>,
          col.is_nullable ? "YES" : <span style={{ color: "var(--color-warning)" }}>NO</span>,
          <span style={{ fontFamily: "monospace", fontSize: "11px", opacity: col.column_default ? 1 : 0.4 }}>{col.column_default || "-"}</span>,
          col.is_primary_key ? "PK" : col.is_foreign_key ? <span style={{ color: "var(--color-info)" }}>FK → {col.foreign_table}.{col.foreign_column}</span> : "-",
        ]} />
      ))}
    </DefTable>
  );
}

function ConstraintsDefTable({ items }: { items: ConstraintInfo[] }) {
  if (items.length === 0) return <EmptyState text="No constraints" />;
  return (
    <DefTable headers={["Name", "Type", "Columns", "Definition"]}>
      {items.map((c) => (
        <DefRow key={c.name} cells={[
          <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{c.name}</span>,
          c.constraint_type,
          c.columns.join(", "),
          <span style={{ fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all" }}>{c.definition}</span>,
        ]} />
      ))}
    </DefTable>
  );
}

function IndexesDefTable({ items }: { items: IndexInfo[] }) {
  if (items.length === 0) return <EmptyState text="No indexes" />;
  return (
    <DefTable headers={["Name", "Type", "Unique", "Columns", "Size"]}>
      {items.map((i) => (
        <DefRow key={i.name} cells={[
          <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{i.name}</span>,
          i.index_type,
          i.is_unique ? "YES" : "NO",
          i.columns,
          i.size,
        ]} />
      ))}
    </DefTable>
  );
}

function TriggersDefTable({ items }: { items: TriggerInfo[] }) {
  if (items.length === 0) return <EmptyState text="No triggers" />;
  return (
    <DefTable headers={["Name", "Timing", "Event", "Type", "Function", "Enabled"]}>
      {items.map((t) => (
        <DefRow key={t.name} cells={[
          <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{t.name}</span>,
          t.timing,
          t.event,
          t.orientation,
          <span style={{ fontFamily: "monospace", fontSize: "11px" }}>{t.function_name}</span>,
          t.enabled ? <span style={{ color: "var(--color-accent)" }}>YES</span> : <span style={{ color: "var(--color-danger)" }}>NO</span>,
        ]} />
      ))}
    </DefTable>
  );
}

function RulesDefTable({ items }: { items: RuleInfo[] }) {
  if (items.length === 0) return <EmptyState text="No rules" />;
  return (
    <DefTable headers={["Name", "Event", "Instead", "Definition"]}>
      {items.map((r) => (
        <DefRow key={r.name} cells={[
          <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{r.name}</span>,
          r.event,
          r.is_instead ? "YES" : "NO",
          <span style={{ fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all" }}>{r.definition}</span>,
        ]} />
      ))}
    </DefTable>
  );
}

function PoliciesDefTable({ items }: { items: PolicyInfo[] }) {
  if (items.length === 0) return <EmptyState text="No RLS policies" />;
  return (
    <DefTable headers={["Name", "Command", "Permissive", "Roles", "USING", "WITH CHECK"]}>
      {items.map((p) => (
        <DefRow key={p.name} cells={[
          <span style={{ fontFamily: "monospace", fontWeight: 500 }}>{p.name}</span>,
          p.command,
          p.permissive ? "YES" : "NO",
          p.roles.join(", "),
          <span style={{ fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all" }}>{p.using_expr || "-"}</span>,
          <span style={{ fontFamily: "monospace", fontSize: "11px", wordBreak: "break-all" }}>{p.check_expr || "-"}</span>,
        ]} />
      ))}
    </DefTable>
  );
}

function DefTable({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div style={{ borderRadius: "8px", border: "1px solid var(--color-border)", overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${headers.length}, 1fr)`, padding: "8px 14px", fontSize: "11px", fontWeight: 600, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-tertiary)" }}>
        {headers.map((h) => <span key={h}>{h}</span>)}
      </div>
      {children}
    </div>
  );
}

function DefRow({ cells }: { cells: React.ReactNode[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cells.length}, 1fr)`, padding: "8px 14px", fontSize: "12px", borderBottom: "1px solid var(--color-border)", color: "var(--color-text-primary)", gap: "4px", alignItems: "start" }}>
      {cells.map((cell, i) => <span key={i}>{cell}</span>)}
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ padding: "32px", textAlign: "center", fontSize: "13px", color: "var(--color-text-muted)" }}>{text}</div>;
}

// ── Context menu helper components ──

function MenuItem({ icon, label, onClick, danger }: { icon?: React.ReactNode; label: string; onClick?: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} style={{ display: "flex", width: "100%", alignItems: "center", gap: "10px", padding: "8px 14px", fontSize: "13px", color: danger ? "var(--color-danger)" : "var(--color-text-primary)", background: "none", border: "none", cursor: "pointer", textAlign: "left", transition: "background-color 0.1s ease" }}
      onMouseEnter={(e) => { (e.currentTarget).style.backgroundColor = "var(--color-bg-hover)"; }}
      onMouseLeave={(e) => { (e.currentTarget).style.backgroundColor = "transparent"; }}>
      {icon && <span style={{ flexShrink: 0, color: danger ? "var(--color-danger)" : "var(--color-text-muted)" }}>{icon}</span>}
      <span>{label}</span>
    </button>
  );
}

function MenuItemWithArrow({ icon, label }: { icon?: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", width: "100%", alignItems: "center", gap: "10px", padding: "8px 14px", fontSize: "13px", color: "var(--color-text-primary)", cursor: "pointer", transition: "background-color 0.1s ease" }}
      onMouseEnter={(e) => { (e.currentTarget).style.backgroundColor = "var(--color-bg-hover)"; }}
      onMouseLeave={(e) => { (e.currentTarget).style.backgroundColor = "transparent"; }}>
      {icon && <span style={{ flexShrink: 0, color: "var(--color-text-muted)" }}>{icon}</span>}
      <span style={{ flex: 1 }}>{label}</span>
      <ChevronRight size={12} style={{ color: "var(--color-text-muted)" }} />
    </div>
  );
}

function SubMenu({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", left: "100%", top: 0, minWidth: "180px", backgroundColor: "#1a1a1a", border: "1px solid var(--color-border-light)", borderRadius: "8px", padding: "4px 0", boxShadow: "0 8px 30px rgba(0,0,0,0.5)" }}>
      {children}
    </div>
  );
}

function MenuDivider() {
  return <div style={{ height: "1px", backgroundColor: "var(--color-border)", margin: "4px 0" }} />;
}

// ── Format helpers ──

function formatColumnDef(col: ColumnInfo): string {
  const lines: string[] = [];
  lines.push(`Column:    ${col.name}`);
  lines.push(`Type:      ${col.data_type}`);
  lines.push(`Nullable:  ${col.is_nullable ? "YES" : "NO"}`);
  lines.push(`Default:   ${col.column_default || "None"}`);
  lines.push(`Position:  ${col.ordinal_position}`);
  if (col.is_primary_key) lines.push(`Key:       PRIMARY KEY`);
  if (col.is_foreign_key) lines.push(`FK:        → ${col.foreign_table}.${col.foreign_column}`);
  return lines.join("\n");
}

function formatPolicyDef(p: PolicyInfo): string {
  const lines: string[] = [];
  lines.push(`Policy:      ${p.name}`);
  lines.push(`Command:     ${p.command}`);
  lines.push(`Permissive:  ${p.permissive ? "YES" : "NO"}`);
  lines.push(`Roles:       ${p.roles.join(", ")}`);
  if (p.using_expr) lines.push(`\nUSING:\n  ${p.using_expr}`);
  if (p.check_expr) lines.push(`\nWITH CHECK:\n  ${p.check_expr}`);
  return lines.join("\n");
}

function generateCreateScript(schema: string, table: string, cols: ColumnInfo[]): string {
  const lines = cols.map((c) => {
    let line = `  "${c.name}" ${c.data_type}`;
    if (!c.is_nullable) line += " NOT NULL";
    if (c.column_default) line += ` DEFAULT ${c.column_default}`;
    return line;
  });
  const pks = cols.filter((c) => c.is_primary_key).map((c) => `"${c.name}"`);
  if (pks.length > 0) lines.push(`  PRIMARY KEY (${pks.join(", ")})`);
  const fks = cols.filter((c) => c.is_foreign_key && c.foreign_table && c.foreign_column);
  for (const fk of fks) lines.push(`  FOREIGN KEY ("${fk.name}") REFERENCES "${fk.foreign_table}"("${fk.foreign_column}")`);
  return `CREATE TABLE "${schema}"."${table}" (\n${lines.join(",\n")}\n);`;
}

function formatExport(format: "csv" | "sql" | "html" | "json", schema: string, table: string, data: QueryResult): string {
  const cols = data.columns;
  const rows = data.rows;

  if (format === "json") {
    const objects = rows.map((row) => {
      const obj: Record<string, unknown> = {};
      cols.forEach((col, i) => { obj[col.name] = row[i]; });
      return obj;
    });
    return JSON.stringify(objects, null, 2);
  }

  if (format === "csv") {
    const header = cols.map((c) => `"${c.name}"`).join(",");
    const body = rows.map((row) => row.map((val) => { if (val === null) return ""; const s = typeof val === "object" ? JSON.stringify(val) : String(val); return `"${s.replace(/"/g, '""')}"`; }).join(",")).join("\n");
    return `${header}\n${body}`;
  }

  if (format === "sql") {
    const colNames = cols.map((c) => `"${c.name}"`).join(", ");
    const ft = `"${schema}"."${table}"`;
    return rows.map((row) => { const values = row.map((val) => { if (val === null) return "NULL"; if (typeof val === "number" || typeof val === "boolean") return String(val); const s = typeof val === "object" ? JSON.stringify(val) : String(val); return `'${s.replace(/'/g, "''")}'`; }).join(", "); return `INSERT INTO ${ft} (${colNames}) VALUES (${values});`; }).join("\n");
  }

  const truncate = (val: unknown, max: number) => { if (val === null) return '<span style="color:#666">NULL</span>'; const s = typeof val === "object" ? JSON.stringify(val) : String(val); const escaped = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); return escaped.length > max ? escaped.slice(0, max) + "..." : escaped; };
  const headerCells = cols.map((c) => `<th>${c.name}</th>`).join("");
  const bodyRows = rows.map((row) => `<tr>${row.map((val) => `<td>${truncate(val, 120)}</td>`).join("")}</tr>`).join("\n");
  return `<!DOCTYPE html>\n<html><head><meta charset="utf-8"><title>${schema}.${table}</title>\n<style>\nbody{font-family:-apple-system,system-ui,sans-serif;background:#0f0f0f;color:#e5e5e5;padding:32px}\n.card{background:#171717;border:1px solid #2e2e2e;border-radius:12px;overflow:hidden;max-width:100%}\n.meta{padding:16px 20px;border-bottom:1px solid #2e2e2e;font-size:13px;color:#a3a3a3}\n.meta strong{color:#e5e5e5}\ntable{width:100%;border-collapse:collapse;font-size:13px}\nth{text-align:left;padding:10px 16px;border-bottom:1px solid #2e2e2e;color:#a3a3a3;font-weight:500}\ntd{padding:10px 16px;border-bottom:1px solid #2e2e2e}\ntr:hover td{background:#1e1e1e}\n</style></head><body>\n<div class="card">\n<div class="meta"><strong>${schema}.${table}</strong> — ${rows.length} rows, ${cols.length} columns</div>\n<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table>\n</div></body></html>`;
}
