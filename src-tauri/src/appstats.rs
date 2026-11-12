//! Kosmos's own CPU and memory use, for the status bar at the bottom of the window.
//! Kosmos is more than one program: this app plus the WebView2 programs that draw the pages
//! (they're started by Kosmos, so they're its "children" in Windows' process list).
//! We add all of them up. (Task Manager lists them apart: "Kosmos" is only the small main
//! program; the page drawing shows up as "Microsoft Edge WebView2".)
//! - CPU: time they spent on the processor since the last check, as a % of the whole PC.
//! - Memory: their "private working set", the same number Task Manager shows as Memory.
//! The app asks every few seconds, only while the window is visible.

#[derive(serde::Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct AppUsage {
    cpu: Option<f64>, // % of the whole PC; None on the first check (nothing to compare yet)
    memory_mb: u64,   // everything together
    app_mb: u64,      // the main Kosmos program only (what Task Manager's "Kosmos" row shows)
}

#[tauri::command(async)]
pub fn app_usage() -> AppUsage {
    #[cfg(windows)]
    {
        return imp::read();
    }
    #[allow(unreachable_code)]
    AppUsage::default()
}

#[cfg(windows)]
mod imp {
    use super::AppUsage;
    use std::collections::HashMap;
    use std::sync::Mutex;
    use std::time::Instant;
    use windows_sys::Win32::Foundation::{CloseHandle, FILETIME, INVALID_HANDLE_VALUE};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, PROCESSENTRY32W, Process32FirstW, Process32NextW,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::ProcessStatus::{
        K32GetProcessMemoryInfo, PROCESS_MEMORY_COUNTERS, PROCESS_MEMORY_COUNTERS_EX2,
    };
    use windows_sys::Win32::System::Threading::{
        GetProcessTimes, OpenProcess, PROCESS_QUERY_LIMITED_INFORMATION,
    };

    /// Last check: when, and each program's total CPU time then (100 ns units)
    static LAST: Mutex<Option<(Instant, HashMap<u32, u64>)>> = Mutex::new(None);

    /// Kosmos and every program it started (and those started by them)
    fn our_processes() -> Vec<u32> {
        let mut parent_of: Vec<(u32, u32)> = Vec::new();
        let snap = unsafe { CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) };
        if snap == INVALID_HANDLE_VALUE {
            return vec![std::process::id()];
        }
        let mut e: PROCESSENTRY32W = unsafe { std::mem::zeroed() };
        e.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;
        let mut ok = unsafe { Process32FirstW(snap, &mut e) };
        while ok != 0 {
            parent_of.push((e.th32ProcessID, e.th32ParentProcessID));
            ok = unsafe { Process32NextW(snap, &mut e) };
        }
        unsafe { CloseHandle(snap) };

        let mut ours = vec![std::process::id()];
        let mut i = 0;
        while i < ours.len() {
            let p = ours[i];
            for &(pid, parent) in &parent_of {
                if parent == p && pid != p && !ours.contains(&pid) {
                    ours.push(pid);
                }
            }
            i += 1;
        }
        ours
    }

    fn ft(f: FILETIME) -> u64 {
        ((f.dwHighDateTime as u64) << 32) | f.dwLowDateTime as u64
    }

    /// (CPU time so far, private working set in bytes) of one program
    fn usage_of(pid: u32) -> Option<(u64, u64)> {
        let h = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid) };
        if h.is_null() {
            return None;
        }
        let z = FILETIME {
            dwLowDateTime: 0,
            dwHighDateTime: 0,
        };
        let (mut c, mut x, mut k, mut u) = (z, z, z, z);
        let times_ok = unsafe { GetProcessTimes(h, &mut c, &mut x, &mut k, &mut u) } != 0;
        let mut mem: PROCESS_MEMORY_COUNTERS_EX2 = unsafe { std::mem::zeroed() };
        mem.cb = std::mem::size_of::<PROCESS_MEMORY_COUNTERS_EX2>() as u32;
        let mem_ok = unsafe {
            K32GetProcessMemoryInfo(
                h,
                &mut mem as *mut PROCESS_MEMORY_COUNTERS_EX2 as *mut PROCESS_MEMORY_COUNTERS,
                mem.cb,
            )
        } != 0;
        unsafe { CloseHandle(h) };
        times_ok.then(|| {
            (
                ft(k) + ft(u),
                if mem_ok {
                    mem.PrivateWorkingSetSize as u64
                } else {
                    0
                },
            )
        })
    }

    pub fn read() -> AppUsage {
        let now = Instant::now();
        let mut times = HashMap::new();
        let mut memory = 0u64;
        let mut app = 0u64;
        let me = std::process::id();
        for pid in our_processes() {
            if let Some((t, m)) = usage_of(pid) {
                times.insert(pid, t);
                memory += m;
                if pid == me {
                    app = m;
                }
            }
        }

        let mut last = LAST.lock().unwrap_or_else(|e| e.into_inner());
        let cpu = last.as_ref().map(|(at, before)| {
            // CPU time used since last check (programs that started since then count from 0)
            let used: u64 = times
                .iter()
                .map(|(pid, t)| t.saturating_sub(*before.get(pid).unwrap_or(&0)))
                .sum();
            let wall = now.duration_since(*at).as_nanos() as f64 / 100.0; // in 100 ns units
            let cores = std::thread::available_parallelism()
                .map(|n| n.get())
                .unwrap_or(1) as f64;
            if wall > 0.0 {
                (used as f64 / (wall * cores) * 100.0).clamp(0.0, 100.0)
            } else {
                0.0
            }
        });
        *last = Some((now, times));
        AppUsage {
            cpu,
            memory_mb: memory / (1024 * 1024),
            app_mb: app / (1024 * 1024),
        }
    }
}

#[cfg(all(test, windows))]
mod tests {
    #[test]
    fn reads_own_usage() {
        let first = super::app_usage();
        let mut x = 0u64;
        for i in 0..30_000_000u64 {
            x = x.wrapping_add(i * i);
        } // a little CPU work
        std::thread::sleep(std::time::Duration::from_millis(300));
        let second = super::app_usage();
        println!(
            "first cpu={:?} mem={} MB | second cpu={:?} mem={} MB ({x})",
            first.cpu, first.memory_mb, second.cpu, second.memory_mb
        );
        assert!(first.cpu.is_none() && second.cpu.is_some() && second.memory_mb > 0);
    }
}
