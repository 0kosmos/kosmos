//! Memory saver: while Kosmos is minimized or hidden in the tray, ask the page engine
//! (WebView2) to use as little memory as it can: it lets go of pictures and pages it has
//! cached. When you open Kosmos again it goes back to normal (things load again in a moment).

#[tauri::command]
pub fn page_memory(window: tauri::WebviewWindow, low: bool) {
    #[cfg(windows)]
    {
        let _ = window.with_webview(move |webview| unsafe {
            use webview2_com::Microsoft::Web::WebView2::Win32::{
                ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
            };
            use windows_core::Interface;
            if let Ok(core) = webview.controller().CoreWebView2() {
                // Older WebView2 versions don't have this setting: then nothing happens
                if let Ok(v19) = core.cast::<ICoreWebView2_19>() {
                    let level = if low { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW } else { COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL };
                    let _ = v19.SetMemoryUsageTargetLevel(level);
                }
            }
        });
    }
    #[cfg(not(windows))]
    let _ = (window, low);
}
