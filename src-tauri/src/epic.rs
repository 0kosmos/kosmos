//! Epic Games: your Epic library, read from the Epic Games Launcher's own files on this PC.
//! - Installed games: one small JSON file per game in the launcher's "Manifests" folder.
//! - Games you own: the launcher keeps a copy of your library's details (names, IDs, cover
//!   pictures) in "Catalog\catcache.bin" (base64-encoded JSON). It's updated whenever the
//!   Epic launcher runs, so no Epic login is needed here.
//! We only read these files. Games are started/installed by the Epic launcher itself through
//! com.epicgames.launcher:// links (see src/lib/epic.svelte.ts).

use serde::Serialize;
use serde_json::Value;
use std::path::{Path, PathBuf};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EpicGame {
    app_name: String,  // Epic's ID for the game (the same in both files)
    name: String,      // display name
    namespace: String, // catalog namespace + item ID: needed to launch / install it
    item_id: String,
    installed: bool,
    installing: bool, // an install that isn't finished yet (downloading or paused in Epic)
    install_dir: String,
    size_bytes: u64,
    cover: String, // tall cover picture (empty if unknown)
    wide: String,  // wide picture, for lists (empty if unknown)
}

/// The launcher's data folder. Epic writes its path to the registry; if it's missing,
/// use the usual place.
fn data_dir() -> PathBuf {
    #[cfg(windows)]
    if let Ok(p) = windows_registry::LOCAL_MACHINE
        .open(r"SOFTWARE\WOW6432Node\Epic Games\EpicGamesLauncher")
        .and_then(|k| k.get_string("AppDataPath"))
    {
        return PathBuf::from(p);
    }
    let base = std::env::var("ProgramData").unwrap_or_else(|_| r"C:\ProgramData".into());
    PathBuf::from(base).join(r"Epic\EpicGamesLauncher\Data")
}

fn str_of(v: &Value, k: &str) -> String {
    v.get(k).and_then(|x| x.as_str()).unwrap_or("").to_string()
}

/// Installed games, from the launcher's manifest files
fn installed_games(dir: &Path) -> Vec<EpicGame> {
    let Ok(entries) = std::fs::read_dir(dir.join("Manifests")) else {
        return Vec::new();
    };
    let mut games = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("item") {
            continue;
        }
        let Ok(text) = std::fs::read_to_string(&path) else { continue };
        let Ok(v) = serde_json::from_str::<Value>(&text) else { continue };

        // Skip half-finished installs, add-ons (DLC point to a main game), and things that
        // aren't games (Unreal Engine, plugins...)
        let is_game = v
            .get("AppCategories")
            .and_then(|c| c.as_array())
            .is_some_and(|c| c.iter().any(|x| x.as_str() == Some("games")));
        let incomplete = v.get("bIsIncompleteInstall").and_then(|x| x.as_bool()).unwrap_or(false);
        if !is_game || !str_of(&v, "MainGameAppName").is_empty() {
            continue;
        }
        let install_dir = str_of(&v, "InstallLocation");
        if install_dir.is_empty() || !Path::new(&install_dir).is_dir() {
            continue; // folder was deleted by hand
        }
        let app_name = str_of(&v, "AppName");
        if app_name.is_empty() {
            continue;
        }
        let display = str_of(&v, "DisplayName");
        games.push(EpicGame {
            name: if display.is_empty() { app_name.clone() } else { display },
            app_name,
            namespace: str_of(&v, "CatalogNamespace"),
            item_id: str_of(&v, "CatalogItemId"),
            installed: !incomplete,
            installing: incomplete,
            install_dir,
            size_bytes: v.get("InstallSize").and_then(|x| x.as_u64()).unwrap_or(0),
            cover: String::new(),
            wide: String::new(),
        });
    }
    games
}

