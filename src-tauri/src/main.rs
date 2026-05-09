// Prevents additional console window on Windows in release.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod ollama;

use std::collections::HashMap;
use tauri::Manager;
use tokio::sync::Mutex;

/// Per-request cancel handles. The frontend hands us a request_id; we map it to a
/// oneshot sender so a later cancel call can interrupt the in-flight stream.
#[derive(Default)]
pub struct AppState {
    pub cancellations: Mutex<HashMap<String, tokio::sync::oneshot::Sender<()>>>,
}

/// Debug command: emit a `debug:run` event into the renderer carrying an
/// arbitrary JSON action. The frontend's debug bus listens and dispatches to
/// `window.echo`. Useful for agent-driven test scripts.
#[tauri::command]
async fn debug_run(window: tauri::Window, action: String) -> Result<(), String> {
    window.emit("debug:run", action).map_err(|e| e.to_string())?;
    Ok(())
}

fn main() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            ollama::ollama_chat_stream,
            ollama::ollama_cancel,
            ollama::ollama_health,
            debug_run,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
