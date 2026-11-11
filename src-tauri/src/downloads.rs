//! Downloads view: reads Steam's own install files (steamapps/appmanifest_*.acf) in every
//! Steam library folder. Read-only: Steam does all downloading and updating itself.

use crate::launch::{steam_libraries, vdf_values};

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledGame {
    appid: u32,
    name: String,
    size_on_disk: u64,
    library: String, // e.g. "C:\Program Files (x86)\Steam"
    status: &'static str, // "installed" | "update" | "downloading" | "paused"
    first_install: bool,  // true = not fully installed yet (an install, not an update)
    bytes_to_download: u64,
    bytes_downloaded: u64, // last progress Steam saved (not live while downloading)
    last_updated: u64,     // unix seconds
}

// Steam's StateFlags bits (from its install files)
const FULLY_INSTALLED: u64 = 4;
const UPDATE_REQUIRED: u64 = 2;
const UPDATE_RUNNING: u64 = 256;
const UPDATE_PAUSED: u64 = 512;
const UPDATE_STARTED: u64 = 1024;
const DOWNLOADING: u64 = 1 << 20;
const STAGING: u64 = 1 << 21;
const COMMITTING: u64 = 1 << 22;

/// Steam only rewrites its install files now and then (start, pause, stop), so whether a
/// download is running *right now* comes from the registry value Apps\<appid>\Updating.
fn status_of(flags: u64, updating_now: bool, downloaded: u64, to_download: u64) -> &'static str {
    let pending = flags & (UPDATE_REQUIRED | UPDATE_STARTED | UPDATE_PAUSED) != 0
        || flags & FULLY_INSTALLED == 0;
    if updating_now || flags & (UPDATE_RUNNING | DOWNLOADING | STAGING | COMMITTING) != 0 {
        "downloading"
    } else if pending && (flags & UPDATE_PAUSED != 0 || (downloaded > 0 && downloaded < to_download)) {
        "paused" // started but not running: paused, or removed from Steam's queue
    } else if pending {
        "update" // needs an update / install that hasn't started yet
    } else {
        "installed"
    }
}

#[cfg(windows)]
fn updating_now(appid: u32) -> bool {
    windows_registry::CURRENT_USER
        .open(format!(r"Software\Valve\Steam\Apps\{appid}"))
        .and_then(|k| k.get_u32("Updating"))
        .map(|v| v != 0)
        .unwrap_or(false)
}

#[cfg(not(windows))]
fn updating_now(_appid: u32) -> bool {
    false
}

fn first_num(text: &str, key: &str) -> u64 {
    vdf_values(text, key).into_iter().next().and_then(|v| v.parse().ok()).unwrap_or(0)
}

/// Every game Steam has installed (or is installing), across all library drives.
#[tauri::command]
pub fn steam_installs() -> Vec<InstalledGame> {
    let mut out = Vec::new();
    for lib in steam_libraries() {
        let Ok(entries) = std::fs::read_dir(lib.join("steamapps")) else { continue };
        for entry in entries.flatten() {
            let file = entry.file_name();
            let file = file.to_string_lossy();
            if !(file.starts_with("appmanifest_") && file.ends_with(".acf")) {
                continue;
            }
            let Ok(text) = std::fs::read_to_string(entry.path()) else { continue };
            let appid = first_num(&text, "appid") as u32;
            if appid == 0 || appid == 228980 {
                continue; // 228980 = "Steamworks Common Redistributables", not a game
            }
            let flags = first_num(&text, "StateFlags");
            let to_download = first_num(&text, "BytesToDownload");
            let downloaded = first_num(&text, "BytesDownloaded");
            out.push(InstalledGame {
                appid,
                name: vdf_values(&text, "name").into_iter().next().unwrap_or_default(),
                size_on_disk: first_num(&text, "SizeOnDisk"),
                library: lib.to_string_lossy().into_owned(),
                status: status_of(flags, updating_now(appid), downloaded, to_download),
                first_install: flags & FULLY_INSTALLED == 0,
                bytes_to_download: to_download,
                bytes_downloaded: downloaded,
                last_updated: first_num(&text, "LastUpdated"),
            });
        }
    }
    out
}

