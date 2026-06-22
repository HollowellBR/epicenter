use log::info;
use tauri::Manager;
use tauri_plugin_log::{Target, TargetKind};

pub mod recorder;
use recorder::commands::{
    cancel_recording, close_recording_session, enumerate_recording_devices,
    get_current_recording_id, init_recording_session, start_recording, stop_recording, AppData,
};

pub mod transcription;
use transcription::{preload_parakeet_model, transcribe_audio_parakeet, ModelManager};

pub mod windows_path;
use windows_path::fix_windows_path;

pub mod foreground_window;
pub mod graceful_shutdown;
use graceful_shutdown::send_sigint;

pub mod command;
use command::{execute_command, spawn_command};

pub mod markdown_reader;
use markdown_reader::{bulk_delete_files, count_markdown_files, read_markdown_files};

pub mod download;

pub mod hotkey;

pub mod wakeword;
use wakeword::WakeWordState;

pub mod llama_server;
use llama_server::LlamaServerState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[tokio::main]
pub async fn run() {
    // Set up panic hook to capture crash information before the app exits.
    let previous_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |panic_info| {
        use std::backtrace::Backtrace;
        let payload = panic_info.payload();
        let location = panic_info
            .location()
            .map(|l| format!("{}:{}:{}", l.file(), l.line(), l.column()))
            .unwrap_or_else(|| "unknown location".to_string());
        let thread_name = std::thread::current()
            .name()
            .map(|s| s.to_string())
            .unwrap_or_else(|| "unnamed thread".to_string());

        let message = if let Some(s) = payload.downcast_ref::<&str>() {
            s.to_string()
        } else if let Some(s) = payload.downcast_ref::<String>() {
            s.clone()
        } else {
            "Unknown panic payload".to_string()
        };

        let backtrace = Backtrace::force_capture();

        eprintln!(
            "[panic] thread={} location={} message={}",
            thread_name, location, message
        );
        eprintln!("{}", backtrace);

        // Write crash log to temp directory
        {
            use std::fs::OpenOptions;
            use std::io::Write;
            let crash_log_path = std::env::temp_dir().join("steno-crash.log");
            if let Ok(mut file) = OpenOptions::new()
                .create(true)
                .append(true)
                .open(&crash_log_path)
            {
                let timestamp = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let _ = writeln!(
                    file,
                    "[{}] thread={} location={} message={}",
                    timestamp, thread_name, location, message
                );
                let _ = writeln!(file, "{}", backtrace);
                let _ = writeln!(file, "-----");
            }
        }

        previous_hook(panic_info);
    }));

    // Fix Windows PATH inheritance bug
    fix_windows_path();

    let log_plugin = tauri_plugin_log::Builder::new()
        .level(log::LevelFilter::Info)
        .level_for("steno::transcription", log::LevelFilter::Debug)
        .target(Target::new(TargetKind::Stdout))
        .target(Target::new(TargetKind::LogDir {
            file_name: Some("steno".to_string()),
        }))
        .build();

    let mut builder = tauri::Builder::default()
        .plugin(log_plugin)
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppData::new())
        .manage(ModelManager::new())
        .manage(WakeWordState::new())
        .manage(LlamaServerState::new());

    #[cfg(desktop)]
    {
        builder = builder
            .plugin(tauri_plugin_autostart::init(
                tauri_plugin_autostart::MacosLauncher::LaunchAgent,
                None,
            ))
            .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
                let _ = app
                    .get_webview_window("main")
                    .expect("no main window")
                    .set_focus();
            }));
    }

    // Register command handlers
    let builder = builder.invoke_handler(tauri::generate_handler![
        write_text,
        simulate_enter_keystroke,
        simulate_keystroke,
        // Audio recorder commands
        get_current_recording_id,
        enumerate_recording_devices,
        init_recording_session,
        close_recording_session,
        start_recording,
        stop_recording,
        cancel_recording,
        transcribe_audio_parakeet,
        preload_parakeet_model,
        send_sigint,
        // Command execution (prevents console window flash on Windows)
        execute_command,
        spawn_command,
        // Filesystem utilities
        read_markdown_files,
        count_markdown_files,
        bulk_delete_files,
        // Hotkey commands
        hotkey::register_hotkey,
        hotkey::unregister_hotkey,
        hotkey::list_hotkeys,
        // Wake word sidecar commands
        wakeword::start_wakeword,
        wakeword::stop_wakeword,
        wakeword::set_wakeword_threshold,
        wakeword::get_wakeword_status,
        // llama.cpp completion sidecar commands
        llama_server::start_llama_server,
        llama_server::stop_llama_server,
        llama_server::get_llama_server_status,
        llama_server::resolve_bundled_llama_server,
        // Foreground window detection (context-aware voice commands)
        foreground_window::get_foreground_window,
        // File download (native HTTP, avoids webview memory issues)
        download::download_file,
    ]);

    let app = builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // Start the rdev hotkey listener
    info!("Starting global hotkey listener");
    hotkey::start_listener(app.handle().clone());

    app.run(|_handler, _event| {});
}

