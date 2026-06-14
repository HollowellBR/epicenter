use log::info;
use serde::Serialize;
use std::io::Write;
use tauri::{AppHandle, Emitter};

#[derive(Clone, Serialize)]
struct DownloadProgress {
    url: String,
    downloaded: u64,
    total: u64,
    percent: u32,
}

/// Downloads a file from a URL directly to disk, emitting progress events.
/// This avoids loading large files into the webview's memory.
#[tauri::command]
pub async fn download_file(
    app: AppHandle,
    url: String,
    dest_path: String,
) -> Result<(), String> {
    info!("[Download] Starting: {} -> {}", url, dest_path);

    // Ensure parent directory exists
    if let Some(parent) = std::path::Path::new(&dest_path).parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create directory: {}", e))?;
    }

    let client = reqwest::Client::builder()
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch {}: {}", url, e))?;

    if !response.status().is_success() {
        return Err(format!("HTTP {}: {}", response.status(), url));
    }

    let total = response.content_length().unwrap_or(0);
    let mut downloaded: u64 = 0;

    let mut file = std::fs::File::create(&dest_path)
        .map_err(|e| format!("Failed to create file {}: {}", dest_path, e))?;

    let mut stream = response.bytes_stream();
    use futures_util::StreamExt;

    let mut last_percent: u32 = 0;

    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("Download stream error: {}", e))?;
        file.write_all(&chunk)
            .map_err(|e| format!("Failed to write to file: {}", e))?;

        downloaded += chunk.len() as u64;

        // Emit progress every 1% change to avoid flooding
        let percent = if total > 0 {
            ((downloaded as f64 / total as f64) * 100.0) as u32
        } else {
            0
        };

        if percent != last_percent {
            last_percent = percent;
            let _ = app.emit(
                "download-progress",
                DownloadProgress {
                    url: url.clone(),
                    downloaded,
                    total,
                    percent,
                },
            );
        }
    }

    file.flush()
        .map_err(|e| format!("Failed to flush file: {}", e))?;

    info!(
        "[Download] Complete: {} ({} bytes)",
        dest_path, downloaded
    );

    Ok(())
}
