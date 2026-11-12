//! Your Steam screenshots. Steam keeps them on this PC:
//!   <Steam>\userdata\<your account number>\760\remote\<game>\screenshots\*.jpg
//! with small versions in a "thumbnails" folder next to them, and an index file
//! (screenshots.vdf) that also says which ones you uploaded to your Steam profile.
//! We only read them; saving makes a copy where you choose, and "send to a friend" puts the
//! picture on the clipboard as a file (paste it in a chat with Ctrl+V).

use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use tauri::Manager; // for asset_protocol_scope (letting the app show these pictures)

/// Steam's 64-bit IDs are this number plus your short account number (the userdata folder name)
const ACCOUNT_ID_BASE: u64 = 76561197960265728;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Shot {
    path: String,  // the full picture
    thumb: String, // small version ("" = none, use the full one)
    appid: u32,
    taken: u64,    // when (unix seconds)
    online: String, // its page on your Steam profile, if you uploaded it ("" = only on this PC)
}

/// The "760\remote" folders: yours (if signed in), or every Steam account on this PC
fn remote_dirs(steamid: &str) -> Vec<PathBuf> {
    let Some(steam) = crate::launch::steam_libraries().into_iter().next() else { return Vec::new() };
    let userdata = steam.join("userdata");
    let mine = steamid.parse::<u64>().ok().and_then(|id| id.checked_sub(ACCOUNT_ID_BASE));
    let Ok(entries) = std::fs::read_dir(&userdata) else { return Vec::new() };
    entries
        .flatten()
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_string();
            name.chars().all(|c| c.is_ascii_digit()) && mine.is_none_or(|m| name == m.to_string())
        })
        .map(|e| e.path().join("760"))
        .filter(|p| p.join("remote").is_dir())
        .collect()
}

/// screenshots.vdf: which file was uploaded as which page ("publishedfileid")
fn uploaded(dir: &Path) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Ok(text) = std::fs::read_to_string(dir.join("screenshots.vdf")) else { return map };
    let mut file = String::new();
    for line in text.lines() {
        let parts: Vec<&str> = line.split('"').collect();
        if parts.len() < 4 {
            continue;
        }
        match parts[1] {
            "filename" => file = parts[3].replace('/', "\\").to_lowercase(),
            "publishedfileid" if parts[3] != "0" && parts[3].chars().all(|c| c.is_ascii_digit()) => {
                map.insert(file.clone(), parts[3].to_string());
            }
            _ => {}
        }
    }
    map
}

fn is_picture(p: &Path) -> bool {
    matches!(p.extension().and_then(|e| e.to_str()).map(|e| e.to_lowercase()).as_deref(), Some("jpg" | "jpeg" | "png"))
}

/// All your screenshots, newest first. Also lets the app show these pictures (only these folders).
#[tauri::command(async)]
pub fn steam_screenshots(app: tauri::AppHandle, steamid: String) -> Vec<Shot> {
    let mut shots = Vec::new();
    for dir in remote_dirs(&steamid) {
        let remote = dir.join("remote");
        let _ = app.asset_protocol_scope().allow_directory(&remote, true);
        let online = uploaded(&dir);
        let Ok(games) = std::fs::read_dir(&remote) else { continue };
        for game in games.flatten() {
            let Ok(appid) = game.file_name().to_string_lossy().parse::<u32>() else { continue };
            let folder = game.path().join("screenshots");
            let Ok(files) = std::fs::read_dir(&folder) else { continue };
            for f in files.flatten() {
                let path = f.path();
                if !path.is_file() || !is_picture(&path) {
                    continue;
                }
                let name = f.file_name().to_string_lossy().to_string();
                let thumb = folder.join("thumbnails").join(&name);
                let taken = f
                    .metadata()
                    .and_then(|m| m.modified())
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let key = format!("{appid}\\screenshots\\{name}").to_lowercase();
                shots.push(Shot {
                    path: path.to_string_lossy().into_owned(),
                    thumb: if thumb.is_file() { thumb.to_string_lossy().into_owned() } else { String::new() },
                    appid,
                    taken,
                    online: online
                        .get(&key)
                        .map(|id| format!("https://steamcommunity.com/sharedfiles/filedetails/?id={id}"))
                        .unwrap_or_default(),
                });
            }
        }
    }
    shots.sort_by(|a, b| b.taken.cmp(&a.taken));
    shots
}