/// The real size of installed games' folders, as [appid, bytes] pairs.
/// Steam's own number (SizeOnDisk) only counts what Steam downloaded itself; games that fetch
/// most of their data through their own launcher (e.g. Wuthering Waves) show far too little.
/// Adding up a big folder takes a moment, so the app only asks for games it hasn't measured
/// since their last update, and it runs in the background.
#[tauri::command(async)]
pub fn steam_folder_sizes(appids: Vec<u32>) -> Vec<(u32, u64)> {
    let mut out = Vec::new();
    for lib in steam_libraries() {
        for &appid in &appids {
            let manifest = lib.join("steamapps").join(format!("appmanifest_{appid}.acf"));
            let Ok(text) = std::fs::read_to_string(&manifest) else { continue };
            let Some(dir) = vdf_values(&text, "installdir").into_iter().next() else { continue };
            // Only a plain folder name inside steamapps\common (never "..", never a full path)
            if dir.is_empty() || dir.contains(['/', '\\', ':']) || dir == ".." || dir == "." {
                continue;
            }
            let path = lib.join("steamapps").join("common").join(dir);
            if path.is_dir() {
                out.push((appid, folder_size(&path)));
            }
        }
    }
    out
}

/// Total size of all files in a folder and its subfolders (shortcuts/links are not followed)
fn folder_size(root: &std::path::Path) -> u64 {
    let mut total = 0;
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for entry in entries.flatten() {
            let Ok(meta) = std::fs::symlink_metadata(entry.path()) else { continue };
            if meta.is_dir() {
                stack.push(entry.path());
            } else if meta.is_file() {
                total += meta.len();
            }
        }
    }
    total
}

/// Short state per game for the library's Play / Install buttons:
/// "ready" | "installing" | "updating" | "install-paused" | "update-paused".
/// Games without an install file are simply not in the list (= not installed).
/// (Steam's registry says Installed = 1 even for half-downloaded games, so we use its
/// install files for this instead.)
#[derive(serde::Serialize)]
pub struct InstallState {
    appid: u32,
    state: &'static str,
}

#[tauri::command]
pub fn install_states() -> Vec<InstallState> {
    steam_installs()
        .into_iter()
        .map(|g| {
            let state = match (g.status, g.first_install) {
                ("downloading", true) => "installing",
                ("downloading", false) => "updating",
                ("paused", true) | ("update", true) => "install-paused",
                ("paused", false) => "update-paused",
                _ => "ready", // installed, or installed with an update Steam will do on launch
            };
            InstallState { appid: g.appid, state }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn flags() {
        assert_eq!(status_of(4, false, 0, 0), "installed");
        assert_eq!(status_of(6, false, 0, 0), "update");
        // Banana while removed from the queue: 1538 = 2 + 512 + 1024 (not fully installed)
        assert_eq!(status_of(1538, false, 243_334_272, 950_619_328), "paused");
        // Paused (still in queue): no paused bit yet, but partly downloaded
        assert_eq!(status_of(1026, false, 243_334_272, 950_619_328), "paused");
        // Actively downloading: Steam's registry says Updating = 1
        assert_eq!(status_of(1026, true, 0, 950_619_328), "downloading");
        // Install queued but not started yet
        assert_eq!(status_of(1026, false, 0, 950_619_328), "update");
    }

    #[test]
    fn real_machine() {
        for g in steam_installs() {
            println!("{} {:?} {} MB {} first_install={}", g.appid, g.name, g.size_on_disk / 1_000_000, g.status, g.first_install);
        }
        for s in install_states() {
            if s.state != "ready" {
                println!("tile: {} -> {}", s.appid, s.state);
            }
        }
    }
}

