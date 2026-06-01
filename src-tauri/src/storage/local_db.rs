use anyhow::Result;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{AppHandle, Manager};
use tokio::sync::Mutex;

pub struct LocalDb {
    conn: Arc<Mutex<Connection>>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct QueryHistoryEntry {
    pub id: i64,
    pub connection_id: String,
    pub sql: String,
    pub execution_time_ms: i64,
    pub row_count: i64,
    pub success: bool,
    pub error_message: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct SavedQuery {
    pub id: i64,
    pub name: String,
    pub sql: String,
    pub connection_id: Option<String>,
    pub description: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConnectionRecord {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: i32,
    pub database: String,
    pub user: String,
    pub ssl_mode: String,
    pub color: Option<String>,
    pub created_at: String,
}

fn db_path(app_handle: &AppHandle) -> PathBuf {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .expect("Failed to get app data dir");
    std::fs::create_dir_all(&app_dir).expect("Failed to create app data dir");
    app_dir.join("pgstudio.db")
}

pub async fn init_local_db(app_handle: &AppHandle) -> Result<()> {
    let path = db_path(app_handle);
    let conn = Connection::open(&path)?;

    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS connections (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            host TEXT NOT NULL,
            port INTEGER NOT NULL DEFAULT 5432,
            database TEXT NOT NULL,
            user TEXT NOT NULL,
            ssl_mode TEXT NOT NULL DEFAULT 'prefer',
            color TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS query_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id TEXT NOT NULL,
            sql TEXT NOT NULL,
            execution_time_ms INTEGER,
            row_count INTEGER,
            success BOOLEAN NOT NULL DEFAULT 1,
            error_message TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (connection_id) REFERENCES connections(id)
        );

        CREATE TABLE IF NOT EXISTS saved_queries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            sql TEXT NOT NULL,
            connection_id TEXT,
            description TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (connection_id) REFERENCES connections(id)
        );

        CREATE TABLE IF NOT EXISTS usage_analytics (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connection_id TEXT NOT NULL,
            table_schema TEXT NOT NULL,
            table_name TEXT NOT NULL,
            access_count INTEGER NOT NULL DEFAULT 1,
            last_accessed TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(connection_id, table_schema, table_name),
            FOREIGN KEY (connection_id) REFERENCES connections(id)
        );

        CREATE TABLE IF NOT EXISTS ai_config (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            provider TEXT NOT NULL,
            model TEXT NOT NULL,
            api_key TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS ai_prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            prompt TEXT NOT NULL UNIQUE,
            use_count INTEGER NOT NULL DEFAULT 1,
            last_used TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_history_connection ON query_history(connection_id);
        CREATE INDEX IF NOT EXISTS idx_history_created ON query_history(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_analytics_count ON usage_analytics(access_count DESC);
        CREATE INDEX IF NOT EXISTS idx_ai_prompts_use ON ai_prompts(use_count DESC);
        ",
    )?;

    // Migration: add password column to connections (ignore error if already exists)
    let _ = conn.execute(
        "ALTER TABLE connections ADD COLUMN password TEXT NOT NULL DEFAULT ''",
        [],
    );

    // Migration: add generated_sql column to ai_prompts
    let _ = conn.execute(
        "ALTER TABLE ai_prompts ADD COLUMN generated_sql TEXT NOT NULL DEFAULT ''",
        [],
    );

    // Store in app state
    let local_db = LocalDb {
        conn: Arc::new(Mutex::new(conn)),
    };
    app_handle.manage(local_db);

    Ok(())
}

impl LocalDb {
    pub async fn save_connection(&self, conn: &ConnectionRecord, password: &str) -> Result<()> {
        let db = self.conn.lock().await;
        db.execute(
            "INSERT OR REPLACE INTO connections (id, name, host, port, database, user, ssl_mode, color, password, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, COALESCE((SELECT created_at FROM connections WHERE id = ?1), datetime('now')))",
            rusqlite::params![conn.id, conn.name, conn.host, conn.port, conn.database, conn.user, conn.ssl_mode, conn.color, password],
        )?;
        Ok(())
    }

    pub async fn list_connections(&self) -> Result<Vec<ConnectionRecord>> {
        let db = self.conn.lock().await;
        let mut stmt = db.prepare(
            "SELECT id, name, host, port, database, user, ssl_mode, color, created_at FROM connections ORDER BY name",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(ConnectionRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                host: row.get(2)?,
                port: row.get(3)?,
                database: row.get(4)?,
                user: row.get(5)?,
                ssl_mode: row.get(6)?,
                color: row.get(7)?,
                created_at: row.get(8)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub async fn delete_connection(&self, id: &str) -> Result<()> {
        let db = self.conn.lock().await;
        db.execute("DELETE FROM connections WHERE id = ?1", [id])?;
        Ok(())
    }

    pub async fn add_history(
        &self,
        connection_id: &str,
        sql: &str,
        execution_time_ms: i64,
        row_count: i64,
        success: bool,
        error_message: Option<&str>,
    ) -> Result<()> {
        let db = self.conn.lock().await;
        db.execute(
            "INSERT INTO query_history (connection_id, sql, execution_time_ms, row_count, success, error_message)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            rusqlite::params![connection_id, sql, execution_time_ms, row_count, success, error_message],
        )?;
        Ok(())
    }

    pub async fn get_history(&self, connection_id: &str, limit: i64) -> Result<Vec<QueryHistoryEntry>> {
        let db = self.conn.lock().await;
        let mut stmt = db.prepare(
            "SELECT id, connection_id, sql, execution_time_ms, row_count, success, error_message, created_at
             FROM query_history
             WHERE connection_id = ?1
             ORDER BY created_at DESC
             LIMIT ?2",
        )?;
        let rows = stmt.query_map(rusqlite::params![connection_id, limit], |row| {
            Ok(QueryHistoryEntry {
                id: row.get(0)?,
                connection_id: row.get(1)?,
                sql: row.get(2)?,
                execution_time_ms: row.get(3)?,
                row_count: row.get(4)?,
                success: row.get(5)?,
                error_message: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub async fn get_all_history(&self, limit: i64) -> Result<Vec<QueryHistoryEntry>> {
        let db = self.conn.lock().await;
        let mut stmt = db.prepare(
            "SELECT id, connection_id, sql, execution_time_ms, row_count, success, error_message, created_at
             FROM query_history
             ORDER BY created_at DESC
             LIMIT ?1",
        )?;
        let rows = stmt.query_map(rusqlite::params![limit], |row| {
            Ok(QueryHistoryEntry {
                id: row.get(0)?,
                connection_id: row.get(1)?,
                sql: row.get(2)?,
                execution_time_ms: row.get(3)?,
                row_count: row.get(4)?,
                success: row.get(5)?,
                error_message: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub async fn search_table_history(&self, connection_id: &str, table_name: &str, limit: i64) -> Result<Vec<QueryHistoryEntry>> {
        let db = self.conn.lock().await;
        let pattern = format!("%{}%", table_name);
        let mut stmt = db.prepare(
            "SELECT id, connection_id, sql, execution_time_ms, row_count, success, error_message, created_at
             FROM query_history
             WHERE connection_id = ?1 AND sql LIKE ?2 AND success = 1
             ORDER BY created_at DESC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(rusqlite::params![connection_id, pattern, limit], |row| {
            Ok(QueryHistoryEntry {
                id: row.get(0)?,
                connection_id: row.get(1)?,
                sql: row.get(2)?,
                execution_time_ms: row.get(3)?,
                row_count: row.get(4)?,
                success: row.get(5)?,
                error_message: row.get(6)?,
                created_at: row.get(7)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub async fn save_query(&self, query: &SavedQuery) -> Result<i64> {
        let db = self.conn.lock().await;
        db.execute(
            "INSERT INTO saved_queries (name, sql, connection_id, description) VALUES (?1, ?2, ?3, ?4)",
            rusqlite::params![query.name, query.sql, query.connection_id, query.description],
        )?;
        Ok(db.last_insert_rowid())
    }

    pub async fn get_saved_queries(&self) -> Result<Vec<SavedQuery>> {
        let db = self.conn.lock().await;
        let mut stmt = db.prepare(
            "SELECT id, name, sql, connection_id, description, created_at, updated_at FROM saved_queries ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(SavedQuery {
                id: row.get(0)?,
                name: row.get(1)?,
                sql: row.get(2)?,
                connection_id: row.get(3)?,
                description: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
            })
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub async fn delete_saved_query(&self, id: i64) -> Result<()> {
        let db = self.conn.lock().await;
        db.execute("DELETE FROM saved_queries WHERE id = ?1", [id])?;
        Ok(())
    }

    pub async fn get_connection_password(&self, id: &str) -> Result<String> {
        let db = self.conn.lock().await;
        let pw: String = db.query_row(
            "SELECT COALESCE(password, '') FROM connections WHERE id = ?1",
            [id],
            |row| row.get(0),
        )?;
        Ok(pw)
    }

    pub async fn save_ai_config(&self, provider: &str, model: &str, api_key: &str) -> Result<()> {
        let db = self.conn.lock().await;
        db.execute(
            "INSERT OR REPLACE INTO ai_config (id, provider, model, api_key) VALUES (1, ?1, ?2, ?3)",
            rusqlite::params![provider, model, api_key],
        )?;
        Ok(())
    }

    pub async fn save_ai_prompt(&self, prompt: &str, generated_sql: &str) -> Result<()> {
        let db = self.conn.lock().await;
        db.execute(
            "INSERT INTO ai_prompts (prompt, generated_sql) VALUES (?1, ?2)
             ON CONFLICT(prompt) DO UPDATE SET use_count = use_count + 1, last_used = datetime('now'), generated_sql = ?2",
            rusqlite::params![prompt, generated_sql],
        )?;
        Ok(())
    }

    pub async fn search_ai_prompts(&self, query: &str, limit: i64) -> Result<Vec<(String, String)>> {
        let db = self.conn.lock().await;
        let pattern = format!("%{}%", query);
        let mut stmt = db.prepare(
            "SELECT prompt, COALESCE(generated_sql, '') FROM ai_prompts WHERE prompt LIKE ?1 ORDER BY use_count DESC, last_used DESC LIMIT ?2",
        )?;
        let rows = stmt.query_map(rusqlite::params![pattern, limit], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        Ok(rows.filter_map(|r| r.ok()).collect())
    }

    pub async fn get_ai_config(&self) -> Result<Option<(String, String, String)>> {
        let db = self.conn.lock().await;
        let result = db.query_row(
            "SELECT provider, model, api_key FROM ai_config WHERE id = 1",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        );
        match result {
            Ok(config) => Ok(Some(config)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(e) => Err(e.into()),
        }
    }
}
