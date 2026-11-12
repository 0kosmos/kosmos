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

/// Save the icon inside a program or shortcut as a picture (PNG, up to 256 x 256), so a game you
/// add shows its own icon instead of a letter. Returns where the picture is ("" = no icon found).
#[tauri::command(async)]
pub fn custom_icon_save(app: tauri::AppHandle, path: String, id: String) -> Result<String, String> {
    if id.is_empty() || !id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
        return Err("Bad id".into());
    }
    let p = PathBuf::from(&path);
    if !RUNNABLE.contains(&ext_of(&p).as_str()) || !p.is_file() {
        return Err("Not a program or shortcut".into());
    }
    #[cfg(windows)]
    {
        let Some((w, h, rgba)) = icon::extract(&p) else { return Ok(String::new()) };
        let dir = covers_dir(&app)?;
        let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
        let dest = dir.join(format!("{id}-{stamp}.png"));
        let file = std::fs::File::create(&dest).map_err(|e| e.to_string())?;
        let mut enc = png::Encoder::new(std::io::BufWriter::new(file), w, h);
        enc.set_color(png::ColorType::Rgba);
        enc.set_depth(png::BitDepth::Eight);
        let mut writer = enc.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(&rgba).map_err(|e| e.to_string())?;
        return Ok(dest.to_string_lossy().into_owned());
    }
    #[allow(unreachable_code)]
    Ok(String::new())
}

