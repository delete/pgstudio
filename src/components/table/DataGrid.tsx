import { useState, useCallback, useRef, useEffect } from "react";
import { Copy, Download, Trash2, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Check, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import type { ColumnDef } from "@/lib/tauri";
import { exportFile } from "@/lib/tauri";

interface DataGridProps {
  columns: ColumnDef[];
  rows: unknown[][];
  rowCount: number;
  executionTime?: number;
  tableName?: string;
  schemaName?: string;
  onDeleteRows?: (rowIndices: number[]) => void;
  // Pagination
  totalRows?: number | null;
  page?: number;
  pageSize?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
  rowOffset?: number;
  // Sorting
  sortColumn?: string | null;
  sortDirection?: "ASC" | "DESC" | null;
  onSortChange?: (column: string | null, direction: "ASC" | "DESC" | null) => void;
  recentSortColumns?: string[];
}

type FormatType = "csv" | "json" | "sql" | "html";

function formatCellValue(cell: unknown): string {
  if (cell === null) return "NULL";
  if (typeof cell === "object") return JSON.stringify(cell);
  return String(cell);
}

function escapeCsv(val: string): string {
  if (val.includes(",") || val.includes('"') || val.includes("\n")) {
    return `"${val.replace(/"/g, '""')}"`;
  }
  return val;
}

function escapeSqlValue(cell: unknown): string {
  if (cell === null) return "NULL";
  if (typeof cell === "number" || typeof cell === "boolean") return String(cell);
  const s = typeof cell === "object" ? JSON.stringify(cell) : String(cell);
  return `'${s.replace(/'/g, "''")}'`;
}

function formatRows(
  columns: ColumnDef[],
  rows: unknown[][],
  indices: number[],
  format: FormatType,
  tableName?: string,
  schemaName?: string,
): string {
  const selectedRows = indices.map((i) => rows[i]);
  const colNames = columns.map((c) => c.name);

  if (format === "csv") {
    const header = colNames.map(escapeCsv).join(",");
    const body = selectedRows
      .map((row) => row.map((cell) => escapeCsv(formatCellValue(cell))).join(","))
      .join("\n");
    return `${header}\n${body}`;
  }

  if (format === "json") {
    const objects = selectedRows.map((row) => {
      const obj: Record<string, unknown> = {};
      colNames.forEach((name, i) => {
        obj[name] = row[i];
      });
      return obj;
    });
    return JSON.stringify(objects, null, 2);
  }

  if (format === "html") {
    const title = tableName
      ? schemaName && schemaName !== "public"
        ? `${schemaName}.${tableName}`
        : tableName
      : "Exported Data";
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    const truncate = (s: string, max: number) =>
      s.length > max ? s.slice(0, max) + "…" : s;

    const ths = colNames
      .map(
        (n, i) =>
          `        <th style="padding:10px 16px;text-align:left;font-weight:600;font-size:12px;color:#1e293b;background:#dfe4e9;border-bottom:1px solid #cbd5e1;${i < colNames.length - 1 ? "border-right:1px solid #cbd5e1;" : ""}white-space:nowrap">${esc(n)}</th>`,
      )
      .join("\n");

    const trs = selectedRows
      .map((row) => {
        const tds = row
          .map((cell, ci) => {
            const borderR = ci < row.length - 1 ? "border-right:1px solid #e2e8f0;" : "";
            if (cell === null) {
              return `        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;${borderR}font-size:13px;color:#94a3b8;font-style:italic">NULL</td>`;
            }
            if (typeof cell === "object") {
              const json = truncate(JSON.stringify(cell), 120);
              return `        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;${borderR}font-size:11px;font-family:monospace;color:#64748b;max-width:300px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${esc(JSON.stringify(cell))}">${esc(json)}</td>`;
            }
            const val = String(cell);
            const display = truncate(val, 200);
            return `        <td style="padding:12px 16px;border-bottom:1px solid #e2e8f0;${borderR}font-size:13px;color:#1e293b;max-width:400px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(display)}</td>`;
          })
          .join("\n");
        return `      <tr style="transition:background 0.1s">\n${tds}\n      </tr>`;
      })
      .join("\n");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${esc(title)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      color: #1e293b;
      background: #f8fafc;
      padding: 40px;
    }
    .header {
      margin-bottom: 24px;
    }
    .header h1 {
      font-size: 22px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 4px;
    }
    .header p {
      font-size: 13px;
      color: #64748b;
    }
    .table-wrapper {
      overflow-x: auto;
      border-radius: 8px;
      border: 1px solid #e2e8f0;
      background: #ffffff;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    tr:hover td {
      background: #f1f5f9 !important;
    }
    tr:last-child td {
      border-bottom: none;
    }
  </style>
</head>
<body>
  <div class="header">
    <h1>${esc(title)}</h1>
    <p>${selectedRows.length} row${selectedRows.length !== 1 ? "s" : ""} &middot; ${colNames.length} column${colNames.length !== 1 ? "s" : ""} &middot; Exported from PgStudio</p>
  </div>
  <div class="table-wrapper">
    <table>
      <thead>
      <tr>
${ths}
      </tr>
      </thead>
      <tbody>
${trs}
      </tbody>
    </table>
  </div>
</body>
</html>`;
  }

  // SQL INSERT INTO
  const table = schemaName && schemaName !== "public"
    ? `"${schemaName}"."${tableName || "table"}"`
    : `"${tableName || "table"}"`;
  const colList = colNames.map((n) => `"${n}"`).join(", ");
  return selectedRows
    .map((row) => {
      const vals = row.map(escapeSqlValue).join(", ");
      return `INSERT INTO ${table} (${colList}) VALUES (${vals});`;
    })
    .join("\n");
}

const PAGE_SIZE_OPTIONS = [100, 200, 300, 500, 1000];

export function DataGrid({
  columns,
  rows,
  rowCount,
  executionTime,
  tableName,
  schemaName,
  onDeleteRows,
  totalRows,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
  rowOffset = 0,
  sortColumn,
  sortDirection,
  onSortChange,
  recentSortColumns = [],
}: DataGridProps) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [copyOpen, setCopyOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (copyRef.current && !copyRef.current.contains(e.target as Node)) setCopyOpen(false);
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Reset selection when data changes
  useEffect(() => {
    setSelected(new Set());
  }, [rows]);

  const toggleRow = useCallback((idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    if (selected.size === rows.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(rows.map((_, i) => i)));
    }
  }, [rows, selected.size]);

  const selectedIndices = Array.from(selected).sort((a, b) => a - b);

  const handleCopy = useCallback(
    (format: FormatType) => {
      const text = formatRows(columns, rows, selectedIndices, format, tableName, schemaName);
      navigator.clipboard.writeText(text).then(() => {
        setCopyFeedback(`Copied as ${format.toUpperCase()}`);
        setTimeout(() => setCopyFeedback(null), 1500);
      });
      setCopyOpen(false);
    },
    [columns, rows, selectedIndices, tableName, schemaName],
  );

  const handleExport = useCallback(
    async (format: FormatType) => {
      const text = formatRows(columns, rows, selectedIndices, format, tableName, schemaName);
      const ext = format === "html" ? "html" : format === "sql" ? "sql" : format;
      const defaultName = `export_${selectedIndices.length}_rows.${ext}`;
      setExportOpen(false);
      const saved = await exportFile(text, defaultName);
      if (saved) {
        setCopyFeedback(`Exported as ${format.toUpperCase()}`);
        setTimeout(() => setCopyFeedback(null), 1500);
      }
    },
    [columns, rows, selectedIndices, tableName, schemaName],
  );

  const handleDelete = useCallback(() => {
    if (onDeleteRows && selectedIndices.length > 0) {
      onDeleteRows(selectedIndices);
      setSelected(new Set());
    }
  }, [onDeleteRows, selectedIndices]);

  if (columns.length === 0) {
    return (
      <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", fontSize: "14px", color: "var(--color-text-muted)" }}>
        No results to display
      </div>
    );
  }

  const hasSelection = selected.size > 0;
  const hasPagination = totalRows != null && onPageChange && onPageSizeChange && page != null && pageSize != null;
  const totalPages = hasPagination ? Math.max(1, Math.ceil(totalRows / pageSize)) : 1;

  const handleColumnSort = useCallback((colName: string) => {
    if (!onSortChange) return;
    if (sortColumn === colName) {
      // Cycle: ASC → DESC → none
      if (sortDirection === "ASC") onSortChange(colName, "DESC");
      else if (sortDirection === "DESC") onSortChange(null, null);
      else onSortChange(colName, "ASC");
    } else {
      onSortChange(colName, "ASC");
    }
  }, [onSortChange, sortColumn, sortDirection]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Results info bar + actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "12px",
          borderBottom: "1px solid var(--color-border)",
          padding: "8px 16px",
          fontSize: "12px",
          color: "var(--color-text-muted)",
          flexShrink: 0,
        }}
      >
        <span>
          {hasPagination
            ? `Rows ${rowOffset + 1}–${Math.min(rowOffset + rows.length, totalRows)} of ${totalRows.toLocaleString()}`
            : `${rowCount} row${rowCount !== 1 ? "s" : ""}`}
        </span>
        {executionTime !== undefined && <span>{executionTime}ms</span>}

        {hasSelection && (
          <>
            <div style={{ width: "1px", height: "14px", backgroundColor: "var(--color-border)" }} />
            <span style={{ color: "var(--color-accent)", fontWeight: 500 }}>
              {selected.size} selected
            </span>

            {/* Delete */}
            {onDeleteRows && (
              <button
                onClick={handleDelete}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  borderRadius: "6px",
                  border: "1px solid rgba(239,68,68,0.3)",
                  backgroundColor: "rgba(239,68,68,0.05)",
                  padding: "4px 10px",
                  fontSize: "11px",
                  color: "var(--color-danger)",
                  cursor: "pointer",
                }}
              >
                <Trash2 size={11} />
                Delete {selected.size} row{selected.size !== 1 ? "s" : ""}
              </button>
            )}

            {/* Copy dropdown */}
            <div ref={copyRef} style={{ position: "relative" }}>
              <button
                onClick={() => { setCopyOpen(!copyOpen); setExportOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border)",
                  padding: "4px 10px",
                  fontSize: "11px",
                  color: "var(--color-text-secondary)",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                }}
              >
                <Copy size={11} />
                Copy
                <ChevronDown size={10} />
              </button>
              {copyOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    zIndex: 50,
                    marginTop: "4px",
                    backgroundColor: "var(--color-bg-primary)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    overflow: "hidden",
                    minWidth: "140px",
                  }}
                >
                  <DropdownItem label="Copy as CSV" onClick={() => handleCopy("csv")} />
                  <DropdownItem label="Copy as JSON" onClick={() => handleCopy("json")} />
                  <DropdownItem label="Copy as SQL" onClick={() => handleCopy("sql")} />
                  <DropdownItem label="Copy as HTML" onClick={() => handleCopy("html")} />
                </div>
              )}
            </div>

            {/* Export dropdown */}
            <div ref={exportRef} style={{ position: "relative" }}>
              <button
                onClick={() => { setExportOpen(!exportOpen); setCopyOpen(false); }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  borderRadius: "6px",
                  border: "1px solid var(--color-border)",
                  padding: "4px 10px",
                  fontSize: "11px",
                  color: "var(--color-text-secondary)",
                  backgroundColor: "transparent",
                  cursor: "pointer",
                }}
              >
                <Download size={11} />
                Export
                <ChevronDown size={10} />
              </button>
              {exportOpen && (
                <div
                  style={{
                    position: "absolute",
                    top: "100%",
                    left: 0,
                    zIndex: 50,
                    marginTop: "4px",
                    backgroundColor: "var(--color-bg-primary)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "8px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    overflow: "hidden",
                    minWidth: "140px",
                  }}
                >
                  <DropdownItem label="Export as CSV" onClick={() => handleExport("csv")} />
                  <DropdownItem label="Export as JSON" onClick={() => handleExport("json")} />
                  <DropdownItem label="Export as SQL" onClick={() => handleExport("sql")} />
                  <DropdownItem label="Export as HTML" onClick={() => handleExport("html")} />
                </div>
              )}
            </div>
          </>
        )}

        {/* Copy feedback toast */}
        {copyFeedback && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", color: "var(--color-accent)", fontSize: "11px", fontWeight: 500 }}>
            <Check size={12} />
            {copyFeedback}
          </div>
        )}
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              {/* Checkbox header */}
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  width: "44px",
                  minWidth: "44px",
                  borderBottom: "2px solid var(--color-border)",
                  borderRight: "1px solid var(--color-border)",
                  padding: "8px 12px",
                  textAlign: "center",
                  backgroundColor: "var(--color-bg-secondary)",
                }}
              >
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                  style={{ cursor: "pointer", accentColor: "var(--color-accent)" }}
                />
              </th>
              {/* Row number header */}
              <th
                style={{
                  position: "sticky",
                  top: 0,
                  zIndex: 10,
                  width: "48px",
                  minWidth: "48px",
                  borderBottom: "2px solid var(--color-border)",
                  borderRight: "1px solid var(--color-border)",
                  padding: "8px 12px",
                  textAlign: "center",
                  fontSize: "12px",
                  fontWeight: 400,
                  color: "var(--color-text-muted)",
                  backgroundColor: "var(--color-bg-secondary)",
                }}
              >
                #
              </th>
              {columns.map((col, i) => {
                const isSorted = sortColumn === col.name;
                return (
                  <th
                    key={i}
                    onClick={onSortChange ? () => handleColumnSort(col.name) : undefined}
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 10,
                      borderBottom: "2px solid var(--color-border)",
                      borderRight: "1px solid var(--color-border)",
                      padding: "8px 16px",
                      textAlign: "left",
                      backgroundColor: "var(--color-bg-secondary)",
                      whiteSpace: "nowrap",
                      cursor: onSortChange ? "pointer" : "default",
                      userSelect: "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                      <span style={{ fontWeight: 500, color: isSorted ? "var(--color-accent)" : "var(--color-text-primary)", fontSize: "13px" }}>
                        {col.name}
                      </span>
                      {onSortChange && (
                        <span style={{ flexShrink: 0, color: isSorted ? "var(--color-accent)" : "var(--color-text-muted)", opacity: isSorted ? 1 : 0.3 }}>
                          {isSorted && sortDirection === "ASC" ? <ArrowUp size={12} /> : isSorted && sortDirection === "DESC" ? <ArrowDown size={12} /> : <ArrowUpDown size={12} />}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: "2px", fontSize: "11px", fontWeight: 400, color: "var(--color-text-muted)" }}>
                      {col.data_type}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIdx) => {
              const isSelected = selected.has(rowIdx);
              return (
                <tr
                  key={rowIdx}
                  style={{
                    backgroundColor: isSelected ? "rgba(62,207,142,0.06)" : "transparent",
                  }}
                >
                  <td
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      borderRight: "1px solid var(--color-border)",
                      padding: "6px 12px",
                      textAlign: "center",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleRow(rowIdx)}
                      style={{ cursor: "pointer", accentColor: "var(--color-accent)" }}
                    />
                  </td>
                  <td
                    style={{
                      borderBottom: "1px solid var(--color-border)",
                      borderRight: "1px solid var(--color-border)",
                      padding: "6px 12px",
                      textAlign: "center",
                      fontSize: "12px",
                      color: "var(--color-text-muted)",
                    }}
                  >
                    {rowOffset + rowIdx + 1}
                  </td>
                  {row.map((cell, colIdx) => (
                    <td
                      key={colIdx}
                      title={cell === null ? "NULL" : String(cell)}
                      style={{
                        borderBottom: "1px solid var(--color-border)",
                        borderRight: "1px solid var(--color-border)",
                        padding: "6px 16px",
                        maxWidth: "300px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        color: cell === null ? "var(--color-text-muted)" : "var(--color-text-primary)",
                        fontStyle: cell === null ? "italic" : "normal",
                      }}
                    >
                      {cell === null ? (
                        "NULL"
                      ) : typeof cell === "object" ? (
                        <span style={{ fontFamily: "monospace", fontSize: "12px", color: "var(--color-info)" }}>
                          {JSON.stringify(cell)}
                        </span>
                      ) : (
                        String(cell)
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer: sort + pagination */}
      {(hasPagination || onSortChange) && (
        <div style={{
          display: "flex", alignItems: "center", gap: "16px",
          borderTop: "1px solid var(--color-border)", padding: "8px 16px",
          fontSize: "12px", color: "var(--color-text-muted)", flexShrink: 0,
          backgroundColor: "var(--color-bg-secondary)",
        }}>
          {/* Sort controls */}
          {onSortChange && (
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <ArrowUpDown size={12} style={{ flexShrink: 0, opacity: 0.6 }} />
              <span style={{ flexShrink: 0 }}>Sort by:</span>
              <select
                value={sortColumn || ""}
                onChange={(e) => {
                  const col = e.target.value;
                  if (!col) { onSortChange(null, null); }
                  else { onSortChange(col, sortDirection || "ASC"); }
                }}
                style={{
                  backgroundColor: "var(--color-bg-tertiary)", color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border)", borderRadius: "6px",
                  padding: "3px 8px", fontSize: "12px", cursor: "pointer", outline: "none",
                  maxWidth: "160px",
                }}
              >
                <option value="">None</option>
                {recentSortColumns.length > 0 && (
                  <optgroup label="Recent">
                    {recentSortColumns.filter((name) => columns.some((c) => c.name === name)).map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </optgroup>
                )}
                {(() => {
                  const recentSet = new Set(recentSortColumns);
                  const rest = [...columns].filter((c) => !recentSet.has(c.name)).sort((a, b) => a.name.localeCompare(b.name));
                  if (rest.length === 0) return null;
                  return (
                    <optgroup label={recentSortColumns.length > 0 ? "All columns" : "Columns"}>
                      {rest.map((col) => (
                        <option key={col.name} value={col.name}>{col.name}</option>
                      ))}
                    </optgroup>
                  );
                })()}
              </select>
              {sortColumn && (
                <>
                  <button
                    onClick={() => onSortChange(sortColumn, "ASC")}
                    style={{
                      display: "flex", alignItems: "center", gap: "3px",
                      borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 500,
                      border: sortDirection === "ASC" ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
                      backgroundColor: sortDirection === "ASC" ? "rgba(62,207,142,0.1)" : "transparent",
                      color: sortDirection === "ASC" ? "var(--color-accent)" : "var(--color-text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    <ArrowUp size={11} /> ASC
                  </button>
                  <button
                    onClick={() => onSortChange(sortColumn, "DESC")}
                    style={{
                      display: "flex", alignItems: "center", gap: "3px",
                      borderRadius: "6px", padding: "3px 8px", fontSize: "11px", fontWeight: 500,
                      border: sortDirection === "DESC" ? "1px solid var(--color-accent)" : "1px solid var(--color-border)",
                      backgroundColor: sortDirection === "DESC" ? "rgba(62,207,142,0.1)" : "transparent",
                      color: sortDirection === "DESC" ? "var(--color-accent)" : "var(--color-text-muted)",
                      cursor: "pointer",
                    }}
                  >
                    <ArrowDown size={11} /> DESC
                  </button>
                </>
              )}
            </div>
          )}

          {hasPagination && onSortChange && (
            <div style={{ width: "1px", height: "16px", backgroundColor: "var(--color-border)", flexShrink: 0 }} />
          )}

          {/* Page size selector */}
          {hasPagination && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span>Rows per page:</span>
              <select
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
                style={{
                  backgroundColor: "var(--color-bg-tertiary)", color: "var(--color-text-primary)",
                  border: "1px solid var(--color-border)", borderRadius: "6px",
                  padding: "3px 8px", fontSize: "12px", cursor: "pointer", outline: "none",
                }}
              >
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          )}

          <div style={{ flex: 1 }} />

          {/* Page navigation */}
          {hasPagination && (
            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
              <span style={{ marginRight: "8px" }}>
                Page {page + 1} of {totalPages}
              </span>
              <PaginationBtn onClick={() => onPageChange(0)} disabled={page === 0} title="First page">
                <ChevronsLeft size={14} />
              </PaginationBtn>
              <PaginationBtn onClick={() => onPageChange(page - 1)} disabled={page === 0} title="Previous page">
                <ChevronLeft size={14} />
              </PaginationBtn>
              <PaginationBtn onClick={() => onPageChange(page + 1)} disabled={page >= totalPages - 1} title="Next page">
                <ChevronRight size={14} />
              </PaginationBtn>
              <PaginationBtn onClick={() => onPageChange(totalPages - 1)} disabled={page >= totalPages - 1} title="Last page">
                <ChevronsRight size={14} />
              </PaginationBtn>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PaginationBtn({ onClick, disabled, title, children }: {
  onClick: () => void; disabled: boolean; title: string; children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} disabled={disabled} title={title} style={{
      display: "flex", alignItems: "center", justifyContent: "center",
      width: "28px", height: "28px", borderRadius: "6px",
      border: "1px solid var(--color-border)", backgroundColor: "transparent",
      color: disabled ? "var(--color-text-muted)" : "var(--color-text-primary)",
      cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.4 : 1,
      transition: "background-color 0.1s ease",
    }}
    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.backgroundColor = "var(--color-bg-tertiary)"; }}
    onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "transparent"; }}
    >
      {children}
    </button>
  );
}

function DropdownItem({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      style={{
        display: "block",
        width: "100%",
        textAlign: "left",
        padding: "8px 14px",
        fontSize: "12px",
        color: "var(--color-text-primary)",
        backgroundColor: "transparent",
        border: "none",
        cursor: "pointer",
        borderBottom: "1px solid var(--color-border)",
      }}
    >
      {label}
    </button>
  );
}
