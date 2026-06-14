use log::{debug, error, info};
use rdev::{listen, Event, EventType, Key};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use tauri::{AppHandle, Emitter};

/// Global hotkey registry shared between the listener thread and Tauri commands
static REGISTRY: OnceLock<Arc<Mutex<HotkeyRegistry>>> = OnceLock::new();

fn get_registry() -> &'static Arc<Mutex<HotkeyRegistry>> {
    REGISTRY.get_or_init(|| Arc::new(Mutex::new(HotkeyRegistry::new())))
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HotkeyMode {
    Toggle,
    PushToTalk,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HotkeyBinding {
    pub combo: String,
    pub mode: HotkeyMode,
    pub keys: Vec<String>,
}

struct HotkeyRegistry {
    bindings: HashMap<String, HotkeyBinding>,
    pressed_keys: std::collections::HashSet<String>,
}

impl HotkeyRegistry {
    fn new() -> Self {
        Self {
            bindings: HashMap::new(),
            pressed_keys: std::collections::HashSet::new(),
        }
    }

    fn register(&mut self, combo: String, mode: HotkeyMode) {
        let keys: Vec<String> = combo.split('+').map(|s| s.trim().to_lowercase()).collect();
        let binding = HotkeyBinding {
            combo: combo.clone(),
            mode,
            keys,
        };
        self.bindings.insert(combo, binding);
    }

    fn unregister(&mut self, combo: &str) {
        self.bindings.remove(combo);
    }

    fn check_matches(&self) -> Vec<&HotkeyBinding> {
        self.bindings
            .values()
            .filter(|binding| {
                binding
                    .keys
                    .iter()
                    .all(|k| self.pressed_keys.contains(k))
            })
            .collect()
    }
}

/// Convert rdev Key to a normalized string name
fn key_to_string(key: &Key) -> String {
    match key {
        Key::Alt | Key::AltGr => "alt".to_string(),
        Key::ControlLeft | Key::ControlRight => "ctrl".to_string(),
        Key::ShiftLeft | Key::ShiftRight => "shift".to_string(),
        Key::MetaLeft | Key::MetaRight => "meta".to_string(),
        Key::Space => "space".to_string(),
        Key::Return => "enter".to_string(),
        Key::Escape => "escape".to_string(),
        Key::Tab => "tab".to_string(),
        Key::Backspace => "backspace".to_string(),
        Key::Delete => "delete".to_string(),
        Key::UpArrow => "up".to_string(),
        Key::DownArrow => "down".to_string(),
        Key::LeftArrow => "left".to_string(),
        Key::RightArrow => "right".to_string(),
        Key::Home => "home".to_string(),
        Key::End => "end".to_string(),
        Key::PageUp => "pageup".to_string(),
        Key::PageDown => "pagedown".to_string(),
        Key::F1 => "f1".to_string(),
        Key::F2 => "f2".to_string(),
        Key::F3 => "f3".to_string(),
        Key::F4 => "f4".to_string(),
        Key::F5 => "f5".to_string(),
        Key::F6 => "f6".to_string(),
        Key::F7 => "f7".to_string(),
        Key::F8 => "f8".to_string(),
        Key::F9 => "f9".to_string(),
        Key::F10 => "f10".to_string(),
        Key::F11 => "f11".to_string(),
        Key::F12 => "f12".to_string(),
        Key::Num0 => "0".to_string(),
        Key::Num1 => "1".to_string(),
        Key::Num2 => "2".to_string(),
        Key::Num3 => "3".to_string(),
        Key::Num4 => "4".to_string(),
        Key::Num5 => "5".to_string(),
        Key::Num6 => "6".to_string(),
        Key::Num7 => "7".to_string(),
        Key::Num8 => "8".to_string(),
        Key::Num9 => "9".to_string(),
        Key::KeyA => "a".to_string(),
        Key::KeyB => "b".to_string(),
        Key::KeyC => "c".to_string(),
        Key::KeyD => "d".to_string(),
        Key::KeyE => "e".to_string(),
        Key::KeyF => "f".to_string(),
        Key::KeyG => "g".to_string(),
        Key::KeyH => "h".to_string(),
        Key::KeyI => "i".to_string(),
        Key::KeyJ => "j".to_string(),
        Key::KeyK => "k".to_string(),
        Key::KeyL => "l".to_string(),
        Key::KeyM => "m".to_string(),
        Key::KeyN => "n".to_string(),
        Key::KeyO => "o".to_string(),
        Key::KeyP => "p".to_string(),
        Key::KeyQ => "q".to_string(),
        Key::KeyR => "r".to_string(),
        Key::KeyS => "s".to_string(),
        Key::KeyT => "t".to_string(),
        Key::KeyU => "u".to_string(),
        Key::KeyV => "v".to_string(),
        Key::KeyW => "w".to_string(),
        Key::KeyX => "x".to_string(),
        Key::KeyY => "y".to_string(),
        Key::KeyZ => "z".to_string(),
        Key::Minus => "-".to_string(),
        Key::Equal => "=".to_string(),
        Key::LeftBracket => "[".to_string(),
        Key::RightBracket => "]".to_string(),
        Key::SemiColon => ";".to_string(),
        Key::Quote => "'".to_string(),
        Key::BackQuote => "`".to_string(),
        Key::BackSlash => "\\".to_string(),
        Key::Comma => ",".to_string(),
        Key::Dot => ".".to_string(),
        Key::Slash => "/".to_string(),
        Key::CapsLock => "capslock".to_string(),
        Key::Insert => "insert".to_string(),
        Key::PrintScreen => "printscreen".to_string(),
        Key::ScrollLock => "scrolllock".to_string(),
        Key::Pause => "pause".to_string(),
        Key::NumLock => "numlock".to_string(),
        Key::Unknown(code) => format!("unknown_{}", code),
        _ => format!("{:?}", key).to_lowercase(),
    }
}

/// Start the global rdev keyboard listener on a dedicated thread
pub fn start_listener(app_handle: AppHandle) {
    std::thread::spawn(move || {
        info!("[Hotkey] Starting rdev global keyboard listener");

        let callback = move |event: Event| {
            let registry = get_registry();

            match event.event_type {
                EventType::KeyPress(key) => {
                    let key_name = key_to_string(&key);
                    debug!("[Hotkey] KeyPress: {}", key_name);

                    let mut reg = match registry.lock() {
                        Ok(r) => r,
                        Err(e) => {
                            error!("[Hotkey] Registry lock poisoned: {}", e);
                            return;
                        }
                    };

                    let was_already_pressed = reg.pressed_keys.contains(&key_name);
                    reg.pressed_keys.insert(key_name.clone());

                    // Check for matching hotkey bindings
                    let matches: Vec<HotkeyBinding> =
                        reg.check_matches().into_iter().cloned().collect();

                    for binding in matches {
                        match binding.mode {
                            HotkeyMode::Toggle => {
                                if !was_already_pressed {
                                    info!("[Hotkey] Toggle hotkey triggered: {}", binding.combo);
                                    let _ = app_handle.emit("hotkey:toggle", &binding.combo);
                                }
                            }
                            HotkeyMode::PushToTalk => {
                                if !was_already_pressed {
                                    info!("[Hotkey] PTT start: {}", binding.combo);
                                    let _ = app_handle.emit("hotkey:ptt-start", &binding.combo);
                                }
                            }
                        }
                    }
                }
                EventType::KeyRelease(key) => {
                    let key_name = key_to_string(&key);
                    debug!("[Hotkey] KeyRelease: {}", key_name);

                    let mut reg = match registry.lock() {
                        Ok(r) => r,
                        Err(e) => {
                            error!("[Hotkey] Registry lock poisoned: {}", e);
                            return;
                        }
                    };

                    // Check for PTT stop before removing the key
                    let matches: Vec<HotkeyBinding> =
                        reg.check_matches().into_iter().cloned().collect();

                    reg.pressed_keys.remove(&key_name);

                    for binding in matches {
                        if binding.mode == HotkeyMode::PushToTalk {
                            // Only emit stop if the released key was part of this binding
                            if binding.keys.contains(&key_name) {
                                info!("[Hotkey] PTT stop: {}", binding.combo);
                                let _ = app_handle.emit("hotkey:ptt-stop", &binding.combo);
                            }
                        }
                    }
                }
                _ => {}
            }
        };

        if let Err(error) = listen(callback) {
            error!("[Hotkey] rdev listener error: {:?}", error);
        }
    });
}

/// Register a global hotkey combination
#[tauri::command]
pub async fn register_hotkey(combo: String, mode: String) -> Result<(), String> {
    let hotkey_mode = match mode.as_str() {
        "toggle" => HotkeyMode::Toggle,
        "push-to-talk" | "ptt" => HotkeyMode::PushToTalk,
        _ => return Err(format!("Invalid hotkey mode: {}. Use 'toggle' or 'push-to-talk'", mode)),
    };

    let registry = get_registry();
    let mut reg = registry
        .lock()
        .map_err(|e| format!("Registry lock poisoned: {}", e))?;

    info!("[Hotkey] Registering hotkey: {} (mode: {:?})", combo, hotkey_mode);
    reg.register(combo, hotkey_mode);
    Ok(())
}

/// Unregister a global hotkey combination
#[tauri::command]
pub async fn unregister_hotkey(combo: String) -> Result<(), String> {
    let registry = get_registry();
    let mut reg = registry
        .lock()
        .map_err(|e| format!("Registry lock poisoned: {}", e))?;

    info!("[Hotkey] Unregistering hotkey: {}", combo);
    reg.unregister(&combo);
    Ok(())
}

/// List all registered hotkey bindings
#[tauri::command]
pub async fn list_hotkeys() -> Result<Vec<HotkeyBinding>, String> {
    let registry = get_registry();
    let reg = registry
        .lock()
        .map_err(|e| format!("Registry lock poisoned: {}", e))?;

    Ok(reg.bindings.values().cloned().collect())
}
