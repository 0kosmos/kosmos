//! Live stats for the running game: CPU %, RAM, GPU % and video memory.
//! Only read when the app asks (about every 2 s, only while the Kosmos window is visible and
//! the option is on). Read-only: nothing here touches or hooks the game.
//!
//! "The game" = every program started from the game's install folder.
//! - CPU: time each of those programs spent on the CPU since the last check (GetProcessTimes).
//! - RAM: their working sets added together (what Task Manager calls memory, roughly).
//! - GPU: Windows' own per-program GPU counters ("GPU Engine" / "GPU Process Memory"), the same
//!   ones Task Manager uses. They work for NVIDIA, AMD and Intel alike (Windows 10 1709+).

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct GameStats {
    found: bool,         // false = no running program from the game's folder
    cpu: Option<f32>,    // % of the whole CPU (None on the first check)
    ram_mb: u64,
    gpu: Option<f32>,    // % (None if Windows' GPU counters aren't available)
    vram_mb: Option<u64>,
}

#[cfg(windows)]
mod imp {
    use super::GameStats;
    use std::collections::HashMap;
    use std::sync::Mutex;
    use std::time::{Duration, Instant};
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W, TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Performance::{
        PdhAddEnglishCounterW, PdhCollectQueryData, PdhGetFormattedCounterArrayW, PdhOpenQueryW,
        PDH_FMT_COUNTERVALUE_ITEM_W, PDH_FMT_DOUBLE, PDH_FMT_LARGE,
    };
    use windows_sys::Win32::System::ProcessStatus::{K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS};
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, QueryFullProcessImageNameW, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    const PDH_MORE_DATA: u32 = 0x8000_07D2;
    const PDH_FMT_NOCAP100: u32 = 0x8000;

    struct Pdh {
        engine: *mut core::ffi::c_void,
        memory: *mut core::ffi::c_void,
        query: *mut core::ffi::c_void,
    }
    // The handles are only used while holding the Mutex below
    unsafe impl Send for Pdh {}

    #[derive(Default)]
    struct Monitor {
        appid: u32,
        folder: String,              // lowercased install folder + "\"
        pids: Vec<u32>,
        pids_at: Option<Instant>,    // when we last looked for the game's programs
        last_cpu: HashMap<u32, u64>, // pid -> CPU time (100 ns units) at the last check
        last_at: Option<Instant>,
        pdh: Option<Pdh>,
        pdh_failed: bool,
    }

    static MONITOR: Mutex<Option<Monitor>> = Mutex::new(None);

    fn exe_path(pid: u32) -> Option<String> {
        let h = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if h.is_null() {
            return None;
        }
        let mut buf = [0u16; 1024];
        let mut len = buf.len() as u32;
        let ok = unsafe { QueryFullProcessImageNameW(h, 0, buf.as_mut_ptr(), &mut len) };
        unsafe { CloseHandle(h) };
        (ok != 0).then(|| String::from_utf16_lossy(&buf[..len as usize]))
    }

    /// All running programs whose file is inside the game's folder.
    fn find_pids(folder: &str) -> Vec<u32> {
        let mut out = Vec::new();
        let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snap == INVALID_HANDLE_VALUE {
            return out;
        }
        let mut e: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = unsafe { Process32FirstW(snap, &mut e) };
        while ok != 0 {
            let pid = e.th32ProcessID;
            if pid > 4 {
                if let Some(path) = exe_path(pid) {
                    if path.to_lowercase().starts_with(folder) {
                        out.push(pid);
                    }
                }
            }
            ok = unsafe { Process32NextW(snap, &mut e) };
        }
        unsafe { CloseHandle(snap) };
        out
    }

    fn ft(f: FILETIME) -> u64 {
        ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64
    }

