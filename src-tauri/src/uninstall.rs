//! "Uninstall Kosmos" in Settings → System.
//! Runs Kosmos's own uninstaller (the same one as in Windows' "Apps" settings), and if you ticked
//! "Also delete all my Kosmos data", removes Kosmos's data folders afterwards:
//!   - AppData\Local\com.wraden.kosmos    settings, sign-in, favorites, the page engine's cache
//!   - AppData\Roaming\com.wraden.kosmos  pictures you picked for your own games, app icons
//! Kosmos has to be closed for its files to be removed, so a tiny script does the work a moment
//! after Kosmos closes (and deletes itself at the end). Nothing outside these folders is touched.

use tauri::Manager;

const IDENTIFIER: &str = "com.wraden.kosmos";

/// Is this the installed Kosmos (with an uninstaller next to it)? The test version isn't.
#[tauri::command]
pub fn can_uninstall() -> bool {
    uninstaller().is_some()
}

fn uninstaller() -> Option<(std::path::PathBuf, std::path::PathBuf)> {
    let exe = std::env::current_exe().ok()?;
    let dir = exe.parent()?.to_path_buf();
    let un = dir.join("uninstall.exe");
    un.is_file().then_some((exe, dir))
}

#[tauri::command]
pub fn uninstall_kosmos(app: tauri::AppHandle, delete_data: bool) -> Result<(), String> {
    let Some((exe, dir)) = uninstaller() else {
        return Err("Uninstalling only works in the installed Kosmos, not in the test version.".into());
    };
    // Only Kosmos's own data folders (their name is Kosmos's app ID), never anything else
    let mut data = Vec::new();
    if delete_data {
        for d in [app.path().app_data_dir(), app.path().app_local_data_dir()].into_iter().flatten() {
            if d.file_name().and_then(|n| n.to_str()) == Some(IDENTIFIER) && !data.contains(&d) {
                data.push(d);
            }
        }
    }

    let q = |p: &std::path::Path| format!("\"{}\"", p.display());
    let mut script = String::from("@echo off\r\n");
    script += "rem Kosmos uninstall helper (removes itself at the end)\r\n";
    script += "ping -n 3 127.0.0.1 >nul\r\n"; // give Kosmos a moment to close
    // _?= makes the uninstaller run in place and wait, so we know whether it finished
    script += &format!("{} _?={}\r\n", q(&dir.join("uninstall.exe")), dir.display());
    script += &format!("if exist {} goto end\r\n", q(&exe)); // cancelled: keep everything
    for d in &data {
        script += &format!("rmdir /s /q {}\r\n", q(d));
    }
    script += &format!("del /f /q {}\r\n", q(&dir.join("uninstall.exe")));
    script += &format!("rmdir {}\r\n", q(&dir));
    script += ":end\r\n(goto) 2>nul & del \"%~f0\"\r\n";

    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let path = std::env::temp_dir().join(format!("kosmos-uninstall-{stamp}.cmd"));
    std::fs::write(&path, script).map_err(|e| e.to_string())?;

    let mut cmd = std::process::Command::new("cmd");
    cmd.arg("/c").arg(&path);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // no black console window
    }
    cmd.spawn().map_err(|e| e.to_string())?;
    app.exit(0);
    Ok(())
}
