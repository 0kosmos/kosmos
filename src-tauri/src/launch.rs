//! Launch time: what the estimate needs (game size, drive type, CPU, RAM) and
//! measuring real launches (from pressing Play until the game's window is in front).
//! Everything here only reads information; it never touches or hooks the game.

use std::path::{Path, PathBuf};

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct LaunchInputs {
    installed: bool,
    size_bytes: u64,
    drive: String, // "nvme" | "ssd" | "hdd" | "unknown"
}

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SystemInfo {
    pub(crate) cpu_threads: u32,
    pub(crate) ram_gb: u32,
}

#[derive(serde::Serialize, Clone)]
pub struct LaunchMeasured {
    appid: u32,
    seconds: f32,
}

// ---------- Steam's install files ----------

/// Reads `"key"   "value"` lines from Steam's text files (libraryfolders.vdf, appmanifest_*.acf).
pub(crate) fn vdf_values(text: &str, key: &str) -> Vec<String> {
    let needle = format!("\"{key}\"");
    text.lines()
        .filter_map(|line| {
            let t = line.trim();
            if !t.starts_with(&needle) {
                return None;
            }
            let parts: Vec<&str> = t.split('"').collect();
            // parts: ["", key, whitespace, value, ""]
            parts.get(3).map(|v| v.replace("\\\\", "\\"))
        })
        .collect()
}

/// All Steam library folders (the main Steam folder plus extra drives).
#[cfg(windows)]
pub(crate) fn steam_libraries() -> Vec<PathBuf> {
    let Ok(steam) = windows_registry::CURRENT_USER
        .open(r"Software\Valve\Steam")
        .and_then(|k| k.get_string("SteamPath"))
    else {
        return Vec::new();
    };
    let steam = PathBuf::from(steam.replace('/', "\\"));
    let mut libs = vec![steam.clone()];
    if let Ok(text) = std::fs::read_to_string(steam.join(r"steamapps\libraryfolders.vdf")) {
        for p in vdf_values(&text, "path") {
            let p = PathBuf::from(p);
            if !libs.iter().any(|l| {
                l.to_string_lossy()
                    .eq_ignore_ascii_case(&p.to_string_lossy())
            }) {
                libs.push(p);
            }
        }
    }
    libs
}

#[cfg(not(windows))]
pub(crate) fn steam_libraries() -> Vec<PathBuf> {
    Vec::new()
}

/// Where a game is installed and how big it is, from its appmanifest file.
pub(crate) fn find_install(appid: u32) -> Option<(PathBuf, u64)> {
    for lib in steam_libraries() {
        let manifest = lib
            .join("steamapps")
            .join(format!("appmanifest_{appid}.acf"));
        let Ok(text) = std::fs::read_to_string(&manifest) else {
            continue;
        };
        let dir = vdf_values(&text, "installdir").into_iter().next()?;
        let size = vdf_values(&text, "SizeOnDisk")
            .into_iter()
            .next()
            .and_then(|s| s.parse().ok())
            .unwrap_or(0);
        return Some((lib.join("steamapps").join("common").join(dir), size));
    }
    None
}

// ---------- Drive type (SSD / HDD / NVMe) ----------
// Windows is asked about the drive with DeviceIoControl(IOCTL_STORAGE_QUERY_PROPERTY):
//  - StorageDeviceSeekPenaltyProperty: "is jumping around slow?" -> yes = spinning hard drive
//  - StorageDeviceProperty: the connection type -> NVMe means a fast NVMe SSD
// Same information Windows' "Optimize Drives" uses. No admin rights needed.

