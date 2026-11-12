//! Your own games and apps in the Library (anything not from Steam or Epic).
//! The list itself is saved by the app; this file does the parts that need Windows:
//! reading a file's size, saving a cover picture you picked, and starting the game.

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Manager;

/// Files you can add: programs, shortcuts and web shortcuts
const RUNNABLE: [&str; 3] = ["exe", "lnk", "url"];
/// Pictures you can use as a cover
const PICTURES: [&str; 5] = ["png", "jpg", "jpeg", "webp", "gif"];

fn ext_of(p: &Path) -> String {
    p.extension().and_then(|e| e.to_str()).unwrap_or("").to_lowercase()
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileInfo {
    exists: bool,
    name: String,       // a starting name, from the file name ("my_game.exe" -> "my game")
    file_bytes: u64,    // the file itself
    folder_bytes: u64,  // the whole folder it's in (a game's real size), 0 if not measured
}

/// Size of the file, and of the folder it's in (that's usually the game's real size). The
/// folder isn't measured when it's a big shared place like the Desktop or Downloads.
#[tauri::command(async)]
pub fn custom_file_info(path: String) -> FileInfo {
    let p = PathBuf::from(&path);
    let Ok(meta) = std::fs::metadata(&p) else {
        return FileInfo { exists: false, name: String::new(), file_bytes: 0, folder_bytes: 0 };
    };
    let name = p.file_stem().and_then(|s| s.to_str()).unwrap_or("").replace(['_', '-'], " ");
    let folder_bytes = match p.parent() {
        Some(dir) if !is_shared_folder(dir) => crate::downloads::folder_size(dir),
        _ => 0,
    };
    FileInfo { exists: true, name: name.trim().to_string(), file_bytes: meta.len(), folder_bytes }
}

/// Places where adding up everything would be slow and wrong (not "the game's folder")
fn is_shared_folder(dir: &Path) -> bool {
    if dir.parent().is_none() || dir.components().count() <= 2 {
        return true; // a drive (C:\) or right below it (C:\Games is fine one level deeper)
    }
    let name = dir.file_name().and_then(|n| n.to_str()).unwrap_or("").to_lowercase();
    matches!(
        name.as_str(),
        "desktop" | "downloads" | "documents" | "program files" | "program files (x86)" | "windows" | "system32" | "programs" | "start menu"
    )
}

/// Copy a picture you picked into Kosmos's own folder, so it keeps working if the original is
/// moved. Returns where the copy is. Pictures larger than 15 MB are refused.
#[tauri::command(async)]
pub fn custom_cover_save(app: tauri::AppHandle, source: String, id: String) -> Result<String, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Bad id".into());
    }
    let src = PathBuf::from(&source);
    let ext = ext_of(&src);
    if !PICTURES.contains(&ext.as_str()) {
        return Err("Pick a PNG, JPG, WEBP or GIF picture".into());
    }
    let size = std::fs::metadata(&src).map_err(|_| "Can't read that picture")?.len();
    if size > 15 * 1024 * 1024 {
        return Err("That picture is too big (max 15 MB)".into());
    }
    let dir = covers_dir(&app)?;
    // A new name each time, so the app shows the new picture instead of a remembered one
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let dest = dir.join(format!("{id}-{stamp}.{ext}"));
    std::fs::copy(&src, &dest).map_err(|e| e.to_string())?;
    Ok(dest.to_string_lossy().into_owned())
}

/// Delete a game's cover pictures, except `keep` (the one in use). Called when you save or
/// cancel (so pictures you tried but didn't keep are removed) and when you remove the game.
#[tauri::command(async)]
pub fn custom_cover_delete(app: tauri::AppHandle, id: String, keep: Option<String>) {
    if let Ok(dir) = covers_dir(&app) {
        remove_covers(&dir, &id, keep.as_deref().unwrap_or(""));
    }
}

fn covers_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?.join("custom-covers");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir)
}

fn remove_covers(dir: &Path, id: &str, keep: &str) {
    if id.is_empty() {
        return;
    }
    if let Ok(entries) = std::fs::read_dir(dir) {
        for e in entries.flatten() {
            let path = e.path();
            if e.file_name().to_string_lossy().starts_with(&format!("{id}-")) && path.to_string_lossy() != keep {
                let _ = std::fs::remove_file(&path);
            }
        }
    }
}

/// Start a game you added. Programs start in their own folder (many games need that);
/// shortcuts are opened by Windows like a double-click.
#[tauri::command(async)]
pub fn custom_launch(path: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    let ext = ext_of(&p);
    if !RUNNABLE.contains(&ext.as_str()) {
        return Err("Kosmos can only start programs and shortcuts".into());
    }
    if !p.is_file() {
        return Err("The file isn't there anymore (moved or deleted?)".into());
    }
    if ext == "exe" {
        let mut cmd = std::process::Command::new(&p);
        if let Some(dir) = p.parent() {
            cmd.current_dir(dir);
        }
        cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
    } else {
        tauri_plugin_opener::open_path(&path, None::<&str>).map_err(|e| e.to_string())
    }
}
