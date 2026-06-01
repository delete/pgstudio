mod ai;
mod db;
mod storage;
mod commands;
mod migration;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_dialog::init())
        .manage(db::ConnectionManager::new())
        .manage(ai::AIService::new())
        .setup(|app| {
            let app_handle = app.handle().clone();

            // Initialize local SQLite database for history/favorites/analytics
            tauri::async_runtime::block_on(async {
                if let Err(e) = storage::init_local_db(&app_handle).await {
                    eprintln!("Failed to initialize local database: {}", e);
                    return;
                }

                // Restore AI config from local database
                let local_db = app_handle.state::<storage::LocalDb>();
                if let Ok(Some((provider_str, model, api_key))) = local_db.get_ai_config().await {
                    let provider = match provider_str.as_str() {
                        "openai" => ai::AIProvider::OpenAI,
                        "google" => ai::AIProvider::Google,
                        _ => ai::AIProvider::Anthropic,
                    };
                    let ai_service = app_handle.state::<ai::AIService>();
                    ai_service
                        .configure(ai::AIConfig {
                            provider,
                            api_key,
                            model,
                        })
                        .await;
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::test_connection,
            commands::connect,
            commands::disconnect,
            commands::execute_query,
            commands::get_databases,
            commands::switch_database,
            commands::get_schemas,
            commands::get_tables,
            commands::get_columns,
            commands::get_constraints,
            commands::get_indexes,
            commands::get_triggers,
            commands::get_rules,
            commands::get_policies,
            commands::get_table_data,
            commands::get_full_schema,
            commands::save_connection,
            commands::list_connections,
            commands::delete_connection,
            commands::get_query_history,
            commands::search_table_history,
            commands::save_query,
            commands::get_saved_queries,
            commands::delete_saved_query,
            commands::ai_configure,
            commands::ai_status,
            commands::ai_get_config,
            commands::ai_nl_to_sql,
            commands::ai_explain,
            commands::ai_optimize,
            commands::ai_complete,
            commands::ai_chat,
            commands::search_ai_prompts,
            commands::export_file,
            migration::detect_pg_tools,
            migration::pg_dump_to_file,
            migration::pg_restore_from_file,
            migration::pg_transfer,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
