// Self-updating from the release feed (latest.json) of the repo named in Settings. The webview
// turns the repo into a feed URL (src/lib/updates.ts); the updater only installs builds signed
// with the private key matching `plugins.updater.pubkey` in tauri.conf.json, so pointing it at
// someone else's repo can't install their builds.
use std::sync::Mutex;

use serde::Serialize;
use tauri::ipc::Channel;
use tauri::{AppHandle, State, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

use crate::commands::Error;

/// The update found by the last check, kept so "install" installs exactly what was shown.
#[derive(Default)]
pub struct Pending(Mutex<Option<Update>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    version: String,
    current_version: String,
    notes: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(tag = "event", rename_all = "camelCase")]
pub enum Progress {
    Chunk { len: usize, total: Option<u64> },
    Installing,
}

fn msg(e: impl std::fmt::Display) -> Error {
    Error::Msg(e.to_string())
}

#[tauri::command]
pub async fn update_check(app: AppHandle, pending: State<'_, Pending>, endpoint: String) -> Result<Option<UpdateInfo>, Error> {
    let url = Url::parse(&endpoint).map_err(msg)?;
    if url.scheme() != "https" {
        return Err(Error::Msg("The update address has to start with https://".into()));
    }
    let update = app.updater_builder().endpoints(vec![url]).map_err(msg)?.build().map_err(msg)?.check().await.map_err(msg)?;
    let info = update.as_ref().map(|u| UpdateInfo {
        version: u.version.clone(),
        current_version: u.current_version.clone(),
        notes: u.body.clone().filter(|b| !b.trim().is_empty()),
    });
    *pending.0.lock().unwrap() = update;
    Ok(info)
}

/// Downloads, verifies and installs the pending update, then restarts into it. On Windows the
/// installer closes the app itself and starts it again when it's done.
#[tauri::command]
pub async fn update_install(app: AppHandle, pending: State<'_, Pending>, on_progress: Channel<Progress>) -> Result<(), Error> {
    let update = pending.0.lock().unwrap().take().ok_or_else(|| Error::Msg("Check for updates first.".into()))?;
    update
        .download_and_install(
            |len, total| {
                let _ = on_progress.send(Progress::Chunk { len, total });
            },
            || {
                let _ = on_progress.send(Progress::Installing);
            },
        )
        .await
        .map_err(msg)?;
    app.restart()
}
