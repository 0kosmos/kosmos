use tauri::Manager;

/// Whether Steam has a game installed / updating / running.
/// Steam keeps this in the Windows registry under
/// HKEY_CURRENT_USER\Software\Valve\Steam\Apps\<appid>. Reading it is instant and
/// never touches the game itself.
#[derive(serde::Serialize, Default)]
struct AppState {
    installed: bool,
    updating: bool,
    running: bool,
}

#[tauri::command]
fn steam_app_state(appid: u32) -> AppState {
    #[cfg(windows)]
    {
        let path = format!(r"Software\Valve\Steam\Apps\{appid}");
        if let Ok(key) = windows_registry::CURRENT_USER.open(&path) {
            let flag = |name: &str| key.get_u32(name).map(|v| v != 0).unwrap_or(false);
            return AppState {
                installed: flag("Installed"),
                updating: flag("Updating"),
                running: flag("Running"),
            };
        }
    }
    let _ = appid;
    AppState::default()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut builder = tauri::Builder::default();

    // Only one copy of Kosmos may run. When Steam sign-in finishes, the browser opens a
    // kosmos:// link, which makes Windows start a second copy. This plugin passes that link
    // to the copy that is already open (it arrives in the app as a deep link), brings its
    // window to the front, and closes the second copy. Must be registered first.
    #[cfg(desktop)]
    {
        builder = builder.plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![steam_app_state])
        .setup(|_app| {
            // The installer registers kosmos:// links with Windows. In dev builds there's no
            // installer, so register them here (only for the current Windows user).
            #[cfg(all(debug_assertions, any(windows, target_os = "linux")))]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                _app.deep_link().register_all()?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