/// Only pictures inside a Steam screenshots folder can be copied (never any other file)
fn is_screenshot(p: &Path) -> bool {
    let s = p.to_string_lossy().to_lowercase();
    is_picture(p) && s.contains("\\userdata\\") && s.contains("\\760\\remote\\") && p.is_file()
}

/// "Save to PC": copy the picture to where you chose
#[tauri::command(async)]
pub fn screenshot_save(source: String, dest: String) -> Result<(), String> {
    let src = PathBuf::from(&source);
    if !is_screenshot(&src) {
        return Err("Not a Steam screenshot".into());
    }
    std::fs::copy(&src, PathBuf::from(&dest)).map(|_| ()).map_err(|e| e.to_string())
}

/// "Send to a friend": put the picture on the clipboard as a file, like Copy in File Explorer.
/// Then Ctrl+V in a chat (Discord, Steam...) sends it.
#[tauri::command(async)]
pub fn screenshot_copy(source: String) -> Result<(), String> {
    let src = PathBuf::from(&source);
    if !is_screenshot(&src) {
        return Err("Not a Steam screenshot".into());
    }
    #[cfg(windows)]
    {
        return win::copy_file_to_clipboard(&src);
    }
    #[allow(unreachable_code)]
    Err("Not supported".into())
}

#[cfg(windows)]
mod win {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use windows_sys::Win32::Foundation::{GlobalFree, HANDLE};
    use windows_sys::Win32::System::DataExchange::{CloseClipboard, EmptyClipboard, OpenClipboard, SetClipboardData};
    use windows_sys::Win32::System::Memory::{GlobalAlloc, GlobalLock, GlobalUnlock, GMEM_MOVEABLE, GMEM_ZEROINIT};
    use windows_sys::Win32::UI::Shell::DROPFILES;

    const CF_HDROP: u32 = 15;

    pub fn copy_file_to_clipboard(path: &Path) -> Result<(), String> {
        // A "file list" (DROPFILES + the path, ending with two zeros), the same thing
        // File Explorer puts on the clipboard when you copy a file
        let wide: Vec<u16> = path.as_os_str().encode_wide().chain([0, 0]).collect();
        let header = std::mem::size_of::<DROPFILES>();
        let size = header + wide.len() * 2;
        unsafe {
            let mem = GlobalAlloc(GMEM_MOVEABLE | GMEM_ZEROINIT, size);
            if mem.is_null() {
                return Err("Out of memory".into());
            }
            let ptr = GlobalLock(mem) as *mut u8;
            if ptr.is_null() {
                GlobalFree(mem);
                return Err("Out of memory".into());
            }
            let drop = ptr as *mut DROPFILES;
            (*drop).pFiles = header as u32;
            (*drop).fWide = 1; // the path is UTF-16
            std::ptr::copy_nonoverlapping(wide.as_ptr() as *const u8, ptr.add(header), wide.len() * 2);
            GlobalUnlock(mem);

            if OpenClipboard(std::ptr::null_mut()) == 0 {
                GlobalFree(mem);
                return Err("The clipboard is busy, try again".into());
            }
            EmptyClipboard();
            let ok = !SetClipboardData(CF_HDROP, mem as HANDLE).is_null();
            CloseClipboard();
            if !ok {
                GlobalFree(mem);
                return Err("Couldn't copy".into());
            }
            Ok(()) // the clipboard owns the memory now
        }
    }
}

#[cfg(test)]
mod tests {
    #[test]
    fn finds_screenshots() {
        for dir in super::remote_dirs("76561199478032206") {
            let up = super::uploaded(&dir);
            println!("{} uploaded entries: {}", dir.display(), up.len());
            println!("sample: {:?}", up.iter().next());
        }
    }
}
