//! "When I press X": close the app (default) or minimize to the system tray.
//! The tray icon only exists while the tray option is on. It has "Open Kosmos" and "Quit";
//! a left click on it also opens the window.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Manager};

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(false);
const TRAY_ID: &str = "kosmos-tray";

/// Bring the main window back (from the tray, minimized, or behind other windows).
pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

fn ensure_tray(app: &AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    if app.tray_by_id(TRAY_ID).is_some() {
        return Ok(());
    }
    let open = MenuItem::with_id(app, "open", "Open Kosmos", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &quit])?;

    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("Kosmos")
        .menu(&menu)
        .show_menu_on_left_click(false) // left click opens the window, right click shows the menu
        .on_menu_event(|app, event| match event.id().as_ref() {
            "open" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// The app tells us the setting at startup and whenever it changes.
#[tauri::command]
pub fn set_close_to_tray(app: AppHandle, on: bool) {
    CLOSE_TO_TRAY.store(on, Ordering::Relaxed);
    if on {
        let _ = ensure_tray(&app);
    } else {
        let _ = app.remove_tray_by_id(TRAY_ID);
    }
}

/// Called for every window event: with the tray option on, X hides the window instead of quitting.
pub fn on_window_event(window: &tauri::Window, event: &tauri::WindowEvent) {
    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
        if CLOSE_TO_TRAY.load(Ordering::Relaxed) {
            api.prevent_close();
            let _ = window.hide();
        }
    }
}
