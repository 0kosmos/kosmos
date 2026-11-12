mod appstats;
mod discord;
mod custom;
mod downloads;
mod epic;
mod launch;
mod memory;
mod pcinfo;
mod screenshots;
mod stats;
mod tray;
mod watch;

// ---------- Currently playing ----------
// Steam writes the running game's ID to HKCU\Software\Valve\Steam\RunningAppID (0 = none).
// Instead of checking it again and again, a background thread asks Windows to wake it
// only when that registry key changes, so it uses no CPU while waiting.

#[derive(serde::Serialize, Clone, Default)]
struct RunningApp {
    appid: u32,   // 0 = nothing running
    name: String, // from Steam's own registry entry; may be empty
}

#[cfg(windows)]
fn read_running_app() -> RunningApp {
    let appid = windows_registry::CURRENT_USER
        .open(r"Software\Valve\Steam")
        .and_then(|k| k.get_u32("RunningAppID"))
        .unwrap_or(0);
    let name = if appid == 0 {
        String::new()
    } else {
        windows_registry::CURRENT_USER
            .open(format!(r"Software\Valve\Steam\Apps\{appid}"))
            .and_then(|k| k.get_string("Name"))
            .unwrap_or_default()
    };
    RunningApp { appid, name }
}

#[tauri::command]
fn running_app() -> RunningApp {
    #[cfg(windows)]
    {
        return read_running_app();
    }
    #[allow(unreachable_code)]
    RunningApp::default()
}

#[cfg(windows)]
fn watch_running_app(app: tauri::AppHandle) {
    use std::time::Duration;
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::ERROR_SUCCESS;
    use windows_sys::Win32::System::Registry::{
        HKEY, HKEY_CURRENT_USER, KEY_NOTIFY, REG_NOTIFY_CHANGE_LAST_SET, RegCloseKey,
        RegNotifyChangeKeyValue, RegOpenKeyExW,
    };

    std::thread::spawn(move || {
        let path: Vec<u16> = "Software\\Valve\\Steam\0".encode_utf16().collect();
        let mut last = read_running_app().appid;
        loop {
            let mut key: HKEY = std::ptr::null_mut();
            let opened =
                unsafe { RegOpenKeyExW(HKEY_CURRENT_USER, path.as_ptr(), 0, KEY_NOTIFY, &mut key) };
            if opened != ERROR_SUCCESS {
                // Steam isn't installed (yet): look again in a minute
                std::thread::sleep(Duration::from_secs(60));
                continue;
            }
            loop {
                // Sleeps until a value in Steam's key changes (no CPU used while waiting)
                let r = unsafe {
                    RegNotifyChangeKeyValue(
                        key,
                        0,
                        REG_NOTIFY_CHANGE_LAST_SET,
                        std::ptr::null_mut(),
                        0,
                    )
                };
                if r != ERROR_SUCCESS {
                    break;
                }
                let now = read_running_app();
                if now.appid != last {
                    last = now.appid;
                    let _ = app.emit("running-app", now);
                }
            }
            unsafe { RegCloseKey(key) };
            std::thread::sleep(Duration::from_secs(5));
        }
    });
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
            tray::show_main(app); // also brings it back from the tray
        }));
    }

    builder
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        // Updates: checks the latest release on GitHub; "process" restarts Kosmos afterwards
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // "Open file" window, for adding your own games to the Library
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            running_app,
            appstats::app_usage,
            memory::page_memory,
            custom::custom_file_info,
            custom::custom_cover_save,
            custom::custom_cover_delete,
            custom::custom_launch,
            screenshots::steam_screenshots,
            screenshots::screenshot_save,
            screenshots::screenshot_copy,
            discord::discord_activity,
            launch::launch_inputs,
            launch::system_info,
            launch::measure_launch,
            downloads::steam_installs,
            downloads::install_states,
            downloads::steam_folder_sizes,
            epic::epic_library,
            epic::epic_app,
            epic::epic_page,
            pcinfo::pc_info,
            stats::game_stats,
            stats::stop_game_stats,
            tray::set_close_to_tray
        ])
        .on_window_event(tray::on_window_event)
        .setup(|_app| {
            // Watch for the game Steam is running (for "Currently playing" in the sidebar)
            #[cfg(windows)]
            watch_running_app(_app.handle().clone());

            // Tell the app right away when Steam or Epic install files change (Downloads dot etc.)
            watch::start(_app.handle().clone());

            // Starting size: 1280 x 880 (tall enough for the Library's news row), centered.
            // On smaller screens (or with Windows scaling at 125% / 150%) shrink it to fit the
            // space above the taskbar, so the window never starts partly off screen.
            {
                use tauri::Manager;
                if let Some(win) = _app.get_webview_window("main") {
                    if let Ok(Some(screen)) = win.current_monitor() {
                        let scale = screen.scale_factor();
                        let area = screen.work_area().size;
                        let free_w = area.width as f64 / scale - 40.0;
                        let free_h = area.height as f64 / scale - 50.0; // room for the title bar
                        let w = 1280f64.min(free_w).max(1024.0);
                        let h = 880f64.min(free_h).max(566.0);
                        let _ = win.set_size(tauri::LogicalSize::new(w, h));
                        let _ = win.center();
                    }
                }
            }

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
