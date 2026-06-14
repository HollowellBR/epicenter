//! Bundled llama.cpp `llama-server` lifecycle manager.
//!
//! Spawns a prebuilt `llama-server` binary by path (mirroring the wakeword
//! sidecar pattern) and exposes an OpenAI-compatible HTTP API on localhost that
//! the transformation pipeline talks to. The binary is prebuilt (never compiled
//! in-tree), which avoids the C++ build issues that forced Whisper C++ off on
//! Windows.

use log::{error, info};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::{path::BaseDirectory, AppHandle, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

/// State managed by Tauri for the llama-server sidecar.
pub struct LlamaServerState {
    inner: Arc<Mutex<LlamaServerInner>>,
}

struct LlamaServerInner {
    child: Option<Child>,
    model_path: Option<String>,
    port: u16,
    status: LlamaServerStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LlamaServerStatus {
    Running,
    Stopped,
    Error,
}

impl LlamaServerState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(LlamaServerInner {
                child: None,
                model_path: None,
                port: 0,
                status: LlamaServerStatus::Stopped,
            })),
        }
    }
}

impl Default for LlamaServerState {
    fn default() -> Self {
        Self::new()
    }
}

/// Resolve the llama-server binary to run.
///
/// An explicit user-provided path wins; otherwise we fall back to the binary
/// bundled with the app under `binaries/` (Tauri resource), so the backend is
/// zero-setup when a binary ships with the app.
fn resolve_server_binary(app: &AppHandle, explicit: &str) -> Option<String> {
    if !explicit.is_empty() && std::path::Path::new(explicit).exists() {
        return Some(explicit.to_string());
    }
    let name = if cfg!(target_os = "windows") {
        "binaries/llama-server.exe"
    } else {
        "binaries/llama-server"
    };
    match app.path().resolve(name, BaseDirectory::Resource) {
        Ok(path) if path.exists() => Some(path.to_string_lossy().into_owned()),
        _ => None,
    }
}

/// Return the path to the bundled llama-server binary, if one ships with the app.
/// Used by the settings UI to show whether the backend is ready out of the box.
#[tauri::command]
pub async fn resolve_bundled_llama_server(app: AppHandle) -> Result<Option<String>, String> {
    Ok(resolve_server_binary(&app, ""))
}

/// Start (or reuse) the llama-server sidecar for the given model.
///
/// If a server is already running for the same model + port, this is a no-op so
/// callers can lazily ensure-started before every transform. Otherwise any
/// existing server is stopped and a new one is launched, and we block until its
/// `/health` endpoint reports ready (model load can take several seconds).
#[tauri::command]
pub async fn start_llama_server(
    app: AppHandle,
    server_path: String,
    model_path: String,
    port: u16,
    ctx_size: Option<u32>,
    n_gpu_layers: Option<i32>,
) -> Result<(), String> {
    let state = app.state::<LlamaServerState>();

    // Reuse an already-running server with identical config.
    {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        if inner.status == LlamaServerStatus::Running
            && inner.port == port
            && inner.model_path.as_deref() == Some(model_path.as_str())
        {
            return Ok(());
        }
    }

    // Resolve the binary (explicit path wins, else the bundled one). Do this
    // before stopping any running server so a misconfiguration is non-destructive.
    let server_path = resolve_server_binary(&app, &server_path).ok_or_else(|| {
        "No llama-server binary is available. Ship a prebuilt llama-server with the app, \
         or set its path in Settings \u{2192} Transformation."
            .to_string()
    })?;

    // Stop any existing server before starting a new one.
    let mut old_child = {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.status = LlamaServerStatus::Stopped;
        inner.child.take()
    };
    if let Some(ref mut child) = old_child {
        let _ = child.kill().await;
    }

    let ctx_size = ctx_size.unwrap_or(4096);
    // Offload all layers when a GPU backend is present; llama.cpp falls back to
    // CPU automatically if it cannot.
    let n_gpu_layers = n_gpu_layers.unwrap_or(99);

    info!(
        "[LlamaServer] Starting: {} -m {} --port {} -c {} -ngl {}",
        server_path, model_path, port, ctx_size, n_gpu_layers
    );

    let mut child = Command::new(&server_path)
        .arg("-m")
        .arg(&model_path)
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .arg("-c")
        .arg(ctx_size.to_string())
        .arg("-ngl")
        .arg(n_gpu_layers.to_string())
        // Enable the chat template so /v1/chat/completions formats correctly.
        .arg("--jinja")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn llama-server: {}", e))?;

    // Drain stdout/stderr to the app log so the process doesn't block on full pipes.
    if let Some(stdout) = child.stdout.take() {
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                info!("[LlamaServer] {}", line);
            }
        });
    }
    if let Some(stderr) = child.stderr.take() {
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                // llama-server logs progress/info to stderr; keep at debug-ish info.
                info!("[LlamaServer:err] {}", line);
            }
        });
    }

    // Record the running child before awaiting health so stop_llama_server works.
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.child = Some(child);
        inner.model_path = Some(model_path.clone());
        inner.port = port;
        inner.status = LlamaServerStatus::Stopped; // not ready until health passes
    }

    // Poll /health until ready (or timeout). Model load dominates this.
    let health_url = format!("http://127.0.0.1:{}/health", port);
    let client = reqwest::Client::new();
    let mut ready = false;
    for _ in 0..120 {
        // ~60s budget
        if let Ok(resp) = client
            .get(&health_url)
            .timeout(Duration::from_secs(2))
            .send()
            .await
        {
            if resp.status().is_success() {
                ready = true;
                break;
            }
        }
        tokio::time::sleep(Duration::from_millis(500)).await;
    }

    if !ready {
        // Tear down the half-started server.
        let mut child = {
            let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
            inner.status = LlamaServerStatus::Error;
            inner.child.take()
        };
        if let Some(ref mut child) = child {
            let _ = child.kill().await;
        }
        error!("[LlamaServer] Timed out waiting for /health on port {}", port);
        return Err(format!(
            "llama-server did not become ready on port {} within 60s",
            port
        ));
    }

    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.status = LlamaServerStatus::Running;
    }
    info!("[LlamaServer] Ready on port {}", port);
    Ok(())
}

/// Stop the llama-server sidecar if running.
#[tauri::command]
pub async fn stop_llama_server(app: AppHandle) -> Result<(), String> {
    let state = app.state::<LlamaServerState>();

    let mut child = {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.status = LlamaServerStatus::Stopped;
        inner.model_path = None;
        inner.child.take()
    };

    if let Some(ref mut child) = child {
        let _ = child.kill().await;
    }

    info!("[LlamaServer] Stopped");
    Ok(())
}

/// Report the current sidecar status: "running" | "stopped" | "error".
#[tauri::command]
pub async fn get_llama_server_status(app: AppHandle) -> Result<String, String> {
    let state = app.state::<LlamaServerState>();
    let inner = state.inner.lock().map_err(|e| e.to_string())?;

    let status = match inner.status {
        LlamaServerStatus::Running => "running",
        LlamaServerStatus::Stopped => "stopped",
        LlamaServerStatus::Error => "error",
    };

    Ok(status.to_string())
}
