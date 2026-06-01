import { invoke } from "@tauri-apps/api/core";

export interface ConnectionInput {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl_mode?: string;
  color?: string;
}

export interface ConnectionRecord {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  user: string;
  ssl_mode: string;
  color?: string;
  created_at: string;
}

export interface QueryResult {
  columns: ColumnDef[];
  rows: unknown[][];
  row_count: number;
  execution_time_ms: number;
  command_tag: string;
}

export interface ColumnDef {
  name: string;
  data_type: string;
}

export interface DatabaseInfo {
  name: string;
  is_current: boolean;
}

export interface SchemaInfo {
  name: string;
  owner: string;
}

export interface TableInfo {
  schema: string;
  name: string;
  table_type: string;
  row_estimate: number;
  size: string;
}

export interface ColumnInfo {
  name: string;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  foreign_table: string | null;
  foreign_column: string | null;
  ordinal_position: number;
}

export interface ConstraintInfo {
  name: string;
  constraint_type: string;
  columns: string[];
  definition: string;
  foreign_table: string | null;
  foreign_columns: string | null;
}

export interface IndexInfo {
  name: string;
  columns: string;
  is_unique: boolean;
  is_primary: boolean;
  index_type: string;
  definition: string;
  size: string;
}

export interface TriggerInfo {
  name: string;
  event: string;
  timing: string;
  orientation: string;
  function_name: string;
  definition: string;
  enabled: boolean;
}

export interface RuleInfo {
  name: string;
  event: string;
  is_instead: boolean;
  definition: string;
}

export interface PolicyInfo {
  name: string;
  command: string;
  permissive: boolean;
  roles: string[];
  using_expr: string | null;
  check_expr: string | null;
}

export interface QueryHistoryEntry {
  id: number;
  connection_id: string;
  sql: string;
  execution_time_ms: number;
  row_count: number;
  success: boolean;
  error_message: string | null;
  created_at: string;
}

