#[tauri::command]
fn delete_local_file(file_path: String) -> Result<bool, String> {
  let path = std::path::PathBuf::from(&file_path);
  if path.is_file() {
    std::fs::remove_file(&path).map_err(|e| format!("Failed to delete {}: {}", file_path, e))?;
    return Ok(true);
  }

  // If path was relative or just a file name, check current working directory
  if let Ok(cwd) = std::env::current_dir() {
    let candidate = cwd.join(&file_path);
    if candidate.is_file() {
      std::fs::remove_file(&candidate).map_err(|e| format!("Failed to delete {}: {}", candidate.display(), e))?;
      return Ok(true);
    }
  }

  Err(format!("File not found on disk: {}", file_path))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![delete_local_file])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
