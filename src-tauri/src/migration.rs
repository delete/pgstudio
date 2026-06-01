use crate::storage::LocalDb;
use serde::{Deserialize, Serialize};
use std::process::Command;
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct PgToolsStatus {
    pub pg_dump: Option<String>,
    pub pg_restore: Option<String>,
    pub version: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct DumpResult {
    pub success: bool,
    pub file_path: String,
    pub size_bytes: u64,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RestoreResult {
    pub success: bool,
    pub error: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TransferResult {
    pub success: bool,
    pub error: Option<String>,
}

/// Search common paths for pg_dump / pg_restore binaries
fn find_pg_binary(name: &str) -> Option<String> {
    let search_paths = [
        format!("/usr/local/bin/{}", name),
        format!("/usr/bin/{}", name),
        format!("/opt/homebrew/bin/{}", name),
    ];

    for path in &search_paths {
        if std::path::Path::new(path).exists() {
            return Some(path.clone());
        }
    }

    // Check Postgres.app versions
    if let Ok(entries) = std::fs::read_dir("/Applications/Postgres.app/Contents/Versions") {
        for entry in entries.flatten() {
            let bin_path = entry.path().join("bin").join(name);
            if bin_path.exists() {
                return bin_path.to_str().map(|s| s.to_string());
            }
        }
    }

    // Fall back to `which`
    if let Ok(output) = Command::new("which").arg(name).output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    None
}

fn get_pg_version(pg_dump_path: &str) -> Option<String> {
    if let Ok(output) = Command::new(pg_dump_path).arg("--version").output() {
        if output.status.success() {
            let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
            return Some(version);
        }
    }
    None
}

struct ConnInfo {
    host: String,
    port: u16,
    database: String,
    user: String,
    password: String,
}

async fn get_conn_info(local_db: &LocalDb, connection_id: &str) -> Result<ConnInfo, String> {
    let conns = local_db.list_connections().await.map_err(|e| e.to_string())?;
    let record = conns
        .iter()
        .find(|c| c.id == connection_id)
        .ok_or_else(|| format!("Connection '{}' not found", connection_id))?;
    let password = local_db
        .get_connection_password(connection_id)
        .await
        .map_err(|e| e.to_string())?;

    Ok(ConnInfo {
        host: record.host.clone(),
        port: record.port as u16,
        database: record.database.clone(),
        user: record.user.clone(),
        password,
    })
}

#[tauri::command]
pub async fn detect_pg_tools() -> Result<PgToolsStatus, String> {
    let pg_dump = find_pg_binary("pg_dump");
    let pg_restore = find_pg_binary("pg_restore");
    let version = pg_dump.as_ref().and_then(|p| get_pg_version(p));

    Ok(PgToolsStatus {
        pg_dump,
        pg_restore,
        version,
    })
}

#[tauri::command]
pub async fn pg_dump_to_file(
    connection_id: String,
    format: String,
    schema_only: bool,
    tables: Option<Vec<String>>,
    output_path: String,
    local_db: State<'_, LocalDb>,
) -> Result<DumpResult, String> {
    let pg_dump_path =
        find_pg_binary("pg_dump").ok_or_else(|| "pg_dump not found on system".to_string())?;

    let info = get_conn_info(&local_db, &connection_id).await?;

    let format_flag = match format.as_str() {
        "plain" => "p",
        "directory" => "d",
        _ => "c", // custom
    };

    let mut cmd = Command::new(&pg_dump_path);
    cmd.arg("-h").arg(&info.host)
        .arg("-p").arg(info.port.to_string())
        .arg("-U").arg(&info.user)
        .arg("-d").arg(&info.database)
        .arg("-F").arg(format_flag)
        .arg("-f").arg(&output_path)
        .env("PGPASSWORD", &info.password);

    if schema_only {
        cmd.arg("--schema-only");
    }

    if let Some(ref table_list) = tables {
        for table in table_list {
            cmd.arg("-t").arg(table);
        }
    }

    let output = cmd.output().map_err(|e| format!("Failed to execute pg_dump: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Ok(DumpResult {
            success: false,
            file_path: output_path,
            size_bytes: 0,
            error: Some(stderr),
        });
    }

    let size = std::fs::metadata(&output_path)
        .map(|m| m.len())
        .unwrap_or(0);

    Ok(DumpResult {
        success: true,
        file_path: output_path,
        size_bytes: size,
        error: None,
    })
}

#[tauri::command]
pub async fn pg_restore_from_file(
    connection_id: String,
    file_path: String,
    clean: bool,
    schema_only: bool,
    local_db: State<'_, LocalDb>,
) -> Result<RestoreResult, String> {
    let info = get_conn_info(&local_db, &connection_id).await?;

    // Detect if file is plain SQL (text) or binary format
    let is_plain_sql = {
        if let Ok(bytes) = std::fs::read(&file_path) {
            // Plain SQL files start with text characters; custom format starts with "PGDMP"
            !bytes.starts_with(b"PGDMP") && !std::path::Path::new(&file_path).is_dir()
        } else {
            // If we can't read, assume it needs pg_restore
            false
        }
    };

    if is_plain_sql {
        // For plain SQL, read file and execute via psql or direct connection
        let sql = std::fs::read_to_string(&file_path)
            .map_err(|e| format!("Failed to read SQL file: {}", e))?;

        // Use psql for plain SQL files
        let psql_path = find_pg_binary("psql");
        if let Some(psql) = psql_path {
            let mut cmd = Command::new(&psql);
            cmd.arg("-h").arg(&info.host)
                .arg("-p").arg(info.port.to_string())
                .arg("-U").arg(&info.user)
                .arg("-d").arg(&info.database)
                .arg("-f").arg(&file_path)
                .env("PGPASSWORD", &info.password);

            let output = cmd.output().map_err(|e| format!("Failed to execute psql: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                return Ok(RestoreResult {
                    success: false,
                    error: Some(stderr),
                });
            }

            return Ok(RestoreResult {
                success: true,
                error: None,
            });
        }

        // Fallback: use the existing connection manager to execute SQL
        // This is less ideal but works without psql
        drop(sql); // We'll use psql path above; if no psql, return error
        return Ok(RestoreResult {
            success: false,
            error: Some("psql not found on system. Plain SQL restore requires psql.".to_string()),
        });
    }

    // For custom/directory format, use pg_restore
    let pg_restore_path = find_pg_binary("pg_restore")
        .ok_or_else(|| "pg_restore not found on system".to_string())?;

    let mut cmd = Command::new(&pg_restore_path);
    cmd.arg("-h").arg(&info.host)
        .arg("-p").arg(info.port.to_string())
        .arg("-U").arg(&info.user)
        .arg("-d").arg(&info.database)
        .env("PGPASSWORD", &info.password);

    if clean {
        cmd.arg("--clean");
    }

    if schema_only {
        cmd.arg("--schema-only");
    }

    cmd.arg(&file_path);

    let output = cmd.output().map_err(|e| format!("Failed to execute pg_restore: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).to_string();
        return Ok(RestoreResult {
            success: false,
            error: Some(stderr),
        });
    }

    Ok(RestoreResult {
        success: true,
        error: None,
    })
}

#[tauri::command]
pub async fn pg_transfer(
    source_connection_id: String,
    target_connection_id: String,
    tables: Option<Vec<String>>,
    schema_only: bool,
    clean: bool,
    local_db: State<'_, LocalDb>,
) -> Result<TransferResult, String> {
    let pg_dump_path =
        find_pg_binary("pg_dump").ok_or_else(|| "pg_dump not found on system".to_string())?;
    let pg_restore_path = find_pg_binary("pg_restore")
        .ok_or_else(|| "pg_restore not found on system".to_string())?;

    let source = get_conn_info(&local_db, &source_connection_id).await?;
    let target = get_conn_info(&local_db, &target_connection_id).await?;

    // Build pg_dump command
    let mut dump_cmd = Command::new(&pg_dump_path);
    dump_cmd
        .arg("-h").arg(&source.host)
        .arg("-p").arg(source.port.to_string())
        .arg("-U").arg(&source.user)
        .arg("-d").arg(&source.database)
        .arg("-F").arg("c") // custom format for piping
        .env("PGPASSWORD", &source.password)
        .stdout(std::process::Stdio::piped());

    if schema_only {
        dump_cmd.arg("--schema-only");
    }

    if let Some(ref table_list) = tables {
        for table in table_list {
            dump_cmd.arg("-t").arg(table);
        }
    }

    let dump_child = dump_cmd
        .spawn()
        .map_err(|e| format!("Failed to start pg_dump: {}", e))?;

    let dump_stdout = dump_child
        .stdout
        .ok_or_else(|| "Failed to capture pg_dump stdout".to_string())?;

    // Build pg_restore command
    let mut restore_cmd = Command::new(&pg_restore_path);
    restore_cmd
        .arg("-h").arg(&target.host)
        .arg("-p").arg(target.port.to_string())
        .arg("-U").arg(&target.user)
        .arg("-d").arg(&target.database)
        .env("PGPASSWORD", &target.password)
        .stdin(dump_stdout);

    if clean {
        restore_cmd.arg("--clean");
    }

    let restore_output = restore_cmd
        .output()
        .map_err(|e| format!("Failed to execute pg_restore: {}", e))?;

    if !restore_output.status.success() {
        let stderr = String::from_utf8_lossy(&restore_output.stderr).to_string();
        // pg_restore often returns warnings that aren't fatal
        if stderr.contains("ERROR") {
            return Ok(TransferResult {
                success: false,
                error: Some(stderr),
            });
        }
    }

    Ok(TransferResult {
        success: true,
        error: None,
    })
}
