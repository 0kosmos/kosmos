//! Tells the app the moment Steam or Epic changes their install files, so the Downloads dot,
//! the Downloads page and the Library's Play / Install buttons update right away.
//! Windows wakes this thread only when a file in those folders changes: no CPU is used while
//! waiting, and nothing is checked on a timer.
//!   - Steam: <library>\steamapps (an install file is rewritten when a download starts,
//!     pauses, finishes, or when a game needs an update)
//!   - Epic:  the launcher's Manifests folder (a file appears when an install starts and
//!     changes when it finishes)
//! Events sent to the app: "steam-installs-changed" and "epic-installs-changed".

#[cfg(windows)]
pub fn start(app: tauri::AppHandle) {
    use std::os::windows::ffi::OsStrExt;
    use std::time::Duration;
    use tauri::Emitter;
    use windows_sys::Win32::Foundation::{
        HANDLE, INVALID_HANDLE_VALUE, WAIT_OBJECT_0, WAIT_TIMEOUT,
    };
    use windows_sys::Win32::Storage::FileSystem::{
        FILE_NOTIFY_CHANGE_FILE_NAME, FILE_NOTIFY_CHANGE_LAST_WRITE, FindCloseChangeNotification,
        FindFirstChangeNotificationW, FindNextChangeNotification,
    };
    use windows_sys::Win32::System::Threading::WaitForMultipleObjects;

    std::thread::spawn(move || {
        loop {
            // Folders to watch (looked up again every 10 minutes, in case a library was added)
            let mut folders: Vec<(std::path::PathBuf, &'static str)> =
                crate::launch::steam_libraries()
                    .into_iter()
                    .map(|lib| (lib.join("steamapps"), "steam-installs-changed"))
                    .collect();
            folders.push((
                crate::epic::data_dir().join("Manifests"),
                "epic-installs-changed",
            ));

            let mut handles: Vec<HANDLE> = Vec::new();
            let mut events: Vec<&'static str> = Vec::new();
            for (dir, event) in folders.into_iter().filter(|(d, _)| d.is_dir()).take(60) {
                let wide: Vec<u16> = dir.as_os_str().encode_wide().chain(Some(0)).collect();
                let h = unsafe {
                    FindFirstChangeNotificationW(
                        wide.as_ptr(),
                        0,
                        FILE_NOTIFY_CHANGE_LAST_WRITE | FILE_NOTIFY_CHANGE_FILE_NAME,
                    )
                };
                if h != INVALID_HANDLE_VALUE {
                    handles.push(h);
                    events.push(event);
                }
            }
            if handles.is_empty() {
                std::thread::sleep(Duration::from_secs(600)); // neither launcher is installed
                continue;
            }

            loop {
                // Sleeps until a file changes (or 10 minutes pass)
                let r = unsafe {
                    WaitForMultipleObjects(handles.len() as u32, handles.as_ptr(), 0, 600_000)
                };
                if r == WAIT_TIMEOUT {
                    break; // look up the folders again
                }
                let i = r.wrapping_sub(WAIT_OBJECT_0) as usize;
                if i >= handles.len() {
                    break; // something went wrong: start over
                }
                // Launchers often write a few files in a row: wait a moment, then tell the app once
                std::thread::sleep(Duration::from_millis(1500));
                let mut fired: Vec<&'static str> = Vec::new();
                for (j, h) in handles.iter().enumerate() {
                    if j == i
                        || unsafe {
                            windows_sys::Win32::System::Threading::WaitForSingleObject(*h, 0)
                        } == WAIT_OBJECT_0
                    {
                        if !fired.contains(&events[j]) {
                            fired.push(events[j]);
                        }
                        unsafe { FindNextChangeNotification(*h) };
                    }
                }
                for e in fired {
                    let _ = app.emit(e, ());
                }
            }
            for h in handles {
                unsafe { FindCloseChangeNotification(h) };
            }
        }
    });
}

#[cfg(not(windows))]
pub fn start(_app: tauri::AppHandle) {}