#[cfg(windows)]
mod icon {
    use std::os::windows::ffi::OsStrExt;
    use std::path::Path;
    use windows_sys::Win32::Graphics::Gdi::{
        DeleteObject, GetDC, GetDIBits, GetObjectW, ReleaseDC, BITMAP, BITMAPINFO, BITMAPINFOHEADER, BI_RGB,
        DIB_RGB_COLORS, HBITMAP,
    };
    use windows_sys::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_ICONLOCATION, SHGFI_LARGEICON};
    use windows_sys::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, PrivateExtractIconsW, HICON, ICONINFO};

    fn wide(s: &std::ffi::OsStr) -> Vec<u16> {
        s.encode_wide().chain(Some(0)).collect()
    }

    /// The program's icon as RGBA pixels: (width, height, pixels)
    pub fn extract(path: &Path) -> Option<(u32, u32, Vec<u8>)> {
        unsafe {
            // Where the icon is: a shortcut can name its own icon; otherwise it's the program the
            // shortcut starts (read from the .lnk file). A program has its own icon.
            let mut info: SHFILEINFOW = std::mem::zeroed();
            let is_link = path.extension().is_some_and(|e| e.eq_ignore_ascii_case("lnk"));
            let mut file = if is_link {
                shortcut_target(path).map(|t| t.into_os_string()).unwrap_or_else(|| path.as_os_str().to_owned())
            } else {
                path.as_os_str().to_owned()
            };
            let mut index = 0;
            let p = wide(path.as_os_str());
            if SHGetFileInfoW(p.as_ptr(), 0, &mut info, std::mem::size_of::<SHFILEINFOW>() as u32, SHGFI_ICONLOCATION) != 0 {
                let len = info.szDisplayName.iter().position(|&c| c == 0).unwrap_or(0);
                if len > 0 {
                    let loc = expand(&String::from_utf16_lossy(&info.szDisplayName[..len]));
                    if Path::new(&loc).is_file() {
                        file = loc.into();
                        index = info.iIcon;
                    }
                }
            }

            // The big version of that icon (256 x 256, or the biggest there is)
            let mut hicon: HICON = std::ptr::null_mut();
            let mut id = 0u32;
            let f = wide(&file);
            let got = PrivateExtractIconsW(f.as_ptr(), index, 256, 256, &mut hicon, &mut id, 1, 0);
            if got == 0 || got == u32::MAX || hicon.is_null() {
                // No big icon: the small one Windows shows in File Explorer
                let mut small: SHFILEINFOW = std::mem::zeroed();
                SHGetFileInfoW(p.as_ptr(), 0, &mut small, std::mem::size_of::<SHFILEINFOW>() as u32, SHGFI_ICON | SHGFI_LARGEICON);
                hicon = small.hIcon;
                if hicon.is_null() {
                    return None;
                }
            }
            let pixels = pixels_of(hicon);
            DestroyIcon(hicon);
            pixels
        }
    }

    /// Fill in placeholders like %SystemRoot% in a path
    fn expand(path: &str) -> String {
        let mut out = String::new();
        let mut rest = path;
        while let Some(a) = rest.find('%') {
            out.push_str(&rest[..a]);
            let after = &rest[a + 1..];
            match after.find('%') {
                Some(b) => {
                    let name = &after[..b];
                    match std::env::var(name) {
                        Ok(v) if !name.is_empty() => out.push_str(&v),
                        _ => {
                            out.push('%');
                            out.push_str(name);
                            out.push('%');
                        }
                    }
                    rest = &after[b + 1..];
                }
                None => {
                    out.push_str(&rest[a..]);
                    rest = "";
                }
            }
        }
        out.push_str(rest);
        out
    }

    /// The program (or icon file) a shortcut (.lnk) points to, read from the shortcut file itself.
    /// Microsoft's documented .lnk layout: a header, an optional item list, an optional "LinkInfo"
    /// with the full path, then texts: name, relative path, working folder, arguments, icon.
    /// Tried in this order: the shortcut's own icon, the relative path, the full path.
    fn shortcut_target(path: &Path) -> Option<std::path::PathBuf> {
        let d = std::fs::read(path).ok()?;
        let u32_at = |o: usize| d.get(o..o + 4).map(|b| u32::from_le_bytes([b[0], b[1], b[2], b[3]]) as usize);
        let u16_at = |o: usize| d.get(o..o + 2).map(|b| u16::from_le_bytes([b[0], b[1]]) as usize);
        if u32_at(0)? != 0x4C {
            return None;
        }
        let flags = u32_at(0x14)?;
        let unicode = flags & 0x80 != 0;
        let mut pos = 0x4C;
        if flags & 0x1 != 0 {
            pos += 2 + u16_at(pos)?; // item list
        }

        // Full path from LinkInfo (if there is one)
        let mut full: Option<std::path::PathBuf> = None;
        if flags & 0x2 != 0 {
            let info = pos;
            let header = u32_at(info + 4)?;
            if header >= 0x24 {
                if let Some(off) = u32_at(info + 0x1C).filter(|&o| o > 0) {
                    let mut chars: Vec<u16> = Vec::new();
                    let mut o = info + off;
                    while let Some(c) = u16_at(o) {
                        if c == 0 {
                            break;
                        }
                        chars.push(c as u16);
                        o += 2;
                    }
                    full = Some(String::from_utf16_lossy(&chars).into());
                }
            }
            if full.is_none() {
                if let Some(start) = u32_at(info + 0x10).map(|o| info + o) {
                    if let Some(len) = d.get(start..).and_then(|r| r.iter().position(|&b| b == 0)) {
                        full = Some(String::from_utf8_lossy(&d[start..start + len]).to_string().into());
                    }
                }
            }
            pos += u32_at(info)?; // skip LinkInfo
        }

        // The texts that follow (only the ones the flags say are there)
        let read_text = |pos: &mut usize| -> Option<String> {
            let n = u16_at(*pos)?;
            *pos += 2;
            let t = if unicode {
                let units: Vec<u16> = (0..n).filter_map(|i| u16_at(*pos + i * 2).map(|c| c as u16)).collect();
                *pos += n * 2;
                String::from_utf16_lossy(&units)
            } else {
                let t = String::from_utf8_lossy(d.get(*pos..*pos + n)?).to_string();
                *pos += n;
                t
            };
            Some(t)
        };
        let mut relative = None;
        let mut icon = None;
        for (bit, slot) in [(0x4, 0), (0x8, 1), (0x10, 2), (0x20, 3), (0x40, 4)] {
            if flags & bit == 0 {
                continue;
            }
            let t = read_text(&mut pos)?;
            match slot {
                1 => relative = Some(t),
                4 => icon = Some(t),
                _ => {}
            }
        }

        let folder = path.parent()?;
        let candidates = [
            icon.map(|i| std::path::PathBuf::from(expand(&i))),
            relative.map(|r| folder.join(r)),
            full,
        ];
        candidates.into_iter().flatten().find(|c| c.is_file())
    }

    fn pixels_of(hicon: HICON) -> Option<(u32, u32, Vec<u8>)> { unsafe {
        let mut ii: ICONINFO = std::mem::zeroed();
        if GetIconInfo(hicon, &mut ii) == 0 {
            return None;
        }
        let result = (|| {
            let color = read_bits(ii.hbmColor)?;
            let (w, h, mut px) = color;
            // px is BGRA; older icons have no transparency in their colors: use the mask instead
            if px.chunks(4).all(|c| c[3] == 0) {
                if let Some((_, _, mask)) = read_bits(ii.hbmMask) {
                    for (c, m) in px.chunks_mut(4).zip(mask.chunks(4)) {
                        c[3] = if m[0] > 127 { 0 } else { 255 }; // white in the mask = see-through
                    }
                } else {
                    px.chunks_mut(4).for_each(|c| c[3] = 255);
                }
            }
            for c in px.chunks_mut(4) {
                c.swap(0, 2); // BGRA -> RGBA
            }
            Some((w, h, px))
        })();
        if !ii.hbmColor.is_null() {
            DeleteObject(ii.hbmColor as _);
        }
        if !ii.hbmMask.is_null() {
            DeleteObject(ii.hbmMask as _);
        }
        result
    }
    }

    /// A bitmap's pixels as 32-bit top-to-bottom rows
    fn read_bits(bmp: HBITMAP) -> Option<(u32, u32, Vec<u8>)> { unsafe {
        if bmp.is_null() {
            return None;
        }
        let mut b: BITMAP = std::mem::zeroed();
        if GetObjectW(bmp as _, std::mem::size_of::<BITMAP>() as i32, &mut b as *mut BITMAP as _) == 0 {
            return None;
        }
        let (w, h) = (b.bmWidth.max(1), b.bmHeight.max(1));
        let mut bi: BITMAPINFO = std::mem::zeroed();
        bi.bmiHeader = BITMAPINFOHEADER {
            biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
            biWidth: w,
            biHeight: -h, // negative = top row first
            biPlanes: 1,
            biBitCount: 32,
            biCompression: BI_RGB,
            ..std::mem::zeroed()
        };
        let mut px = vec![0u8; (w * h * 4) as usize];
        let dc = GetDC(std::ptr::null_mut());
        let lines = GetDIBits(dc, bmp, 0, h as u32, px.as_mut_ptr() as _, &mut bi, DIB_RGB_COLORS);
        ReleaseDC(std::ptr::null_mut(), dc);
        if lines == 0 {
            return None;
        }
        Some((w as u32, h as u32, px))
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

