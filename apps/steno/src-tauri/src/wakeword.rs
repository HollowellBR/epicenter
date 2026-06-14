use log::{error, info, warn};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, Command};

/// State managed by Tauri for the wake word sidecar
pub struct WakeWordState {
    inner: Arc<Mutex<WakeWordInner>>,
}

struct WakeWordInner {
    child: Option<Child>,
    stdin_tx: Option<tokio::sync::mpsc::Sender<String>>,
    status: WakeWordStatus,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum WakeWordStatus {
    Running,
    Stopped,
    Error,
}

impl WakeWordState {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(WakeWordInner {
                child: None,
                stdin_tx: None,
                status: WakeWordStatus::Stopped,
            })),
        }
    }
}

/// JSON events emitted by the Python sidecar on stdout
#[derive(Debug, Deserialize)]
struct SidecarEvent {
    event: String,
    #[serde(default)]
    phrase: Option<String>,
    #[serde(default)]
    confidence: Option<f64>,
    #[serde(default)]
    status: Option<String>,
    #[serde(default)]
    message: Option<String>,
}

/// Payload emitted to the frontend via Tauri events
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WakeWordDetectedPayload {
    phrase: String,
    confidence: f64,
}

/// Start the wake word Python sidecar process
#[tauri::command]
pub async fn start_wakeword(
    app: AppHandle,
    script_path: String,
    threshold: f64,
) -> Result<(), String> {
    let state = app.state::<WakeWordState>();

    // Stop existing process if running
    let (old_tx, mut old_child) = {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        if inner.status == WakeWordStatus::Running {
            let tx = inner.stdin_tx.take();
            let child = inner.child.take();
            inner.status = WakeWordStatus::Stopped;
            (tx, child)
        } else {
            (None, None)
        }
    };

    if let Some(tx) = old_tx {
        let _ = tx.send(r#"{"command":"shutdown"}"#.to_string()).await;
    }
    if let Some(ref mut child) = old_child {
        let _ = child.kill().await;
    }

    info!(
        "[WakeWord] Starting sidecar: {} (threshold: {})",
        script_path, threshold
    );

    let mut child = Command::new("python")
        .arg(&script_path)
        .arg(threshold.to_string())
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .map_err(|e| format!("Failed to spawn Python sidecar: {}", e))?;

    let stdout = child
        .stdout
        .take()
        .ok_or("Failed to capture sidecar stdout")?;
    let stderr = child
        .stderr
        .take()
        .ok_or("Failed to capture sidecar stderr")?;
    let stdin = child
        .stdin
        .take()
        .ok_or("Failed to capture sidecar stdin")?;

    // Channel for sending commands to the sidecar's stdin
    let (stdin_tx, mut stdin_rx) = tokio::sync::mpsc::channel::<String>(32);

    // Stdin writer task
    tokio::spawn(async move {
        let mut stdin = stdin;
        while let Some(line) = stdin_rx.recv().await {
            if stdin
                .write_all(format!("{}\n", line).as_bytes())
                .await
                .is_err()
            {
                break;
            }
            if stdin.flush().await.is_err() {
                break;
            }
        }
    });

    // Stdout reader task - parse JSON lines and emit Tauri events
    let app_handle = app.clone();
    let state_handle = app.state::<WakeWordState>().inner.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();

        while let Ok(Some(line)) = lines.next_line().await {
            let line = line.trim().to_string();
            if line.is_empty() {
                continue;
            }

            match serde_json::from_str::<SidecarEvent>(&line) {
                Ok(evt) => match evt.event.as_str() {
                    "wake_word" => {
                        if let (Some(phrase), Some(confidence)) = (evt.phrase, evt.confidence) {
                            info!(
                                "[WakeWord] Detected: {} (confidence: {})",
                                phrase, confidence
                            );
                            let _ = app_handle.emit(
                                "wakeword:detected",
                                WakeWordDetectedPayload { phrase, confidence },
                            );
                        }
                    }
                    "status" => {
                        if let Some(status) = evt.status {
                            info!("[WakeWord] Status: {}", status);
                        }
                    }
                    "error" => {
                        if let Some(msg) = evt.message {
                            error!("[WakeWord] Error from sidecar: {}", msg);
                            if let Ok(mut inner) = state_handle.lock() {
                                inner.status = WakeWordStatus::Error;
                            }
                        }
                    }
                    _ => {
                        warn!("[WakeWord] Unknown event: {}", line);
                    }
                },
                Err(e) => {
                    warn!("[WakeWord] Failed to parse stdout line: {} ({})", line, e);
                }
            }
        }

        // Stdout closed - sidecar exited
        info!("[WakeWord] Sidecar stdout closed");
        if let Ok(mut inner) = state_handle.lock() {
            if inner.status == WakeWordStatus::Running {
                inner.status = WakeWordStatus::Stopped;
            }
            inner.child = None;
            inner.stdin_tx = None;
        }
    });

    // Stderr reader task - log warnings
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            warn!("[WakeWord] stderr: {}", line);
        }
    });

    // Store child and channel
    {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.child = Some(child);
        inner.stdin_tx = Some(stdin_tx);
        inner.status = WakeWordStatus::Running;
    }

    Ok(())
}

/// Stop the wake word sidecar process
#[tauri::command]
pub async fn stop_wakeword(app: AppHandle) -> Result<(), String> {
    let state = app.state::<WakeWordState>();

    // Extract what we need without holding the lock across await points
    let (tx, mut child) = {
        let mut inner = state.inner.lock().map_err(|e| e.to_string())?;
        let tx = inner.stdin_tx.take();
        let child = inner.child.take();
        inner.status = WakeWordStatus::Stopped;
        (tx, child)
    };

    if let Some(tx) = tx {
        let _ = tx.send(r#"{"command":"shutdown"}"#.to_string()).await;
        tokio::time::sleep(tokio::time::Duration::from_millis(500)).await;
    }

    if let Some(ref mut child) = child {
        let _ = child.kill().await;
    }

    info!("[WakeWord] Sidecar stopped");
    Ok(())
}

/// Send a threshold update to the running sidecar
#[tauri::command]
pub async fn set_wakeword_threshold(app: AppHandle, threshold: f64) -> Result<(), String> {
    let state = app.state::<WakeWordState>();

    let tx = {
        let inner = state.inner.lock().map_err(|e| e.to_string())?;
        inner.stdin_tx.clone()
    };

    if let Some(tx) = tx {
        let cmd = serde_json::json!({"command": "set_threshold", "value": threshold}).to_string();
        tx.send(cmd)
            .await
            .map_err(|e| format!("Failed to send threshold command: {}", e))?;
        info!("[WakeWord] Threshold set to {}", threshold);
        Ok(())
    } else {
        Err("Wake word sidecar is not running".to_string())
    }
}

/// Get the current status of the wake word sidecar
#[tauri::command]
pub async fn get_wakeword_status(app: AppHandle) -> Result<String, String> {
    let state = app.state::<WakeWordState>();
    let inner = state.inner.lock().map_err(|e| e.to_string())?;

    let status = match inner.status {
        WakeWordStatus::Running => "running",
        WakeWordStatus::Stopped => "stopped",
        WakeWordStatus::Error => "error",
    };

    Ok(status.to_string())
}
