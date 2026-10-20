mod commands;
mod updates;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(updates::Pending::default())
        .setup(|app| {
            if let Err(e) = commands::cleanup(app.handle()) {
                eprintln!("could not clean up temp files: {e}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::store_read,
            commands::store_write,
            commands::store_delete,
            commands::store_list_attachments,
            commands::attachments_dir,
            commands::read_scan_file,
            commands::read_import_file,
            commands::export_file,
            updates::update_check,
            updates::update_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ihatebills");
}
