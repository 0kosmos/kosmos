//! Discord activity ("Rich Presence"): Discord shows that you're using Kosmos and what you're
//! looking at, like "Browsing the library", under your name and in the Activity tab.
//! Kosmos talks to the Discord app on this PC through Discord's official local connection
//! (a named pipe); nothing goes over the internet from here, and Discord itself isn't touched.
//!
//! A background thread keeps the connection. The app sends it what to show; the thread sleeps
//! until then. If Discord isn't open, it tries again once a minute (only while there's something
//! to show), so it uses no CPU in between.

use std::sync::mpsc::{RecvTimeoutError, Sender, channel};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

/// The "Kosmos" application on Discord's developer site (its Application ID; not a secret).
/// Discord shows this application's name ("Kosmos") and its picture called "kosmos".
const DISCORD_APP_ID: &str = "1570412624196411422";

enum Msg {
    Show { details: String, state: String },
    Hide,
}

static SENDER: OnceLock<Mutex<Sender<Msg>>> = OnceLock::new();

fn sender() -> &'static Mutex<Sender<Msg>> {
    SENDER.get_or_init(|| {
        let (tx, rx) = channel::<Msg>();
        std::thread::spawn(move || run(rx));
        Mutex::new(tx)
    })
}

/// What Discord should show. `on = false` removes Kosmos's activity from Discord.
#[tauri::command]
pub fn discord_activity(details: String, state: String, on: bool) {
    let msg = if on {
        Msg::Show {
            details: details.chars().take(120).collect(),
            state: state.chars().take(120).collect(),
        }
    } else {
        Msg::Hide
    };
    if let Ok(tx) = sender().lock() {
        let _ = tx.send(msg);
    }
}

fn run(rx: std::sync::mpsc::Receiver<Msg>) {
    use discord_rich_presence::{DiscordIpc, DiscordIpcClient, activity};

    // "for 12:34" in Discord counts from when Kosmos started
    let started = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);
    let mut client: Option<DiscordIpcClient> = None;
    let mut wanted: Option<(String, String)> = None; // what to show (None = nothing)
    let mut shown = false; // is something showing in Discord right now?

    loop {
        // Wait for the app; while something should show but Discord isn't connected, wake up
        // once a minute to try again
        let wait = if wanted.is_some() && client.is_none() {
            Duration::from_secs(60)
        } else {
            Duration::from_secs(3600)
        };
        match rx.recv_timeout(wait) {
            Ok(Msg::Show { details, state }) => wanted = Some((details, state)),
            Ok(Msg::Hide) => wanted = None,
            Err(RecvTimeoutError::Timeout) => {}
            Err(RecvTimeoutError::Disconnected) => return,
        }
        // Several pages in a row (clicking around): only send the last one
        std::thread::sleep(Duration::from_millis(800));
        while let Ok(m) = rx.try_recv() {
            match m {
                Msg::Show { details, state } => wanted = Some((details, state)),
                Msg::Hide => wanted = None,
            }
        }

        match &wanted {
            Some((details, state)) => {
                if client.is_none() {
                    let mut c = DiscordIpcClient::new(DISCORD_APP_ID);
                    if c.connect().is_ok() {
                        client = Some(c);
                    }
                }
                if let Some(c) = client.as_mut() {
                    let mut a = activity::Activity::new()
                        .details(details.as_str())
                        .assets(
                            activity::Assets::new()
                                .large_image("kosmos")
                                .large_text("Kosmos"),
                        )
                        .timestamps(activity::Timestamps::new().start(started));
                    if !state.is_empty() {
                        a = a.state(state.as_str());
                    }
                    if c.set_activity(a).is_ok() {
                        shown = true;
                    } else {
                        // Discord was closed: forget the connection, try again later
                        let _ = c.close();
                        client = None;
                        shown = false;
                    }
                }
            }
            None => {
                if let Some(mut c) = client.take() {
                    if shown {
                        let _ = c.clear_activity();
                    }
                    let _ = c.close();
                }
                shown = false;
            }
        }
    }
}