export interface SavedQuery {
  id: number;
  name: string;
  sql: string;
  connection_id: string | null;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// Connection commands
export const testConnection = (input: ConnectionInput) =>
  invoke<string>("test_connection", { input });

export const connect = (input: ConnectionInput) =>
  invoke<void>("connect", { input });

export const disconnect = (connectionId: string) =>
  invoke<void>("disconnect", { connectionId });

// Query commands
export const executeQuery = (connectionId: string, sql: string) =>
  invoke<QueryResult>("execute_query", { connectionId, sql });

// Schema introspection
export const getDatabases = (connectionId: string) =>
  invoke<DatabaseInfo[]>("get_databases", { connectionId });

export const switchDatabase = (connectionId: string, database: string) =>
  invoke<void>("switch_database", { connectionId, database });

export const getSchemas = (connectionId: string) =>
  invoke<SchemaInfo[]>("get_schemas", { connectionId });

export const getTables = (connectionId: string, schema: string) =>
  invoke<TableInfo[]>("get_tables", { connectionId, schema });

export const getColumns = (connectionId: string, schema: string, table: string) =>
  invoke<ColumnInfo[]>("get_columns", { connectionId, schema, table });

export const getConstraints = (connectionId: string, schema: string, table: string) =>
  invoke<ConstraintInfo[]>("get_constraints", { connectionId, schema, table });

export const getIndexes = (connectionId: string, schema: string, table: string) =>
  invoke<IndexInfo[]>("get_indexes", { connectionId, schema, table });

export const getTriggers = (connectionId: string, schema: string, table: string) =>
  invoke<TriggerInfo[]>("get_triggers", { connectionId, schema, table });

export const getRules = (connectionId: string, schema: string, table: string) =>
  invoke<RuleInfo[]>("get_rules", { connectionId, schema, table });

export const getPolicies = (connectionId: string, schema: string, table: string) =>
  invoke<PolicyInfo[]>("get_policies", { connectionId, schema, table });

export const getTableData = (
  connectionId: string,
  schema: string,
  table: string,
  limit?: number,
  offset?: number,
  sortColumn?: string | null,
  sortDirection?: string | null,
) => invoke<QueryResult>("get_table_data", { connectionId, schema, table, limit, offset, sortColumn, sortDirection });

// Connection storage
export const saveConnection = (input: ConnectionInput) =>
  invoke<void>("save_connection", { input });

export const listConnections = () =>
  invoke<ConnectionRecord[]>("list_connections");

export const deleteConnection = (id: string) =>
  invoke<void>("delete_connection", { id });

// Query history
export const getQueryHistory = (connectionId?: string, limit?: number) =>
  invoke<QueryHistoryEntry[]>("get_query_history", { connectionId, limit });

export const searchTableHistory = (connectionId: string, tableName: string, limit?: number) =>
  invoke<QueryHistoryEntry[]>("search_table_history", { connectionId, tableName, limit });

// Saved queries
export const saveQueryCmd = (
  name: string,
  sql: string,
  connectionId?: string,
  description?: string,
) => invoke<number>("save_query", { name, sql, connectionId, description });

export const getSavedQueries = () =>
  invoke<SavedQuery[]>("get_saved_queries");

export const deleteSavedQuery = (id: number) =>
  invoke<void>("delete_saved_query", { id });

// Full schema (for AI context + editor autocomplete)
export interface SchemaContext {
  tables: TableContext[];
}

export interface TableContext {
  schema: string;
  name: string;
  columns: ColumnContext[];
}

export interface ColumnContext {
  name: string;
  data_type: string;
  is_primary_key: boolean;
  is_foreign_key: boolean;
  foreign_ref: string | null;
}

export const getFullSchema = (connectionId: string) =>
  invoke<SchemaContext>("get_full_schema", { connectionId });

// AI commands
export interface AIConfigInput {
  provider: string;
  api_key: string;
  model?: string;
}

// File export
export const exportFile = (content: string, defaultName: string) =>
  invoke<boolean>("export_file", { content, defaultName });

export const aiConfigure = (input: AIConfigInput) =>
  invoke<void>("ai_configure", { input });

export const aiStatus = () =>
  invoke<boolean>("ai_status");

export interface AIConfigResponse {
  provider: string;
  model: string;
}

export const aiGetConfig = () =>
  invoke<AIConfigResponse | null>("ai_get_config");

export interface AiPromptSuggestion {
  prompt: string;
  generated_sql: string;
}

export const searchAiPrompts = (query: string, limit?: number) =>
  invoke<AiPromptSuggestion[]>("search_ai_prompts", { query, limit });

export const aiNlToSql = (
  prompt: string,
  schemaContext: SchemaContext,
  recentQueries: string[],
) => invoke<string>("ai_nl_to_sql", { prompt, schemaContext, recentQueries });

export const aiExplain = (sql: string, schemaContext: SchemaContext) =>
  invoke<string>("ai_explain", { sql, schemaContext });

export const aiOptimize = (
  sql: string,
  schemaContext: SchemaContext,
  error?: string,
) => invoke<string>("ai_optimize", { sql, schemaContext, error });

export const aiComplete = (
  prefix: string,
  suffix: string,
  schemaContext: SchemaContext,
) => invoke<string>("ai_complete", { prefix, suffix, schemaContext });

export const aiChat = (message: string, schemaContext: SchemaContext) =>
  invoke<string>("ai_chat", { message, schemaContext });

// Migration commands (pg_dump / pg_restore)

export interface PgToolsStatus {
  pg_dump: string | null;
  pg_restore: string | null;
  version: string | null;
}

export interface DumpResult {
  success: boolean;
  file_path: string;
  size_bytes: number;
  error: string | null;
}

export interface RestoreResult {
  success: boolean;
  error: string | null;
}

export interface TransferResult {
  success: boolean;
  error: string | null;
}

export const detectPgTools = () =>
  invoke<PgToolsStatus>("detect_pg_tools");

export const pgDumpToFile = (
  connectionId: string,
  format: string,
  schemaOnly: boolean,
  tables?: string[],
  outputPath?: string,
) => invoke<DumpResult>("pg_dump_to_file", { connectionId, format, schemaOnly, tables, outputPath });

export const pgRestoreFromFile = (
  connectionId: string,
  filePath: string,
  clean: boolean,
  schemaOnly: boolean,
) => invoke<RestoreResult>("pg_restore_from_file", { connectionId, filePath, clean, schemaOnly });

export const pgTransfer = (
  sourceConnectionId: string,
  targetConnectionId: string,
  tables?: string[],
  schemaOnly?: boolean,
  clean?: boolean,
) => invoke<TransferResult>("pg_transfer", {
  sourceConnectionId,
  targetConnectionId,
  tables,
  schemaOnly: schemaOnly ?? false,
  clean: clean ?? false,
});
