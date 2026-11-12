import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

// Updates (Tauri's official updater). Kosmos asks GitHub once when it starts:
// https://github.com/0kosmos/kosmos/releases/latest/download/latest.json says which version is
// the newest and where its installer is. If it's newer than this one, the status bar shows
// "Update to x.y.z". Clicking it downloads the installer, checks its signature (only updates
// signed with your private key are accepted), installs it and restarts Kosmos.
// Your settings and sign-in are kept. Nothing checks in the background after startup.

type Status = "idle" | "checking" | "none" | "available" | "downloading" | "installing" | "error";

export const updater = $state({
  status: "idle" as Status,
  version: "", // the new version
  notes: "", // what's new (from the release)
  progress: 0, // 0-100 while downloading
  failed: "" as "" | "check" | "install", // what went wrong (when status is "error")
});

let pending: Update | null = null;

/** Look for a newer version. `manual` = you clicked: also say "up to date" / "couldn't check". */
export async function checkForUpdate(manual = false) {
  if (updater.status === "checking" || updater.status === "downloading" || updater.status === "installing") return;
  updater.status = "checking";
  try {
    pending = await check();
    if (pending) {
      updater.version = pending.version;
      updater.notes = pending.body ?? "";
      updater.status = "available";
    } else {
      updater.status = manual ? "none" : "idle";
    }
  } catch {
    // No internet, no release yet, or running as a test build: say nothing unless you asked
    updater.failed = "check";
    updater.status = manual ? "error" : "idle";
  }
  if (manual && (updater.status === "none" || updater.status === "error")) {
    setTimeout(() => {
      if (updater.status === "none" || updater.status === "error") updater.status = "idle";
    }, 4000);
  }
}

/** Download, install and restart */
export async function installUpdate() {
  if (!pending || updater.status === "downloading" || updater.status === "installing") return;
  updater.status = "downloading";
  updater.progress = 0;
  let total = 0;
  let got = 0;
  try {
    await pending.downloadAndInstall((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      else if (e.event === "Progress") {
        got += e.data.chunkLength;
        if (total) updater.progress = Math.min(100, Math.round((got / total) * 100));
      } else if (e.event === "Finished") updater.status = "installing";
    });
    await relaunch();
  } catch {
    updater.failed = "install";
    updater.status = "error";
  }
}