#[cfg(windows)]
fn drive_kind(path: &Path) -> String {
    use std::sync::{Mutex, OnceLock};
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::Storage::FileSystem::{
        CreateFileW, FILE_SHARE_READ, FILE_SHARE_WRITE, OPEN_EXISTING,
    };
    use windows_sys::Win32::System::IO::DeviceIoControl;

    const IOCTL_STORAGE_QUERY_PROPERTY: u32 = 0x002D_1400;
    const STORAGE_DEVICE_PROPERTY: u32 = 0;
    const STORAGE_DEVICE_SEEK_PENALTY_PROPERTY: u32 = 7;
    const BUS_TYPE_NVME: u32 = 17;

    // Remember the answer per drive letter while the app runs
    static CACHE: OnceLock<Mutex<std::collections::HashMap<char, String>>> = OnceLock::new();
    let letter = path
        .to_string_lossy()
        .chars()
        .next()
        .map(|c| c.to_ascii_uppercase())
        .unwrap_or('?');
    if !letter.is_ascii_alphabetic() {
        return "unknown".into();
    }
    let cache = CACHE.get_or_init(Default::default);
    if let Some(k) = cache.lock().unwrap().get(&letter) {
        return k.clone();
    }

    // e.g. \\.\C:  (plus the end-of-text marker Windows expects)
    let device: Vec<u16> = format!(r"\\.\{letter}:")
        .encode_utf16()
        .chain(Some(0))
        .collect();
    let handle = unsafe {
        CreateFileW(
            device.as_ptr(),
            0, // no read/write access needed just to ask questions
            FILE_SHARE_READ | FILE_SHARE_WRITE,
            std::ptr::null(),
            OPEN_EXISTING,
            0,
            std::ptr::null_mut(),
        )
    };
    if handle == INVALID_HANDLE_VALUE {
        return "unknown".into();
    }

    // Ask one question; returns the raw answer bytes
    let query = |property: u32| -> Option<[u8; 64]> {
        let input: [u32; 3] = [property, 0 /* standard query */, 0];
        let mut out = [0u8; 64];
        let mut returned = 0u32;
        let ok = unsafe {
            DeviceIoControl(
                handle,
                IOCTL_STORAGE_QUERY_PROPERTY,
                input.as_ptr().cast(),
                std::mem::size_of_val(&input) as u32,
                out.as_mut_ptr().cast(),
                out.len() as u32,
                &mut returned,
                std::ptr::null_mut(),
            )
        };
        (ok != 0).then_some(out)
    };

    // Connection type is at byte 28 of STORAGE_DEVICE_DESCRIPTOR
    let is_nvme = query(STORAGE_DEVICE_PROPERTY)
        .map(|b| u32::from_le_bytes([b[28], b[29], b[30], b[31]]) == BUS_TYPE_NVME)
        .unwrap_or(false);
    // "Incurs seek penalty" is byte 8 of DEVICE_SEEK_PENALTY_DESCRIPTOR
    let seek_penalty = query(STORAGE_DEVICE_SEEK_PENALTY_PROPERTY).map(|b| b[8] != 0);
    unsafe { CloseHandle(handle) };

    let kind = if is_nvme {
        "nvme"
    } else {
        match seek_penalty {
            Some(true) => "hdd",
            Some(false) => "ssd",
            None => "unknown",
        }
    }
    .to_string();
    cache.lock().unwrap().insert(letter, kind.clone());
    kind
}

#[cfg(not(windows))]
fn drive_kind(_path: &Path) -> String {
    "unknown".into()
}

// ---------- Commands the app calls ----------

/// Size and drive type for one game (read only when you hover its Play button).
#[tauri::command]
pub fn launch_inputs(appid: u32) -> LaunchInputs {
    match find_install(appid) {
        Some((dir, size)) => LaunchInputs {
            installed: true,
            size_bytes: size,
            drive: drive_kind(&dir),
        },
        None => LaunchInputs::default(),
    }
}

