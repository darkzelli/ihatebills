// The whole database is one JSON document (bills.json) in the app data dir;
// scans are copied into <app data>/attachments/<uuid>.<ext>.
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::{AppHandle, Manager};

#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Io(#[from] std::io::Error),
    #[error(transparent)]
    Tauri(#[from] tauri::Error),
    #[error("{0}")]
    Msg(String),
}

impl Serialize for Error {
    fn serialize<S: serde::Serializer>(&self, s: S) -> std::result::Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

type Result<T> = std::result::Result<T, Error>;

fn data_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = app.path().app_data_dir()?;
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

fn att_dir(app: &AppHandle) -> Result<PathBuf> {
    let dir = data_dir(app)?.join("attachments");
    fs::create_dir_all(&dir)?;
    Ok(dir)
}

/// Returns the saved database as a JSON string, or None on first launch.
#[tauri::command]
pub fn load_db(app: AppHandle) -> Result<Option<String>> {
    let path = data_dir(&app)?.join("bills.json");
    if !path.exists() {
        return Ok(None);
    }
    Ok(Some(fs::read_to_string(path)?))
}

/// Writes to a temp file then renames, so a crash mid-write never truncates the database.
#[tauri::command]
pub fn save_db(app: AppHandle, json: String) -> Result<()> {
    let dir = data_dir(&app)?;
    let tmp = dir.join("bills.json.tmp");
    fs::write(&tmp, json)?;
    fs::rename(tmp, dir.join("bills.json"))?;
    Ok(())
}

#[tauri::command]
pub fn attachments_dir(app: AppHandle) -> Result<String> {
    Ok(att_dir(&app)?.to_string_lossy().into_owned())
}

#[derive(Serialize)]
pub struct Imported {
    id: String,
    name: String,
    mime: String,
    file: String,
}

fn mime_for(ext: &str) -> Option<&'static str> {
    match ext {
        "pdf" => Some("application/pdf"),
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        _ => None,
    }
}

#[tauri::command]
pub fn import_attachment(app: AppHandle, path: String) -> Result<Imported> {
    let src = Path::new(&path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    let mime = mime_for(&ext).ok_or_else(|| Error::Msg(format!("Only PDF, PNG and JPEG files can be attached (got .{ext})")))?;
    let id = uuid::Uuid::new_v4().to_string();
    let file = format!("{id}.{ext}");
    fs::copy(src, att_dir(&app)?.join(&file))?;
    let name = src.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_else(|| file.clone());
    Ok(Imported { id, name, mime: mime.into(), file })
}

const IMPORT_EXTS: &[&str] = &["csv", "tsv", "tab", "txt", "xlsx", "xlsm", "xlsb", "xls", "ods", "numbers", "json", "ndjson"];
const IMPORT_MAX: u64 = 64 * 1024 * 1024;

/// Raw bytes of a spreadsheet or claims export the user picked; parsing happens in the webview.
#[tauri::command]
pub fn read_import_file(path: String) -> Result<tauri::ipc::Response> {
    let src = Path::new(&path);
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default();
    if !IMPORT_EXTS.contains(&ext.as_str()) {
        return Err(Error::Msg(format!("Can't import .{ext} files")));
    }
    if fs::metadata(src)?.len() > IMPORT_MAX {
        return Err(Error::Msg("That file is too big to import (over 64 MB)".into()));
    }
    Ok(tauri::ipc::Response::new(fs::read(src)?))
}

/// Only plain file names inside the attachments dir.
fn att_file(app: &AppHandle, file: &str) -> Result<PathBuf> {
    if file.contains('/') || file.contains('\\') || file.contains("..") {
        return Err(Error::Msg("bad attachment name".into()));
    }
    Ok(att_dir(app)?.join(file))
}

#[tauri::command]
pub fn delete_attachment(app: AppHandle, file: String) -> Result<()> {
    let p = att_file(&app, &file)?;
    if p.exists() {
        fs::remove_file(p)?;
    }
    Ok(())
}

/// Saves a copy of a stored scan wherever the user picked in the save dialog.
#[tauri::command]
pub fn export_attachment(app: AppHandle, file: String, dest: String) -> Result<()> {
    fs::copy(att_file(&app, &file)?, dest)?;
    Ok(())
}
