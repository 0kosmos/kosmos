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
    install_dir: String,
    size_bytes: u64,
    cover: String, // tall cover picture (empty if unknown)
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
        if incomplete || !is_game || !str_of(&v, "MainGameAppName").is_empty() {
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
            installed: true,
            install_dir,
            size_bytes: v.get("InstallSize").and_then(|x| x.as_u64()).unwrap_or(0),
            cover: String::new(),
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

        games.push(EpicGame {
            app_name,
            name: str_of(it, "title"),
            namespace: str_of(it, "namespace"),
            item_id: str_of(it, "id"),
            installed: false,
            install_dir: String::new(),
            size_bytes: 0,
            cover,
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
                g.installed = true;
                g.install_dir = inst.install_dir;
                g.size_bytes = inst.size_bytes;
            }
            None => games.push(inst), // installed but not in the catalog copy (yet)
        }
    }
    games.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
    games
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