/// CPU threads and RAM (read once; the app remembers it).
#[tauri::command]
pub fn system_info() -> SystemInfo {
    let cpu_threads = std::thread::available_parallelism()
        .map(|n| n.get() as u32)
        .unwrap_or(0);
    #[cfg(windows)]
    let ram_gb = {
        use windows_sys::Win32::System::SystemInformation::{GlobalMemoryStatusEx, MEMORYSTATUSEX};
        let mut m: MEMORYSTATUSEX = unsafe { std::mem::zeroed() };
        m.dwLength = std::mem::size_of::<MEMORYSTATUSEX>() as u32;
        if unsafe { GlobalMemoryStatusEx(&mut m) } != 0 {
            ((m.ullTotalPhys as f64) / 1024f64.powi(3)).round() as u32
        } else {
            0
        }
    };
    #[cfg(not(windows))]
    let ram_gb = 0;
    SystemInfo {
        cpu_threads,
        ram_gb,
    }
}

/// Program (full path) that owns the window currently in front.
#[cfg(windows)]
fn foreground_exe() -> Option<String> {
    use windows_sys::Win32::Foundation::CloseHandle;
    use windows_sys::Win32::System::Threading::{
        OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW,
    };
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetForegroundWindow, GetWindowThreadProcessId,
    };

    let window = unsafe { GetForegroundWindow() };
    if window.is_null() {
        return None;
    }
    let mut pid = 0u32;
    unsafe { GetWindowThreadProcessId(window, &mut pid) };
    if pid == 0 {
        return None;
    }
    let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
    if process.is_null() {
        return None;
    }
    let mut buf = [0u16; 1024];
    let mut len = buf.len() as u32;
    let ok = unsafe { QueryFullProcessImageNameW(process, 0, buf.as_mut_ptr(), &mut len) };
    unsafe { CloseHandle(process) };
    (ok != 0).then(|| String::from_utf16_lossy(&buf[..len as usize]))
}

/// Start timing a launch. Called right when you press Play in Kosmos.
/// Checks twice a second which window is in front, only during the launch, and stops as
/// soon as a window from the game's own folder appears (or after 3 minutes).
#[tauri::command]
pub fn measure_launch(app: tauri::AppHandle, appid: u32) {
    #[cfg(windows)]
    {
        use std::time::{Duration, Instant};
        use tauri::Emitter;

        let start = Instant::now();
        std::thread::spawn(move || {
            let Some((dir, _)) = find_install(appid) else {
                return;
            };
            let mut prefix = dir.to_string_lossy().to_lowercase();
            if !prefix.ends_with('\\') {
                prefix.push('\\');
            }
            while start.elapsed() < Duration::from_secs(180) {
                std::thread::sleep(Duration::from_millis(500));
                if let Some(exe) = foreground_exe() {
                    if exe.to_lowercase().starts_with(&prefix) {
                        let seconds = start.elapsed().as_secs_f32();
                        let _ = app.emit("launch-measured", LaunchMeasured { appid, seconds });
                        return;
                    }
                }
            }
            // Gave up: e.g. the game uses a separate launcher. Nothing is saved.
        });
    }
    #[cfg(not(windows))]
    let _ = (app, appid);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_vdf_values() {
        let text = "\"AppState\"\n{\n\t\"installdir\"\t\t\"Terraria\"\n\t\"SizeOnDisk\"\t\t\"803964902\"\n}";
        assert_eq!(vdf_values(text, "installdir"), vec!["Terraria"]);
        assert_eq!(vdf_values(text, "SizeOnDisk"), vec!["803964902"]);
        let lib = "\t\t\"path\"\t\t\"D:\\\\SteamLibrary\"";
        assert_eq!(vdf_values(lib, "path"), vec!["D:\\SteamLibrary"]);
    }

    #[cfg(windows)]
    #[test]
    fn real_machine_info() {
        // Prints what this PC reports (run with: cargo test -- --nocapture)
        println!(
            "system: {:?}",
            serde_json::to_string(&system_info()).unwrap()
        );
        println!("C: drive = {}", drive_kind(Path::new("C:\\")));
        for id in [105600u32, 730, 3513350] {
            println!(
                "{id}: {}",
                serde_json::to_string(&launch_inputs(id)).unwrap()
            );
        }
    }
}
