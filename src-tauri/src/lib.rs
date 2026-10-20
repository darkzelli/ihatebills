mod commands;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::load_db,
            commands::save_db,
            commands::attachments_dir,
            commands::import_attachment,
            commands::delete_attachment,
            commands::export_attachment,
            commands::read_import_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running ihatebills");
}