    /// (CPU time in 100 ns units, working set bytes) for one program.
    fn process_usage(pid: u32) -> Option<(u64, u64)> {
        let h = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if h.is_null() {
            return None;
        }
        let z = FILETIME { dwLowDateTime: 0, dwHighDateTime: 0 };
        let (mut c, mut x, mut k, mut u) = (z, z, z, z);
        let times_ok = unsafe { GetProcessTimes(h, &mut c, &mut x, &mut k, &mut u) } != 0;
        let mut mem: PROCESS_MEMORY_COUNTERS = unsafe { std::mem::zeroed() };
        mem.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS>() as u32;
        let mem_ok = unsafe { K32GetProcessMemoryInfo(h, &mut mem, mem.cb) } != 0;
        unsafe { CloseHandle(h) };
        times_ok.then(|| (ft(k) + ft(u), if mem_ok { mem.WorkingSetSize as u64 } else { 0 }))
    }

    fn open_pdh() -> Option<Pdh> {
        let mut query = std::ptr::null_mut();
        if unsafe { PdhOpenQueryW(std::ptr::null(), 0, &mut query) } != 0 {
            return None;
        }
        let add = |path: &str| {
            let w: Vec<u16> = path.encode_utf16().chain(Some(0)).collect();
            let mut counter = std::ptr::null_mut();
            let r = unsafe { PdhAddEnglishCounterW(query, w.as_ptr(), 0, &mut counter) };
            (r == 0).then_some(counter)
        };
        let engine = add(r"\GPU Engine(*)\Utilization Percentage")?;
        let memory = add(r"\GPU Process Memory(*)\Dedicated Usage")?;
        unsafe { PdhCollectQueryData(query) }; // first sample; GPU % needs two
        Some(Pdh { engine, memory, query })
    }

    /// Every instance of a counter as (instance name, value).
    fn counter_items(counter: *mut core::ffi::c_void, format: u32) -> Vec<(String, f64, i64)> {
        let mut size = 0u32;
        let mut count = 0u32;
        let r = unsafe {
            PdhGetFormattedCounterArrayW(counter, format, &mut size, &mut count, std::ptr::null_mut())
        };
        if r != PDH_MORE_DATA || size == 0 {
            return Vec::new();
        }
        // Buffer of u64s so the items inside are properly aligned
        let mut buf = vec![0u64; (size as usize).div_ceil(8)];
        let items = buf.as_mut_ptr() as *mut PDH_FMT_COUNTERVALUE_ITEM_W;
        if unsafe { PdhGetFormattedCounterArrayW(counter, format, &mut size, &mut count, items) } != 0 {
            return Vec::new();
        }
        (0..count as usize)
            .map(|i| unsafe {
                let it = &*items.add(i);
                let name = widestr(it.szName);
                (name, it.FmtValue.Anonymous.doubleValue, it.FmtValue.Anonymous.largeValue)
            })
            .collect()
    }

    unsafe fn widestr(p: *const u16) -> String {
        if p.is_null() {
            return String::new();
        }
        let mut len = 0;
        while unsafe { *p.add(len) } != 0 {
            len += 1;
        }
        String::from_utf16_lossy(unsafe { std::slice::from_raw_parts(p, len) })
    }

    /// Instance names look like "pid_1234_luid_0x..._engtype_3D"
    fn pid_of(name: &str) -> Option<u32> {
        name.strip_prefix("pid_")?.split('_').next()?.parse().ok()
    }

    pub fn game_stats(appid: u32) -> GameStats {
        let Some((dir, _)) = crate::launch::find_install(appid) else {
            reset();
            return GameStats::default();
        };
        stats_for_folder(appid, &dir.to_string_lossy())
    }