/// Games in your Epic library, from the launcher's catalog copy
fn owned_games(dir: &Path) -> Vec<EpicGame> {
    let Ok(raw) = std::fs::read(dir.join(r"Catalog\catcache.bin")) else {
        return Vec::new();
    };
    let Some(bytes) = base64_decode(&raw) else { return Vec::new() };
    let Ok(Value::Array(items)) = serde_json::from_slice::<Value>(&bytes) else {
        return Vec::new();
    };

    let mut games: Vec<EpicGame> = Vec::new();
    for it in &items {
        let cats: Vec<&str> = it
            .get("categories")
            .and_then(|c| c.as_array())
            .map(|c| c.iter().filter_map(|x| x.get("path").and_then(|p| p.as_str())).collect())
            .unwrap_or_default();
        // Only games: not apps (Unreal Engine...), not extras (soundtracks, art books)
        if !cats.contains(&"games") || cats.contains(&"digitalextras") {
            continue;
        }
        // Add-ons point to their main game
        let main_id = it.get("mainGameItem").map(|m| str_of(m, "id")).unwrap_or_default();
        if !main_id.is_empty() {
            continue;
        }
        // The Windows version (skips phone-only games)
        let Some(release) = it.get("releaseInfo").and_then(|r| r.as_array()).and_then(|r| {
            r.iter().find(|x| {
                !str_of(x, "appId").is_empty()
                    && x.get("platform")
                        .and_then(|p| p.as_array())
                        .is_some_and(|p| p.iter().any(|s| s.as_str() == Some("Windows")))
            })
        }) else {
            continue;
        };
        let app_name = str_of(release, "appId");
        if games.iter().any(|g| g.app_name == app_name) {
            continue;
        }
        // Tall cover picture if there is one, otherwise the wide one
        let images = it.get("keyImages").and_then(|k| k.as_array());
        let image = |kind: &str| {
            images
                .and_then(|list| list.iter().find(|i| str_of(i, "type") == kind))
                .map(|i| str_of(i, "url"))
        };
        let cover = image("DieselGameBoxTall").or_else(|| image("DieselGameBox")).unwrap_or_default();
        let wide = image("DieselGameBox").unwrap_or_default();

        games.push(EpicGame {
            app_name,
            name: str_of(it, "title"),
            namespace: str_of(it, "namespace"),
            item_id: str_of(it, "id"),
            installed: false,
            installing: false,
            install_dir: String::new(),
            size_bytes: 0,
            cover,
            wide,
        });
    }
    games
}

/// Your Epic games: everything you own, marked installed or not
/// (an empty list if the Epic launcher isn't installed)
#[tauri::command(async)]
pub fn epic_library() -> Vec<EpicGame> {
    let dir = data_dir();
    let mut games = owned_games(&dir);
    for inst in installed_games(&dir) {
        match games.iter_mut().find(|g| g.app_name == inst.app_name) {
            Some(g) => {
                g.installed = inst.installed;
                g.installing = inst.installing;
                g.install_dir = inst.install_dir;
                g.size_bytes = inst.size_bytes;
            }
            None => games.push(inst), // installed but not in the catalog copy (yet)
        }
    }
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    games
}

// ---------- Opening things in the Epic launcher ----------
// Done here instead of from the page, so every link is checked and built in one place.
// Windows passes com.epicgames.launcher:// links to the Epic Games Launcher. But when the
// launcher isn't running yet, it starts without acting on the link. So in that case we start
// it ourselves, wait (in the background) until its window is up, and only then send the link.

use std::time::{Duration, Instant};

/// IDs and page names are letters, digits, "-", "_" and "." only
fn safe(s: &str) -> bool {
    !s.is_empty() && s.len() <= 160 && s.chars().all(|c| c.is_ascii_alphanumeric() || "-_.".contains(c))
}

fn open(url: &str) -> Result<(), String> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

/// Send a link to the Epic launcher. Returns "sent", or "starting" when the launcher had to be
/// started first (the link follows by itself once it's ready).
fn send_to_launcher(url: String) -> Result<String, String> {
    #[cfg(windows)]
    if win::launcher_pids().is_empty() {
        if let Some(exe) = win::launcher_exe() {
            std::process::Command::new(&exe).spawn().map_err(|e| e.to_string())?;
            std::thread::spawn(move || {
                // Wait up to 90 s for the launcher's window, then give it a moment to finish loading
                let start = Instant::now();
                while start.elapsed() < Duration::from_secs(90) {
                    std::thread::sleep(Duration::from_millis(700));
                    if win::launcher_window_up() {
                        std::thread::sleep(Duration::from_secs(4));
                        let _ = open(&url);
                        return;
                    }
                }
                let _ = open(&url); // never saw a window: try anyway
            });
            return Ok("starting".into());
        }
    }
    open(&url).map(|_| "sent".into())
}

/// Start or install a game through the Epic launcher. action: "launch" or "install"
#[tauri::command(async)]
pub fn epic_app(action: String, namespace: String, item_id: String, app_name: String) -> Result<String, String> {
    if !matches!(action.as_str(), "launch" | "install") || ![&namespace, &item_id, &app_name].iter().all(|s| safe(s)) {
        return Err("Unknown game".into());
    }
    send_to_launcher(format!(
        "com.epicgames.launcher://apps/{namespace}%3A{item_id}%3A{app_name}?action={action}&silent=true"
    ))
}

