//! "My PC" panel: CPU, GPU, RAM and Windows version, read once from Windows' own records.

#[derive(serde::Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct PcInfo {
    cpu: String,
    cpu_threads: u32,
    gpus: Vec<Gpu>,
    ram_gb: u32,
    os: String,
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Gpu {
    name: String,
    vram_gb: f32, // 0 = unknown
}

#[cfg(windows)]
fn read() -> PcInfo {
    use windows_registry::LOCAL_MACHINE;

    // CPU name, e.g. "Intel(R) Core(TM) i7-3770 CPU @ 3.40GHz" -> "Intel Core i7-3770 CPU @ 3.40GHz"
    let cpu = LOCAL_MACHINE
        .open(r"HARDWARE\DESCRIPTION\System\CentralProcessor\0")
        .and_then(|k| k.get_string("ProcessorNameString"))
        .unwrap_or_default()
        .replace("(R)", "")
        .replace("(TM)", "")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");

    // Graphics cards: Windows' "Display adapters" driver entries (0000, 0001, ...)
    let mut gpus = Vec::new();
    const DISPLAY: &str =
        r"SYSTEM\CurrentControlSet\Control\Class\{4d36e968-e325-11ce-bfc1-08002be10318}";
    if let Ok(class) = LOCAL_MACHINE.open(DISPLAY) {
        if let Ok(names) = class.keys() {
            for name in names.filter(|n| n.chars().all(|c| c.is_ascii_digit())) {
                let Ok(k) = class.open(&name) else { continue };
                let Ok(desc) = k.get_string("DriverDesc") else {
                    continue;
                };
                // Skip Windows' fallback and remote-desktop adapters
                let lower = desc.to_lowercase();
                if lower.contains("basic display")
                    || lower.contains("basic render")
                    || lower.contains("remote")
                {
                    continue;
                }
                let bytes = k
                    .get_u64("HardwareInformation.qwMemorySize")
                    .or_else(|_| k.get_u32("HardwareInformation.MemorySize").map(u64::from))
                    .unwrap_or(0);
                let vram_gb = (bytes as f64 / 1024f64.powi(3) * 10.0).round() as f32 / 10.0;
                if !gpus.iter().any(|g: &Gpu| g.name == desc) {
                    gpus.push(Gpu {
                        name: desc,
                        vram_gb,
                    });
                }
            }
        }
    }

    // Windows version. Windows 11 still says "Windows 10" in ProductName, so use the build number.
    let nt = LOCAL_MACHINE
        .open(r"SOFTWARE\Microsoft\Windows NT\CurrentVersion")
        .ok();
    let get = |v: &str| {
        nt.as_ref()
            .and_then(|k| k.get_string(v).ok())
            .unwrap_or_default()
    };
    let build: u32 = get("CurrentBuild").parse().unwrap_or(0);
    let mut product = get("ProductName");
    if build >= 22000 {
        product = product.replace("Windows 10", "Windows 11");
    }
    let version = get("DisplayVersion");
    let os = [product, version]
        .into_iter()
        .filter(|s| !s.is_empty())
        .collect::<Vec<_>>()
        .join(" ");

    let sys = crate::launch::system_info();
    PcInfo {
        cpu,
        cpu_threads: sys.cpu_threads,
        gpus,
        ram_gb: sys.ram_gb,
        os,
    }
}

#[cfg(not(windows))]
fn read() -> PcInfo {
    PcInfo::default()
}

/// Read once per app run (hardware doesn't change while the app is open).
#[tauri::command]
pub fn pc_info() -> PcInfo {
    static CACHE: std::sync::OnceLock<PcInfo> = std::sync::OnceLock::new();
    CACHE.get_or_init(read).clone()
}

#[cfg(test)]
mod tests {
    #[test]
    fn real_machine() {
        println!(
            "{}",
            serde_json::to_string_pretty(&super::pc_info()).unwrap()
        );
    }
}
