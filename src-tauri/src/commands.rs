use crate::ai::{AIConfig, AIProvider, AIService, SchemaContext, TableContext, ColumnContext};
use crate::db::{self, ConnectionConfig, ConnectionManager};
use crate::storage::{ConnectionRecord, LocalDb, QueryHistoryEntry, SavedQuery};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionInput {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    pub password: String,
    pub ssl_mode: Option<String>,
    pub color: Option<String>,
}

impl From<&ConnectionInput> for ConnectionConfig {
    fn from(input: &ConnectionInput) -> Self {
        ConnectionConfig {
            id: input.id.clone(),
            name: input.name.clone(),
            host: input.host.clone(),
            port: input.port,
            database: input.database.clone(),
            user: input.user.clone(),
            password: input.password.clone(),
            ssl_mode: Default::default(),
            color: input.color.clone(),
        }
    }
}

#[tauri::command]
pub async fn test_connection(input: ConnectionInput) -> Result<String, String> {
    let config: ConnectionConfig = (&input).into();
    ConnectionManager::test_connection(&config)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn connect(
    input: ConnectionInput,
    manager: State<'_, ConnectionManager>,
    local_db: State<'_, LocalDb>,
) -> Result<(), String> {
    let mut config: ConnectionConfig = (&input).into();
    // If password is empty, retrieve from local database
    if config.password.is_empty() {
        if let Ok(pw) = local_db.get_connection_password(&config.id).await {
            config.password = pw;
        }
    }
    manager.connect(&config).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn disconnect(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<(), String> {
    manager
        .disconnect(&connection_id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn execute_query(
    connection_id: String,
    sql: String,
    manager: State<'_, ConnectionManager>,
    local_db: State<'_, LocalDb>,
) -> Result<db::QueryResult, String> {
    let client = manager
        .get_client(&connection_id)
        .await
        .map_err(|e| e.to_string())?;

    match db::execute_query(&client, &sql).await {
        Ok(result) => {
            // Save to history
            let _ = local_db
                .add_history(
                    &connection_id,
                    &sql,
                    result.execution_time_ms as i64,
                    result.row_count as i64,
                    true,
                    None,
                )
                .await;
            Ok(result)
        }
        Err(e) => {
            let error_msg = e.to_string();
            // Save failed query to history too
            let _ = local_db
                .add_history(&connection_id, &sql, 0, 0, false, Some(&error_msg))
                .await;
            Err(error_msg)
        }
    }
}

#[tauri::command]
pub async fn switch_database(
    connection_id: String,
    database: String,
    manager: State<'_, ConnectionManager>,
    local_db: State<'_, LocalDb>,
) -> Result<(), String> {
    // Get connection record + password from local DB
    let conns = local_db.list_connections().await.map_err(|e| e.to_string())?;
    let record = conns.iter().find(|c| c.id == connection_id)
        .ok_or_else(|| "Connection not found".to_string())?;
    let password = local_db.get_connection_password(&connection_id).await.map_err(|e| e.to_string())?;

    // Disconnect current
    let _ = manager.disconnect(&connection_id).await;

    // Reconnect with the new database name
    let config = ConnectionConfig {
        id: connection_id.clone(),
        name: record.name.clone(),
        host: record.host.clone(),
        port: record.port as u16,
        database,
        user: record.user.clone(),
        password,
        ssl_mode: Default::default(),
        color: record.color.clone(),
    };

    manager.connect(&config).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_databases(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<db::DatabaseInfo>, String> {
    let client = manager
        .get_client(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    db::get_databases(&client).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_schemas(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<db::SchemaInfo>, String> {
    let client = manager
        .get_client(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    db::get_schemas(&client).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_tables(
    connection_id: String,
    schema: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<db::TableInfo>, String> {
    let client = manager
        .get_client(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    db::get_tables(&client, &schema)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_columns(
    connection_id: String,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<db::ColumnInfo>, String> {
    let client = manager
        .get_client(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    db::get_columns(&client, &schema, &table)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_constraints(
    connection_id: String,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<db::ConstraintInfo>, String> {
    let client = manager.get_client(&connection_id).await.map_err(|e| e.to_string())?;
    db::get_constraints(&client, &schema, &table).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_indexes(
    connection_id: String,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<db::IndexInfo>, String> {
    let client = manager.get_client(&connection_id).await.map_err(|e| e.to_string())?;
    db::get_indexes(&client, &schema, &table).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_triggers(
    connection_id: String,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<db::TriggerInfo>, String> {
    let client = manager.get_client(&connection_id).await.map_err(|e| e.to_string())?;
    db::get_triggers(&client, &schema, &table).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_rules(
    connection_id: String,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<db::RuleInfo>, String> {
    let client = manager.get_client(&connection_id).await.map_err(|e| e.to_string())?;
    db::get_rules(&client, &schema, &table).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_policies(
    connection_id: String,
    schema: String,
    table: String,
    manager: State<'_, ConnectionManager>,
) -> Result<Vec<db::PolicyInfo>, String> {
    let client = manager.get_client(&connection_id).await.map_err(|e| e.to_string())?;
    db::get_policies(&client, &schema, &table).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_table_data(
    connection_id: String,
    schema: String,
    table: String,
    limit: Option<i64>,
    offset: Option<i64>,
    sort_column: Option<String>,
    sort_direction: Option<String>,
    manager: State<'_, ConnectionManager>,
) -> Result<db::QueryResult, String> {
    let client = manager
        .get_client(&connection_id)
        .await
        .map_err(|e| e.to_string())?;
    let limit = limit.unwrap_or(100);
    let offset = offset.unwrap_or(0);
    let order_clause = match sort_column {
        Some(ref col) if !col.is_empty() => {
            let dir = match sort_direction.as_deref() {
                Some("DESC") | Some("desc") => "DESC",
                _ => "ASC",
            };
            format!(" ORDER BY {} {}", quote_ident(col), dir)
        }
        _ => String::new(),
    };
    let sql = format!(
        "SELECT * FROM {}.{}{} LIMIT {} OFFSET {}",
        quote_ident(&schema),
        quote_ident(&table),
        order_clause,
        limit,
        offset
    );
    db::execute_query(&client, &sql)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn search_table_history(
    connection_id: String,
    table_name: String,
    limit: Option<i64>,
    local_db: State<'_, LocalDb>,
) -> Result<Vec<QueryHistoryEntry>, String> {
    let limit = limit.unwrap_or(10);
    local_db
        .search_table_history(&connection_id, &table_name, limit)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_connection(
    input: ConnectionInput,
    local_db: State<'_, LocalDb>,
) -> Result<(), String> {
    let record = ConnectionRecord {
        id: input.id,
        name: input.name,
        host: input.host,
        port: input.port as i32,
        database: input.database,
        user: input.user,
        ssl_mode: input.ssl_mode.unwrap_or_else(|| "prefer".into()),
        color: input.color,
        created_at: String::new(),
    };

    local_db
        .save_connection(&record, &input.password)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn list_connections(
    local_db: State<'_, LocalDb>,
) -> Result<Vec<ConnectionRecord>, String> {
    local_db.list_connections().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_connection(
    id: String,
    local_db: State<'_, LocalDb>,
) -> Result<(), String> {
    local_db
        .delete_connection(&id)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_query_history(
    connection_id: Option<String>,
    limit: Option<i64>,
    local_db: State<'_, LocalDb>,
) -> Result<Vec<QueryHistoryEntry>, String> {
    let limit = limit.unwrap_or(50);
    match connection_id {
        Some(id) => local_db.get_history(&id, limit).await.map_err(|e| e.to_string()),
        None => local_db.get_all_history(limit).await.map_err(|e| e.to_string()),
    }
}

#[tauri::command]
pub async fn save_query(
    name: String,
    sql: String,
    connection_id: Option<String>,
    description: Option<String>,
    local_db: State<'_, LocalDb>,
) -> Result<i64, String> {
    let query = SavedQuery {
        id: 0,
        name,
        sql,
        connection_id,
        description,
        created_at: String::new(),
        updated_at: String::new(),
    };
    local_db.save_query(&query).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_saved_queries(
    local_db: State<'_, LocalDb>,
) -> Result<Vec<SavedQuery>, String> {
    local_db
        .get_saved_queries()
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn delete_saved_query(
    id: i64,
    local_db: State<'_, LocalDb>,
) -> Result<(), String> {
    local_db
        .delete_saved_query(id)
        .await
        .map_err(|e| e.to_string())
}

/// Get full schema for all tables (used for AI context + editor autocomplete)
#[tauri::command]
pub async fn get_full_schema(
    connection_id: String,
    manager: State<'_, ConnectionManager>,
) -> Result<SchemaContext, String> {
    let client = manager
        .get_client(&connection_id)
        .await
        .map_err(|e| e.to_string())?;

    let schemas = db::get_schemas(&client).await.map_err(|e| e.to_string())?;
    let mut tables_ctx = Vec::new();

    for schema in &schemas {
        let tables = db::get_tables(&client, &schema.name)
            .await
            .map_err(|e| e.to_string())?;
        for table in &tables {
            if table.table_type != "BASE TABLE" && table.table_type != "VIEW" {
                continue;
            }
            let columns = db::get_columns(&client, &schema.name, &table.name)
                .await
                .map_err(|e| e.to_string())?;
            tables_ctx.push(TableContext {
                schema: schema.name.clone(),
                name: table.name.clone(),
                columns: columns
                    .iter()
                    .map(|c| ColumnContext {
                        name: c.name.clone(),
                        data_type: c.data_type.clone(),
                        is_primary_key: c.is_primary_key,
                        is_foreign_key: c.is_foreign_key,
                        foreign_ref: if c.is_foreign_key {
                            Some(format!(
                                "{}.{}",
                                c.foreign_table.as_deref().unwrap_or("?"),
                                c.foreign_column.as_deref().unwrap_or("?")
                            ))
                        } else {
                            None
                        },
                    })
                    .collect(),
            });
        }
    }

    Ok(SchemaContext { tables: tables_ctx })
}

// ── AI Commands ──────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct AIConfigInput {
    pub provider: String,
    pub api_key: String,
    pub model: Option<String>,
}

#[tauri::command]
pub async fn ai_configure(
    input: AIConfigInput,
    ai: State<'_, AIService>,
    local_db: State<'_, LocalDb>,
) -> Result<(), String> {
    let provider = match input.provider.as_str() {
        "anthropic" => AIProvider::Anthropic,
        "openai" => AIProvider::OpenAI,
        "google" => AIProvider::Google,
        _ => return Err("Invalid provider. Use 'anthropic', 'openai', or 'google'.".into()),
    };

    let model = input.model.unwrap_or_else(|| {
        match provider {
            AIProvider::Anthropic => "claude-sonnet-4-6".into(),
            AIProvider::OpenAI => "gpt-4.1".into(),
            AIProvider::Google => "gemini-2.5-flash-lite".into(),
        }
    });

    // Persist to local database
    local_db
        .save_ai_config(&input.provider, &model, &input.api_key)
        .await
        .map_err(|e| e.to_string())?;

    ai.configure(AIConfig {
        provider,
        api_key: input.api_key,
        model,
    })
    .await;

    Ok(())
}

#[tauri::command]
pub async fn ai_status(ai: State<'_, AIService>) -> Result<bool, String> {
    Ok(ai.is_configured().await)
}

#[derive(Debug, Serialize)]
pub struct AIConfigResponse {
    pub provider: String,
    pub model: String,
}

#[tauri::command]
pub async fn ai_get_config(
    local_db: State<'_, LocalDb>,
) -> Result<Option<AIConfigResponse>, String> {
    match local_db.get_ai_config().await.map_err(|e| e.to_string())? {
        Some((provider, model, _)) => Ok(Some(AIConfigResponse { provider, model })),
        None => Ok(None),
    }
}

#[derive(Debug, Serialize)]
pub struct AiPromptSuggestion {
    pub prompt: String,
    pub generated_sql: String,
}

#[tauri::command]
pub async fn ai_nl_to_sql(
    prompt: String,
    schema_context: SchemaContext,
    recent_queries: Vec<String>,
    ai: State<'_, AIService>,
    local_db: State<'_, LocalDb>,
) -> Result<String, String> {
    let result = ai.nl_to_sql(&prompt, &schema_context, &recent_queries)
        .await
        .map_err(|e| e.to_string())?;
    // Save prompt + generated SQL for autocomplete
    let _ = local_db.save_ai_prompt(&prompt, &result).await;
    Ok(result)
}

#[tauri::command]
pub async fn search_ai_prompts(
    query: String,
    limit: Option<i64>,
    local_db: State<'_, LocalDb>,
) -> Result<Vec<AiPromptSuggestion>, String> {
    let results = local_db
        .search_ai_prompts(&query, limit.unwrap_or(10))
        .await
        .map_err(|e| e.to_string())?;
    Ok(results
        .into_iter()
        .map(|(prompt, generated_sql)| AiPromptSuggestion { prompt, generated_sql })
        .collect())
}

#[tauri::command]
pub async fn ai_explain(
    sql: String,
    schema_context: SchemaContext,
    ai: State<'_, AIService>,
) -> Result<String, String> {
    ai.explain_query(&sql, &schema_context)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_optimize(
    sql: String,
    schema_context: SchemaContext,
    error: Option<String>,
    ai: State<'_, AIService>,
) -> Result<String, String> {
    ai.optimize_query(&sql, &schema_context, error.as_deref())
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_complete(
    prefix: String,
    suffix: String,
    schema_context: SchemaContext,
    ai: State<'_, AIService>,
) -> Result<String, String> {
    ai.complete_sql(&prefix, &suffix, &schema_context)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_chat(
    message: String,
    schema_context: SchemaContext,
    ai: State<'_, AIService>,
) -> Result<String, String> {
    let ddl = schema_context.to_ddl_summary();
    let system = format!(
        "You are a PostgreSQL expert assistant embedded in a database client called PgStudio. \
         Help users with queries, schema design, performance, and PostgreSQL features. \
         Be concise and practical. Use the schema below for context.\n\n\
         Database schema:\n{ddl}"
    );
    ai.chat(&system, &message)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn export_file(
    content: String,
    default_name: String,
    app: tauri::AppHandle,
) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;

    let file_path = app
        .dialog()
        .file()
        .set_file_name(&default_name)
        .blocking_save_file();

    match file_path {
        Some(path) => {
            std::fs::write(path.as_path().unwrap(), content.as_bytes())
                .map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false), // User cancelled
    }
}

fn quote_ident(s: &str) -> String {
    format!("\"{}\"", s.replace('"', "\"\""))
}