use enigo::{Direction, Enigo, Key, Keyboard, Settings};
use tauri_plugin_clipboard_manager::ClipboardExt;

/// Writes text at the cursor position using the clipboard sandwich technique
#[tauri::command]
async fn write_text(app: tauri::AppHandle, text: String) -> Result<(), String> {
    // 1. Save current clipboard content
    let original_clipboard = app.clipboard().read_text().ok();

    // 2. Write new text to clipboard
    app.clipboard()
        .write_text(&text)
        .map_err(|e| format!("Failed to write to clipboard: {}", e))?;

    // Small delay to ensure clipboard is updated
    tokio::time::sleep(tokio::time::Duration::from_millis(50)).await;

    // 3. Simulate paste operation using virtual key codes (layout-independent)
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    #[cfg(target_os = "macos")]
    let (modifier, v_key) = (Key::Meta, Key::Other(9));
    #[cfg(target_os = "windows")]
    let (modifier, v_key) = (Key::Control, Key::Other(0x56));
    #[cfg(target_os = "linux")]
    let (modifier, v_key) = (Key::Control, Key::Unicode('v'));

    enigo
        .key(modifier, Direction::Press)
        .map_err(|e| format!("Failed to press modifier key: {}", e))?;
    enigo
        .key(v_key, Direction::Press)
        .map_err(|e| format!("Failed to press V key: {}", e))?;
    enigo
        .key(v_key, Direction::Release)
        .map_err(|e| format!("Failed to release V key: {}", e))?;
    enigo
        .key(modifier, Direction::Release)
        .map_err(|e| format!("Failed to release modifier key: {}", e))?;

    // Small delay to ensure paste completes
    tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;

    // 4. Restore original clipboard content
    if let Some(content) = original_clipboard {
        app.clipboard()
            .write_text(&content)
            .map_err(|e| format!("Failed to restore clipboard: {}", e))?;
    }

    Ok(())
}

/// Simulates pressing the Enter/Return key
#[tauri::command]
async fn simulate_enter_keystroke() -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;
    enigo
        .key(Key::Return, Direction::Click)
        .map_err(|e| format!("Failed to simulate Enter key: {}", e))?;
    Ok(())
}

/// Simulates an arbitrary keystroke combination (e.g., "Ctrl+Shift+S")
#[tauri::command]
async fn simulate_keystroke(keys: String, delay_ms: u64) -> Result<(), String> {
    let mut enigo = Enigo::new(&Settings::default()).map_err(|e| e.to_string())?;

    let parts: Vec<&str> = keys.split('+').map(|s| s.trim()).collect();
    if parts.is_empty() {
        return Err("No keys specified".to_string());
    }

    // Separate modifiers from the main key (last part)
    let (modifier_strs, main_key_str) = parts.split_at(parts.len() - 1);

    let main_key_str = main_key_str[0];

    // Parse modifiers
    let mut modifiers = Vec::new();
    for m in modifier_strs {
        let key = match m.to_lowercase().as_str() {
            "ctrl" | "control" => Key::Control,
            "shift" => Key::Shift,
            "alt" => Key::Alt,
            "meta" | "win" | "cmd" | "command" | "super" => Key::Meta,
            other => return Err(format!("Unknown modifier: {}", other)),
        };
        modifiers.push(key);
    }

    // Parse main key
    let main_key = match main_key_str.to_lowercase().as_str() {
        "enter" | "return" => Key::Return,
        "tab" => Key::Tab,
        "space" => Key::Space,
        "backspace" => Key::Backspace,
        "delete" => Key::Delete,
        "escape" | "esc" => Key::Escape,
        "up" => Key::UpArrow,
        "down" => Key::DownArrow,
        "left" => Key::LeftArrow,
        "right" => Key::RightArrow,
        "home" => Key::Home,
        "end" => Key::End,
        "pageup" => Key::PageUp,
        "pagedown" => Key::PageDown,
        "f1" => Key::F1,
        "f2" => Key::F2,
        "f3" => Key::F3,
        "f4" => Key::F4,
        "f5" => Key::F5,
        "f6" => Key::F6,
        "f7" => Key::F7,
        "f8" => Key::F8,
        "f9" => Key::F9,
        "f10" => Key::F10,
        "f11" => Key::F11,
        "f12" => Key::F12,
        s if s.len() == 1 => Key::Unicode(s.chars().next().unwrap()),
        other => return Err(format!("Unknown key: {}", other)),
    };

    // Press modifiers
    for modifier in &modifiers {
        enigo
            .key(*modifier, Direction::Press)
            .map_err(|e| format!("Failed to press modifier: {}", e))?;
    }

    // Small delay if specified
    if delay_ms > 0 {
        tokio::time::sleep(tokio::time::Duration::from_millis(delay_ms)).await;
    }

    // Press and release main key
    enigo
        .key(main_key, Direction::Click)
        .map_err(|e| format!("Failed to click key: {}", e))?;

    // Release modifiers in reverse order
    for modifier in modifiers.iter().rev() {
        enigo
            .key(*modifier, Direction::Release)
            .map_err(|e| format!("Failed to release modifier: {}", e))?;
    }

    Ok(())
}