/// Open an Epic page:
/// - "library": your library in the Epic launcher
/// - "store" + page name: a game's page on the Epic Games Store website (in your browser;
///   the launcher doesn't reliably open store pages from a link)
/// - "search" + game name: the Epic Games Store website, searching for that game (used for games
///   in your library, because the launcher's files don't include their page name)
#[tauri::command(async)]
pub fn epic_page(page: String, slug: Option<String>) -> Result<String, String> {
    match (page.as_str(), slug) {
        ("library", _) => send_to_launcher("com.epicgames.launcher://library".into()),
        ("store", Some(s)) if safe(&s) => open(&format!("https://store.epicgames.com/p/{s}")).map(|_| "sent".into()),
        ("search", Some(name)) if !name.is_empty() && name.len() <= 200 => {
            // Encode everything except letters and digits (spaces, ":", "'", accents...)
            let q: String = name
                .bytes()
                .map(|b| if b.is_ascii_alphanumeric() { (b as char).to_string() } else { format!("%{b:02X}") })
                .collect();
            open(&format!("https://store.epicgames.com/browse?q={q}&sortBy=relevancy&sortDir=DESC")).map(|_| "sent".into())
        }
        _ => Err("Unknown page".into()),
    }
}

#[cfg(windows)]
mod win {
    use windows_sys::Win32::Foundation::{CloseHandle, HWND, INVALID_HANDLE_VALUE, LPARAM};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextLengthW, GetWindowThreadProcessId, IsWindowVisible,
    };

    /// Running copies of EpicGamesLauncher.exe
    pub fn launcher_pids() -> Vec<u32> {
        let mut out = Vec::new();
        let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snap == INVALID_HANDLE_VALUE {
            return out;
        }
        let mut e: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = unsafe { Process32FirstW(snap, &mut e) };
        while ok != 0 {
            let len = e.szExeFile.iter().position(|&c| c == 0).unwrap_or(e.szExeFile.len());
            let name = String::from_utf16_lossy(&e.szExeFile[..len]);
            if name.eq_ignore_ascii_case("EpicGamesLauncher.exe") {
                out.push(e.th32ProcessID);
            }
            ok = unsafe { Process32NextW(snap, &mut e) };
        }
        unsafe { CloseHandle(snap) };
        out
    }

    /// Does the launcher have a visible window with a title yet? (= it's done starting up)
    pub fn launcher_window_up() -> bool {
        struct Search {
            pids: Vec<u32>,
            found: bool,
        }
        unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> i32 {
            let s = unsafe { &mut *(data as *mut Search) };
            let mut pid = 0u32;
            unsafe { GetWindowThreadProcessId(hwnd, &mut pid) };
            if s.pids.contains(&pid) && unsafe { IsWindowVisible(hwnd) } != 0 && unsafe { GetWindowTextLengthW(hwnd) } > 0 {
                s.found = true;
                return 0; // stop looking
            }
            1
        }
        let mut s = Search { pids: launcher_pids(), found: false };
        if s.pids.is_empty() {
            return false;
        }
        unsafe { EnumWindows(Some(each), &mut s as *mut Search as LPARAM) };
        s.found
    }

    /// Where the launcher is installed: Windows' entry for com.epicgames.launcher:// links
    /// says which program opens them, e.g. "C:\...\EpicGamesLauncher.exe" %1
    pub fn launcher_exe() -> Option<String> {
        let cmd = windows_registry::CLASSES_ROOT
            .open(r"com.epicgames.launcher\shell\open\command")
            .and_then(|k| k.get_string(""))
            .ok()?;
        let exe = match cmd.strip_prefix('"') {
            Some(rest) => rest.split('"').next()?.to_string(),
            None => cmd.split_whitespace().next()?.to_string(),
        };
        std::path::Path::new(&exe).is_file().then_some(exe)
    }
}

/// Small base64 decoder (standard alphabet; spaces and line breaks are skipped)
fn base64_decode(input: &[u8]) -> Option<Vec<u8>> {
    fn val(c: u8) -> Option<u32> {
        match c {
            b'A'..=b'Z' => Some((c - b'A') as u32),
            b'a'..=b'z' => Some((c - b'a' + 26) as u32),
            b'0'..=b'9' => Some((c - b'0' + 52) as u32),
            b'+' => Some(62),
            b'/' => Some(63),
            _ => None,
        }
    }
    let mut out = Vec::with_capacity(input.len() * 3 / 4);
    let (mut buf, mut bits) = (0u32, 0u32);
    for &c in input {
        if c == b'=' {
            break;
        }
        if c.is_ascii_whitespace() {
            continue;
        }
        buf = (buf << 6) | val(c)?;
        bits += 6;
        if bits >= 8 {
            bits -= 8;
            out.push((buf >> bits) as u8);
            buf &= (1 << bits) - 1;
        }
    }
    Some(out)
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn finds_launcher() {
        println!("exe: {:?}", super::win::launcher_exe());
        println!("running: {:?} window: {}", super::win::launcher_pids(), super::win::launcher_window_up());
    }
}
