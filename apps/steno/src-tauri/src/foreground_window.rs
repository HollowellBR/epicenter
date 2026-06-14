use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ForegroundWindowInfo {
    pub window_title: String,
    pub process_name: String,
    pub process_id: u32,
}

#[tauri::command]
pub async fn get_foreground_window() -> Result<ForegroundWindowInfo, String> {
    get_foreground_window_impl()
}

#[cfg(target_os = "windows")]
fn get_foreground_window_impl() -> Result<ForegroundWindowInfo, String> {
    use windows_sys::Win32::UI::WindowsAndMessaging::*;

    unsafe {
        let hwnd = GetForegroundWindow();
        if hwnd.is_null() {
            return Err("No foreground window found".to_string());
        }

        // Get window title
        let mut title_buf = [0u16; 512];
        let title_len = GetWindowTextW(hwnd, title_buf.as_mut_ptr(), title_buf.len() as i32);
        let window_title = if title_len > 0 {
            String::from_utf16_lossy(&title_buf[..title_len as usize])
        } else {
            String::new()
        };

        // Get process ID from window handle
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);

        // Get process name from PID
        let process_name = get_process_name_windows(pid).unwrap_or_default();

        Ok(ForegroundWindowInfo {
            window_title,
            process_name,
            process_id: pid,
        })
    }
}

#[cfg(target_os = "windows")]
fn get_process_name_windows(pid: u32) -> Option<String> {
    use windows_sys::Win32::Foundation::*;
    use windows_sys::Win32::System::ProcessStatus::*;
    use windows_sys::Win32::System::Threading::*;

    unsafe {
        let handle = OpenProcess(PROCESS_QUERY_INFORMATION | PROCESS_VM_READ, FALSE, pid);
        if handle.is_null() {
            return None;
        }

        let mut module: HMODULE = std::ptr::null_mut();
        let mut cb_needed = 0u32;
        let success = EnumProcessModules(
            handle,
            &mut module,
            std::mem::size_of::<HMODULE>() as u32,
            &mut cb_needed,
        );

        let name = if success != 0 {
            let mut name_buf = [0u16; 260];
            let name_len = GetModuleBaseNameW(handle, module, name_buf.as_mut_ptr(), 260);
            if name_len > 0 {
                Some(String::from_utf16_lossy(&name_buf[..name_len as usize]))
            } else {
                None
            }
        } else {
            None
        };

        CloseHandle(handle);
        name
    }
}

#[cfg(target_os = "macos")]
fn get_foreground_window_impl() -> Result<ForegroundWindowInfo, String> {
    use std::process::Command;

    // Use AppleScript to get frontmost app info
    let output = Command::new("osascript")
        .arg("-e")
        .arg(
            r#"tell application "System Events"
                set frontApp to first application process whose frontmost is true
                set appName to name of frontApp
                set pid to unix id of frontApp
                set winTitle to ""
                try
                    set winTitle to name of front window of frontApp
                end try
                return appName & "|" & pid & "|" & winTitle
            end tell"#,
        )
        .output()
        .map_err(|e| format!("Failed to run osascript: {}", e))?;

    if !output.status.success() {
        return Err(format!(
            "osascript failed: {}",
            String::from_utf8_lossy(&output.stderr)
        ));
    }

    let result = String::from_utf8_lossy(&output.stdout).trim().to_string();
    let parts: Vec<&str> = result.splitn(3, '|').collect();

    if parts.len() < 2 {
        return Err("Unexpected osascript output format".to_string());
    }

    Ok(ForegroundWindowInfo {
        process_name: parts[0].to_string(),
        process_id: parts[1].parse().unwrap_or(0),
        window_title: parts.get(2).unwrap_or(&"").to_string(),
    })
}

#[cfg(target_os = "linux")]
fn get_foreground_window_impl() -> Result<ForegroundWindowInfo, String> {
    use std::process::Command;

    // Use xdotool to get the active window
    let wid_output = Command::new("xdotool")
        .arg("getactivewindow")
        .output()
        .map_err(|e| format!("Failed to run xdotool: {}", e))?;

    if !wid_output.status.success() {
        return Err("xdotool getactivewindow failed".to_string());
    }

    let wid = String::from_utf8_lossy(&wid_output.stdout).trim().to_string();

    // Get window name
    let name_output = Command::new("xdotool")
        .args(["getwindowname", &wid])
        .output()
        .map_err(|e| format!("Failed to get window name: {}", e))?;

    let window_title = String::from_utf8_lossy(&name_output.stdout)
        .trim()
        .to_string();

    // Get window PID
    let pid_output = Command::new("xdotool")
        .args(["getwindowpid", &wid])
        .output()
        .map_err(|e| format!("Failed to get window PID: {}", e))?;

    let pid: u32 = String::from_utf8_lossy(&pid_output.stdout)
        .trim()
        .parse()
        .unwrap_or(0);

    // Get process name from /proc
    let process_name = std::fs::read_link(format!("/proc/{}/exe", pid))
        .ok()
        .and_then(|p| p.file_name().map(|n| n.to_string_lossy().to_string()))
        .unwrap_or_default();

    Ok(ForegroundWindowInfo {
        window_title,
        process_name,
        process_id: pid,
    })
}
