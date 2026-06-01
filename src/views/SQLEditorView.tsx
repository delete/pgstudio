import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { SQLEditor } from "@/components/editor/SQLEditor";
import { DataGrid } from "@/components/table/DataGrid";
import { useConnectionStore, useIsConnected, useActiveSchemaContext } from "@/stores/connection-store";
import {
  executeQuery,
  aiNlToSql,
  aiExplain,
  aiOptimize,
  getQueryHistory,
  searchAiPrompts,
} from "@/lib/tauri";
import type { QueryResult, QueryHistoryEntry, AiPromptSuggestion } from "@/lib/tauri";
import {
  Play,
  Plus,
  X,
  AlertCircle,
  Bot,
  Sparkles,
  BookOpen,
  Zap,
  Clock,
  GripHorizontal,
} from "lucide-react";

interface Tab {
  id: string;
  name: string;
  sql: string;
  result: QueryResult | null;
  error: string | null;
}

let tabCounter = 1;

function createTab(): Tab {
  return {
    id: crypto.randomUUID(),
    name: `Query ${tabCounter++}`,
    sql: "",
    result: null,
    error: null,
  };
}

export function SQLEditorView() {
  const { activeConnectionId, pendingSql, pendingSqlAutoRun, setPendingSql } =
    useConnectionStore();
  const isConnected = useIsConnected();
  const schemaContext = useActiveSchemaContext();
  const [tabs, setTabs] = useState<Tab[]>([createTab()]);
  const [activeTabId, setActiveTabId] = useState(tabs[0].id);
  const [isExecuting, setIsExecuting] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);

  // Resizable editor
  const [editorHeight, setEditorHeight] = useState(300);
  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartHeight = useRef(0);

  // NL autocomplete
  const [suggestions, setSuggestions] = useState<AiPromptSuggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState(0);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Recent queries (always visible in right sidebar)
  const [rawHistory, setRawHistory] = useState<QueryHistoryEntry[]>([]);

  const activeTab = tabs.find((t) => t.id === activeTabId) ?? tabs[0];

  // Deduplicate history: group by SQL, keep latest entry's metadata + count
  const recentQueries = useMemo(() => {
    const map = new Map<string, QueryHistoryEntry & { run_count: number }>();
    for (const entry of rawHistory) {
      const key = entry.sql.trim();
      const existing = map.get(key);
      if (existing) {
        existing.run_count++;
      } else {
        map.set(key, { ...entry, run_count: 1 });
      }
    }
    return Array.from(map.values());
  }, [rawHistory]);

  // Tab that should be auto-executed after creation
  const [autoRunTabId, setAutoRunTabId] = useState<string | null>(null);

  // Pick up pending SQL from context menu / other views
  useEffect(() => {
    if (!pendingSql) return;
    const newTab: Tab = {
      id: crypto.randomUUID(),
      name: `Query ${tabCounter++}`,
      sql: pendingSql,
      result: null,
      error: null,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
    if (pendingSqlAutoRun) {
      setAutoRunTabId(newTab.id);
    }
    setPendingSql(null);
  }, [pendingSql, pendingSqlAutoRun, setPendingSql]);

  // Load recent queries
  useEffect(() => {
    if (!activeConnectionId || !isConnected) return;
    getQueryHistory(activeConnectionId, 100)
      .then(setRawHistory)
      .catch(() => {});
  }, [activeConnectionId, isConnected]);

  // Refresh recent queries after execution
  const refreshRecent = useCallback(() => {
    if (!activeConnectionId) return;
    getQueryHistory(activeConnectionId, 100)
      .then(setRawHistory)
      .catch(() => {});
  }, [activeConnectionId]);

  // Search AI prompts for autocomplete
  const handlePromptChange = useCallback((value: string) => {
    setAiPrompt(value);
    setSelectedSuggestion(0);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(() => {
      searchAiPrompts(value.trim(), 8)
        .then((results) => {
          setSuggestions(results);
          setShowSuggestions(results.length > 0);
        })
        .catch(() => {});
    }, 200);
  }, []);

  const pickSuggestion = useCallback((suggestion: AiPromptSuggestion) => {
    setShowSuggestions(false);
    setSuggestions([]);
    // If we have a cached SQL, load it directly instead of calling AI
    if (suggestion.generated_sql) {
      setAiPrompt("");
      setTabs((prev) =>
        prev.map((t) =>
          t.id === activeTabId ? { ...t, sql: suggestion.generated_sql } : t,
        ),
      );
    } else {
      setAiPrompt(suggestion.prompt);
    }
  }, [activeTabId]);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Build CodeMirror schema from schemaContext
  const editorSchema = useMemo(() => {
    if (!schemaContext) return undefined;
    const schema: Record<string, string[]> = {};
    for (const table of schemaContext.tables) {
      const cols = table.columns.map((c) => c.name);
      // Add both short name and fully-qualified name so completions work either way
      schema[table.name] = cols;
      schema[`${table.schema}.${table.name}`] = cols;
    }
    return schema;
  }, [schemaContext]);

  const updateTab = useCallback(
    (tabId: string, updates: Partial<Tab>) => {
      setTabs((prev) =>
        prev.map((t) => (t.id === tabId ? { ...t, ...updates } : t)),
      );
    },
    [],
  );

  // Auto-execute a tab created with autoRun flag
  useEffect(() => {
    if (!autoRunTabId || !activeConnectionId) return;
    const tab = tabs.find((t) => t.id === autoRunTabId);
    if (!tab || !tab.sql.trim()) { setAutoRunTabId(null); return; }
    setAutoRunTabId(null);
    setIsExecuting(true);
    updateTab(tab.id, { error: null, result: null });
    executeQuery(activeConnectionId, tab.sql.trim())
      .then((res) => { updateTab(tab.id, { result: res, error: null }); refreshRecent(); })
      .catch((e) => { updateTab(tab.id, { error: String(e), result: null }); refreshRecent(); })
      .finally(() => setIsExecuting(false));
  }, [autoRunTabId, activeConnectionId, tabs, updateTab, refreshRecent]);

  const addTab = () => {
    const tab = createTab();
    setTabs((prev) => [...prev, tab]);
    setActiveTabId(tab.id);
  };

  const closeTab = (tabId: string) => {
    if (tabs.length <= 1) return;
    const idx = tabs.findIndex((t) => t.id === tabId);
    const newTabs = tabs.filter((t) => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabId === tabId) {
      setActiveTabId(newTabs[Math.max(0, idx - 1)].id);
    }
  };

  const handleExecute = useCallback(async () => {
    if (!activeConnectionId || !activeTab.sql.trim() || isExecuting) return;

    setIsExecuting(true);
    updateTab(activeTab.id, { error: null, result: null });

    try {
      const res = await executeQuery(activeConnectionId, activeTab.sql.trim());
      updateTab(activeTab.id, { result: res, error: null });
      refreshRecent();
    } catch (e) {
      updateTab(activeTab.id, { error: String(e), result: null });
      refreshRecent();
    } finally {
      setIsExecuting(false);
    }
  }, [activeConnectionId, activeTab, isExecuting, updateTab, refreshRecent]);

  const handleNlToSql = async () => {
    if (!aiPrompt.trim() || !schemaContext || aiLoading) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const sql = await aiNlToSql(aiPrompt, schemaContext, []);
      updateTab(activeTab.id, { sql });
      setAiPrompt("");
    } catch (e) {
      setAiResult(`Error: ${e}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleExplain = async () => {
    if (!activeTab.sql.trim() || !schemaContext || aiLoading) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const result = await aiExplain(activeTab.sql, schemaContext);
      setAiResult(result);
    } catch (e) {
      setAiResult(`Error: ${e}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleFixWithAi = async () => {
    if (!activeTab.error || !schemaContext || aiLoading) return;
    setAiLoading(true);
    setAiResult(null);
    try {
      const result = await aiOptimize(
        activeTab.sql,
        schemaContext,
        activeTab.error,
      );
      setAiResult(result);
    } catch (e) {
      setAiResult(`Error: ${e}`);
    } finally {
      setAiLoading(false);
    }
  };

  const handleUseRecentQuery = async (sql: string) => {
    if (!activeConnectionId) return;
    updateTab(activeTab.id, { sql, error: null, result: null });
    setIsExecuting(true);
    try {
      const res = await executeQuery(activeConnectionId, sql.trim());
      updateTab(activeTab.id, { sql, result: res, error: null });
      refreshRecent();
    } catch (e) {
      updateTab(activeTab.id, { sql, error: String(e), result: null });
      refreshRecent();
    } finally {
      setIsExecuting(false);
    }
  };

  // Drag resize handlers
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartHeight.current = editorHeight;

    const handleMove = (ev: MouseEvent) => {
      if (!isDragging.current) return;
      const delta = ev.clientY - dragStartY.current;
      setEditorHeight(Math.max(120, Math.min(700, dragStartHeight.current + delta)));
    };

    const handleUp = () => {
      isDragging.current = false;
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);
  }, [editorHeight]);

  // Keep stable refs for keyboard handler
  const executeRef = useRef(handleExecute);
  executeRef.current = handleExecute;
  const addTabRef = useRef(addTab);
  addTabRef.current = addTab;
  const closeTabRef = useRef(() => closeTab(activeTabId));
  closeTabRef.current = () => closeTab(activeTabId);

  // Global keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "Enter") {
        e.preventDefault();
        executeRef.current();
      } else if (e.key === "n" && !e.shiftKey) {
        e.preventDefault();
        addTabRef.current();
      } else if (e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        closeTabRef.current();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  if (!isConnected) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", padding: "32px", fontSize: "14px", color: "var(--color-text-muted)" }}>
        Connect to a database to use the SQL editor
      </div>
    );
  }

  return (
    <div style={{ display: "flex", height: "100%" }}>
      {/* Main editor area */}
      <div style={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden" }}>
        {/* Tabs */}
        <div style={{ display: "flex", alignItems: "center", borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)", flexShrink: 0 }}>
          <div style={{ display: "flex", flex: 1, alignItems: "center", overflowX: "auto" }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTabId(tab.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  borderTop: "none",
                  borderBottom: "none",
                  borderLeft: "none",
                  borderRight: "1px solid var(--color-border)",
                  padding: "8px 16px",
                  fontSize: "12px",
                  transition: "background-color 0.15s ease",
                  backgroundColor: tab.id === activeTabId ? "var(--color-bg-primary)" : "transparent",
                  color: tab.id === activeTabId ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  cursor: "pointer",
                }}
              >
                <span style={{ maxWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{tab.name}</span>
                {tabs.length > 1 && (
                  <X
                    size={12}
                    style={{ flexShrink: 0 }}
                    onClick={(e) => {
                      e.stopPropagation();
                      closeTab(tab.id);
                    }}
                  />
                )}
              </button>
            ))}
          </div>
          <button
            onClick={addTab}
            style={{ padding: "8px 12px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
            title="New tab (\u2318N)"
          >
            <Plus size={14} />
          </button>
        </div>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: "10px", borderBottom: "1px solid var(--color-border)", padding: "10px 16px", flexShrink: 0 }}>
          <button
            onClick={handleExecute}
            disabled={isExecuting || !activeTab.sql.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderRadius: "8px",
              backgroundColor: "var(--color-accent)",
              padding: "6px 14px",
              fontSize: "12px",
              fontWeight: 500,
              color: "white",
              border: "none",
              cursor: "pointer",
              opacity: (isExecuting || !activeTab.sql.trim()) ? 0.5 : 1,
            }}
          >
            <Play size={12} />
            {isExecuting ? "Running..." : "Run"}
          </button>

          <div style={{ height: "16px", width: "1px", backgroundColor: "var(--color-border)" }} />

          <button
            onClick={handleExplain}
            disabled={aiLoading || !activeTab.sql.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderRadius: "8px",
              border: "1px solid var(--color-border)",
              padding: "6px 12px",
              fontSize: "12px",
              color: "var(--color-text-secondary)",
              background: "none",
              cursor: "pointer",
              opacity: (aiLoading || !activeTab.sql.trim()) ? 0.5 : 1,
            }}
            title="Explain query with AI"
          >
            <BookOpen size={11} />
            Explain
          </button>

          {activeTab.error && (
            <button
              onClick={handleFixWithAi}
              disabled={aiLoading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                borderRadius: "8px",
                border: "1px solid rgba(239,68,68,0.3)",
                backgroundColor: "rgba(239,68,68,0.05)",
                padding: "6px 12px",
                fontSize: "12px",
                color: "var(--color-danger)",
                cursor: "pointer",
                opacity: aiLoading ? 0.5 : 1,
              }}
              title="Fix error with AI"
            >
              <Zap size={11} />
              Fix with AI
            </button>
          )}

          <div style={{ flex: 1 }} />

          <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              <kbd style={{ padding: "1px 5px", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "10px", fontFamily: "inherit" }}>{"\u2318"}Enter</kbd> Run
            </span>
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              <kbd style={{ padding: "1px 5px", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "10px", fontFamily: "inherit" }}>{"\u2318"}N</kbd> New tab
            </span>
            <span style={{ fontSize: "12px", color: "var(--color-text-muted)" }}>
              <kbd style={{ padding: "1px 5px", borderRadius: "4px", border: "1px solid var(--color-border)", fontSize: "10px", fontFamily: "inherit" }}>{"\u2318"}W</kbd> Close tab
            </span>
          </div>
        </div>

        {/* NL-to-SQL bar */}
        <div style={{ display: "flex", gap: "12px", borderBottom: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)", padding: "14px 20px", flexShrink: 0, alignItems: "flex-start" }}>
          <Bot size={16} style={{ color: "var(--color-accent)", flexShrink: 0, marginTop: "6px" }} />
          <div style={{ flex: 1, position: "relative" }}>
            <textarea
              value={aiPrompt}
              onChange={(e) => handlePromptChange(e.target.value)}
              onFocus={() => { if (suggestions.length > 0) setShowSuggestions(true); }}
              onKeyDown={(e) => {
                if (showSuggestions && suggestions.length > 0) {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    setSelectedSuggestion((prev) => Math.min(prev + 1, suggestions.length - 1));
                    return;
                  }
                  if (e.key === "ArrowUp") {
                    e.preventDefault();
                    setSelectedSuggestion((prev) => Math.max(prev - 1, 0));
                    return;
                  }
                  if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
                    e.preventDefault();
                    pickSuggestion(suggestions[selectedSuggestion]);
                    return;
                  }
                  if (e.key === "Escape") {
                    setShowSuggestions(false);
                    return;
                  }
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleNlToSql();
                }
              }}
              placeholder="Describe what you want in plain English..."
              rows={1}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              style={{
                width: "100%",
                backgroundColor: "transparent",
                fontSize: "14px",
                color: "var(--color-text-primary)",
                outline: "none",
                border: "none",
                resize: "vertical",
                minHeight: "24px",
                maxHeight: "120px",
                lineHeight: 1.6,
                fontFamily: "inherit",
                padding: "4px 0",
              }}
            />
            {/* Autocomplete dropdown */}
            {showSuggestions && suggestions.length > 0 && (
              <div
                ref={suggestionsRef}
                style={{
                  position: "absolute",
                  top: "100%",
                  left: 0,
                  right: 0,
                  zIndex: 50,
                  backgroundColor: "var(--color-bg-primary)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "8px",
                  boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  maxHeight: "200px",
                  overflow: "auto",
                  marginTop: "4px",
                }}
              >
                {suggestions.map((s, i) => (
                  <button
                    key={i}
                    onMouseDown={(e) => { e.preventDefault(); pickSuggestion(s); }}
                    onMouseEnter={() => setSelectedSuggestion(i)}
                    style={{
                      display: "block",
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 12px",
                      fontSize: "13px",
                      color: "var(--color-text-primary)",
                      backgroundColor: i === selectedSuggestion ? "var(--color-bg-secondary)" : "transparent",
                      border: "none",
                      cursor: "pointer",
                      borderBottom: i < suggestions.length - 1 ? "1px solid var(--color-border)" : "none",
                    }}
                  >
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.prompt}
                    </div>
                    {s.generated_sql && (
                      <div style={{ marginTop: "2px", fontSize: "11px", fontFamily: "monospace", color: "var(--color-text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {s.generated_sql}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            onClick={handleNlToSql}
            disabled={aiLoading || !aiPrompt.trim()}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              borderRadius: "8px",
              backgroundColor: "rgba(62,207,142,0.1)",
              padding: "8px 14px",
              fontSize: "13px",
              color: "var(--color-accent)",
              border: "none",
              cursor: "pointer",
              opacity: (aiLoading || !aiPrompt.trim()) ? 0.5 : 1,
              flexShrink: 0,
              marginTop: "2px",
            }}
          >
            <Sparkles size={12} />
            {aiLoading ? "Generating..." : "Generate SQL"}
          </button>
        </div>

        {/* Editor */}
        <div style={{ height: `${editorHeight}px`, flexShrink: 0, overflow: "auto" }}>
          <SQLEditor
            value={activeTab.sql}
            onChange={(sql) => updateTab(activeTab.id, { sql })}
            onExecute={handleExecute}
            schema={editorSchema}
            schemaContext={schemaContext}
            height={`${editorHeight}px`}
          />
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          style={{
            height: "6px",
            cursor: "row-resize",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "var(--color-bg-secondary)",
            borderTop: "1px solid var(--color-border)",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
            userSelect: "none",
          }}
        >
          <GripHorizontal size={12} style={{ color: "var(--color-text-muted)", opacity: 0.5 }} />
        </div>

        {/* Results area */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>
          <div style={{ flex: 1, overflow: "hidden" }}>
            {activeTab.error && (
              <div style={{ display: "flex", alignItems: "flex-start", gap: "10px", borderBottom: "1px solid var(--color-border)", backgroundColor: "rgba(239,68,68,0.1)", padding: "12px 16px" }}>
                <AlertCircle
                  size={14}
                  style={{ marginTop: "2px", color: "var(--color-danger)", flexShrink: 0 }}
                />
                <pre style={{ fontSize: "12px", color: "var(--color-danger)", whiteSpace: "pre-wrap", fontFamily: "monospace", lineHeight: 1.6, margin: 0 }}>
                  {activeTab.error}
                </pre>
              </div>
            )}
            {activeTab.result && (
              <DataGrid
                columns={activeTab.result.columns}
                rows={activeTab.result.rows}
                rowCount={activeTab.result.row_count}
                executionTime={activeTab.result.execution_time_ms}
              />
            )}
            {!activeTab.result && !activeTab.error && (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--color-text-muted)", fontSize: "14px" }}>
                Execute a query to see results
              </div>
            )}
          </div>

          {/* AI result panel */}
          {aiResult && (
            <div style={{ width: "320px", borderLeft: "1px solid var(--color-border)", backgroundColor: "var(--color-bg-secondary)", overflow: "auto", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--color-border)", padding: "12px 16px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "12px", fontWeight: 500, color: "var(--color-accent)" }}>
                  <Bot size={13} />
                  AI Response
                </div>
                <button
                  onClick={() => setAiResult(null)}
                  style={{ borderRadius: "6px", padding: "4px", color: "var(--color-text-muted)", background: "none", border: "none", cursor: "pointer" }}
                >
                  <X size={14} />
                </button>
              </div>
              <div style={{ padding: "16px", fontSize: "12px", color: "var(--color-text-secondary)", whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                {aiResult}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right sidebar: Query History (always visible) */}
      <div
        style={{
          width: "260px",
          borderLeft: "1px solid var(--color-border)",
          backgroundColor: "var(--color-bg-secondary)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "10px 12px",
            borderBottom: "1px solid var(--color-border)",
            flexShrink: 0,
          }}
        >
          <Clock size={12} style={{ color: "var(--color-text-muted)" }} />
          <span style={{ fontSize: "11px", fontWeight: 500, color: "var(--color-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Query History
          </span>
        </div>
        <div style={{ flex: 1, overflow: "auto" }}>
          {recentQueries.length === 0 ? (
            <div style={{ padding: "24px 12px", textAlign: "center", fontSize: "12px", color: "var(--color-text-muted)" }}>
              No queries yet
            </div>
          ) : (
            recentQueries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => handleUseRecentQuery(entry.sql)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "10px 12px",
                  background: "none",
                  border: "none",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                  transition: "background-color 0.1s ease",
                }}
              >
                <pre
                  style={{
                    fontSize: "11px",
                    fontFamily: "monospace",
                    color: "var(--color-text-primary)",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-all",
                    maxHeight: "48px",
                    overflow: "hidden",
                    margin: 0,
                    lineHeight: 1.4,
                  }}
                >
                  {entry.sql}
                </pre>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginTop: "4px", fontSize: "10px", color: "var(--color-text-muted)" }}>
                  <span style={{ color: entry.success ? "var(--color-accent)" : "var(--color-danger)" }}>
                    {entry.success ? `${entry.row_count} rows` : "error"}
                  </span>
                  <span>{entry.execution_time_ms}ms</span>
                  {entry.run_count > 1 && (
                    <span style={{ marginLeft: "auto", backgroundColor: "var(--color-bg-tertiary, rgba(255,255,255,0.08))", borderRadius: "4px", padding: "1px 5px", fontSize: "10px", color: "var(--color-text-muted)" }}>
                      {entry.run_count}x
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
