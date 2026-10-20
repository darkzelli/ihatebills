// A small byte store in the app data dir. Encryption happens in the webview (src/lib/crypto.ts),
// so Rust only ever sees opaque bytes and never the password or keys. Keys are:
//   bills.json   the database when encryption is off
//   bills.enc    the database when encryption is on
//   vault.json   the wrapped data key (only exists while encryption is on)
//   attachments/<uuid>.<ext>   scans, plain or encrypted
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

use serde::Serialize;
use tauri::ipc::{InvokeBody, Request, Response};
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

/// Matched by `NOT_FOUND` in src/lib/tauri.ts.
const NOT_FOUND: &str = "not found";
const TOP_LEVEL: &[&str] = &["bills.json", "bills.enc", "vault.json"];

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

/// Plain file names only: no separators, no `..`, no hidden or temp files.
fn plain_name(name: &str) -> bool {
    !name.is_empty()
        && !name.starts_with('.')
        && !name.ends_with(".tmp")
        && name.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_'))
}

fn resolve(app: &AppHandle, key: &str) -> Result<PathBuf> {
    if TOP_LEVEL.contains(&key) {
        return Ok(data_dir(app)?.join(key));
    }
    match key.strip_prefix("attachments/") {
        Some(name) if plain_name(name) => Ok(att_dir(app)?.join(name)),
        _ => Err(Error::Msg(format!("bad storage key: {key}"))),
    }
}

/// Write to a temp file, fsync, then rename, so a crash mid-write never leaves a truncated file.
fn write_atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("file");
    let tmp = path.with_file_name(format!(".{name}.tmp"));
    let mut f = fs::File::create(&tmp)?;
    f.write_all(bytes)?;
    f.sync_all()?;
    drop(f);
    fs::rename(tmp, path)?;
    Ok(())
}

/// Raw bytes when the webview sent a Uint8Array; a JSON number array on the fallback IPC.
fn body_bytes(request: &Request<'_>) -> Result<Vec<u8>> {
    match request.body() {
        InvokeBody::Raw(b) => Ok(b.clone()),
        InvokeBody::Json(v) => serde_json::from_value(v.clone()).map_err(|e| Error::Msg(e.to_string())),
    }
}

fn header(request: &Request<'_>, name: &str) -> Result<String> {
    let v = request
        .headers()
        .get(name)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| Error::Msg(format!("missing {name}")))?;
    percent_encoding::percent_decode_str(v)
        .decode_utf8()
        .map(|s| s.into_owned())
        .map_err(|e| Error::Msg(e.to_string()))
}

/// Removes temp files left behind by a crash. Called once at startup, before any writes.
pub fn cleanup(app: &AppHandle) -> Result<()> {
    for dir in [data_dir(app)?, att_dir(app)?] {
        for entry in fs::read_dir(dir)? {
            let entry = entry?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if name.starts_with('.') && name.ends_with(".tmp") {
                let _ = fs::remove_file(entry.path());
            }
        }
    }
    Ok(())
}

#[tauri::command]
pub fn store_read(app: AppHandle, key: String) -> Result<Response> {
    let path = resolve(&app, &key)?;
    if !path.exists() {
        return Err(Error::Msg(NOT_FOUND.into()));
    }
    Ok(Response::new(fs::read(path)?))
}

/// Body: the bytes. Header `key`: the storage key.
#[tauri::command]
pub fn store_write(app: AppHandle, request: Request<'_>) -> Result<()> {
    let path = resolve(&app, &header(&request, "key")?)?;
    write_atomic(&path, &body_bytes(&request)?)
}

#[tauri::command]
pub fn store_delete(app: AppHandle, key: String) -> Result<()> {
    let path = resolve(&app, &key)?;
    if path.exists() {
        fs::remove_file(path)?;
    }
    Ok(())
}

/// File names in the attachments dir.
#[tauri::command]
pub fn store_list_attachments(app: AppHandle) -> Result<Vec<String>> {
    let mut out = Vec::new();
    for entry in fs::read_dir(att_dir(&app)?)? {
        let entry = entry?;
        let name = entry.file_name().to_string_lossy().into_owned();
        if entry.file_type()?.is_file() && plain_name(&name) {
            out.push(name);
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn attachments_dir(app: AppHandle) -> Result<String> {
    Ok(att_dir(&app)?.to_string_lossy().into_owned())
}

fn ext_of(path: &Path) -> String {
    path.extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase())
        .unwrap_or_default()
}

fn read_picked(path: &str, exts: &[&str], max: u64, what: &str) -> Result<Response> {
    let src = Path::new(path);
    let ext = ext_of(src);
    if !exts.contains(&ext.as_str()) {
        return Err(Error::Msg(format!("Can't {what} .{ext} files")));
    }
    if fs::metadata(src)?.len() > max {
        return Err(Error::Msg(format!("That file is too big to {what} (over {} MB)", max / 1024 / 1024)));
    }
    Ok(Response::new(fs::read(src)?))
}

const SCAN_EXTS: &[&str] = &["pdf", "png", "jpg", "jpeg"];
const SCAN_MAX: u64 = 256 * 1024 * 1024;

/// Raw bytes of a scan the user picked or dropped; the webview encrypts and stores it.
#[tauri::command]
pub fn read_scan_file(path: String) -> Result<Response> {
    read_picked(&path, SCAN_EXTS, SCAN_MAX, "attach")
}

const IMPORT_EXTS: &[&str] = &["csv", "tsv", "tab", "txt", "xlsx", "xlsm", "xlsb", "xls", "ods", "numbers", "json", "ndjson"];
const IMPORT_MAX: u64 = 64 * 1024 * 1024;

/// Raw bytes of a spreadsheet or claims export the user picked; parsing happens in the webview.
#[tauri::command]
pub fn read_import_file(path: String) -> Result<Response> {
    read_picked(&path, IMPORT_EXTS, IMPORT_MAX, "import")
}

/// Saves a (decrypted) copy of a scan wherever the user picked in the save dialog.
/// Body: the bytes. Header `dest`: the percent-encoded path.
#[tauri::command]
pub fn export_file(request: Request<'_>) -> Result<()> {
    let dest = header(&request, "dest")?;
    fs::write(dest, body_bytes(&request)?)?;
    Ok(())
}