    /// Stats for all programs running from one folder (`key` identifies the game).
    pub fn stats_for_folder(key: u32, dir: &str) -> GameStats {
        let mut guard = MONITOR.lock().unwrap();
        // New game: start fresh
        if guard.as_ref().map(|m| m.appid) != Some(key) {
            let mut folder = dir.to_lowercase();
            if !folder.ends_with('\\') {
                folder.push('\\');
            }
            *guard = Some(Monitor { appid: key, folder, ..Default::default() });
        }
        let m = guard.as_mut().unwrap();

        // Look for the game's programs again every 10 s (games sometimes start helper programs)
        if m.pids.is_empty() || m.pids_at.is_none_or(|t| t.elapsed() > Duration::from_secs(10)) {
            m.pids = find_pids(&m.folder);
            m.pids_at = Some(Instant::now());
        }
        if m.pids.is_empty() {
            return GameStats::default();
        }

        // CPU and RAM
        let now = Instant::now();
        let threads = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f64;
        let mut ram = 0u64;
        let mut cpu_delta = 0u64;
        let mut had_previous = false;
        let mut current = HashMap::new();
        for &pid in &m.pids {
            if let Some((cpu_time, ws)) = process_usage(pid) {
                ram += ws;
                if let Some(&prev) = m.last_cpu.get(&pid) {
                    cpu_delta += cpu_time.saturating_sub(prev);
                    had_previous = true;
                }
                current.insert(pid, cpu_time);
            }
        }
        let cpu = match (m.last_at, had_previous) {
            (Some(prev), true) => {
                let elapsed_100ns = now.duration_since(prev).as_nanos() as f64 / 100.0;
                Some(((cpu_delta as f64 / (elapsed_100ns * threads)) * 100.0).min(100.0) as f32)
            }
            _ => None,
        };
        m.last_cpu = current;
        m.last_at = Some(now);

        // GPU (Windows' counters; opened once, then sampled each check)
        if m.pdh.is_none() && !m.pdh_failed {
            m.pdh = open_pdh();
            m.pdh_failed = m.pdh.is_none();
        }
        let (mut gpu, mut vram) = (None, None);
        if let Some(p) = &m.pdh {
            if unsafe { PdhCollectQueryData(p.query) } == 0 {
                // Like Task Manager: the busiest engine type (3D, video, copy...) counts
                let mut per_engine: HashMap<String, f64> = HashMap::new();
                for (name, value, _) in counter_items(p.engine, PDH_FMT_DOUBLE | PDH_FMT_NOCAP100) {
                    if pid_of(&name).is_some_and(|pid| m.pids.contains(&pid)) {
                        let engine = name.rsplit("engtype_").next().unwrap_or("").to_string();
                        *per_engine.entry(engine).or_default() += value;
                    }
                }
                gpu = Some(per_engine.values().cloned().fold(0.0, f64::max).min(100.0) as f32);
                let bytes: i64 = counter_items(p.memory, PDH_FMT_LARGE)
                    .into_iter()
                    .filter(|(n, _, _)| pid_of(n).is_some_and(|pid| m.pids.contains(&pid)))
                    .map(|(_, _, v)| v)
                    .sum();
                vram = Some(bytes.max(0) as u64 / (1024 * 1024));
            }
        }

        GameStats { found: true, cpu, ram_mb: ram / (1024 * 1024), gpu, vram_mb: vram }
    }

    /// Stop tracking (game closed or stats switched off). Frees Windows' counters.
    pub fn reset() {
        *MONITOR.lock().unwrap() = None;
    }

    impl Drop for Pdh {
        fn drop(&mut self) {
            unsafe { windows_sys::Win32::System::Performance::PdhCloseQuery(self.query) };
        }
    }
}

// (async) = runs on a background thread, so the first check (~0.5 s) never freezes the window
#[tauri::command(async)]
pub fn game_stats(appid: u32) -> GameStats {
    #[cfg(windows)]
    return imp::game_stats(appid);
    #[cfg(not(windows))]
    {
        let _ = appid;
        GameStats::default()
    }
}

#[tauri::command]
pub fn stop_game_stats() {
    #[cfg(windows)]
    imp::reset();
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn measure_cost() {
        // Steam's own folder stands in for a "game" (Steam + its web helpers are usually running).
        // Prints the stats and how long each check takes (run with: cargo test -- --nocapture).
        let steam = r"C:\Program Files (x86)\Steam";
        for i in 0..4 {
            let t = std::time::Instant::now();
            let s = super::imp::stats_for_folder(1, steam);
            println!(
                "check {i}: {:>6.1?}  found={} cpu={:?} ram={} MB gpu={:?} vram={:?} MB",
                t.elapsed(), s.found, s.cpu, s.ram_mb, s.gpu, s.vram_mb
            );
            std::thread::sleep(std::time::Duration::from_secs(2));
        }
        super::stop_game_stats();
    }
}
