#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ws_server;

use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::Manager;

pub struct AppState {
    pub connected_clients: usize,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            connected_clients: 0,
        }
    }
}

#[tauri::command]
fn get_connection_count(state: tauri::State<Arc<Mutex<AppState>>>) -> usize {
    // Return current count (would need async for real impl)
    0
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            let app_state = Arc::new(Mutex::new(AppState::new()));
            app.manage(app_state.clone());

            // Get app handle for emitting events
            let app_handle = app.handle().clone();

            // Start WebSocket server in background
            tauri::async_runtime::spawn(async move {
                ws_server::start_server(app_handle).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![get_connection_count])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
