use std::path::{Path, PathBuf};

fn get_storage_dir() -> Result<PathBuf, String> {
  let base_dir = if let Ok(exe) = std::env::current_exe() {
    if let Some(parent) = exe.parent() {
      parent.to_path_buf()
    } else {
      std::env::current_dir().map_err(|e| e.to_string())?
    }
  } else {
    std::env::current_dir().map_err(|e| e.to_string())?
  };

  let storage_dir = base_dir.join("storage");
  if !storage_dir.exists() {
    std::fs::create_dir_all(&storage_dir)
      .map_err(|e| format!("Failed to create storage dir: {}", e))?;
  }
  Ok(storage_dir)
}

#[tauri::command]
fn save_to_storage(file_name: String, data: Vec<u8>) -> Result<String, String> {
  let storage_dir = get_storage_dir()?;
  let clean_name = Path::new(&file_name)
    .file_name()
    .ok_or_else(|| "Invalid file name".to_string())?;
  let target_path = storage_dir.join(clean_name);

  std::fs::write(&target_path, data)
    .map_err(|e| format!("Failed to write file to storage: {}", e))?;

  Ok(target_path.to_string_lossy().to_string())
}

#[tauri::command]
fn read_from_storage(file_name_or_path: String) -> Result<Vec<u8>, String> {
  let storage_dir = get_storage_dir()?;
  let path = if Path::new(&file_name_or_path).is_absolute() {
    PathBuf::from(&file_name_or_path)
  } else {
    storage_dir.join(&file_name_or_path)
  };

  if !path.exists() || !path.is_file() {
    return Err(format!("Storage file does not exist: {}", path.display()));
  }

  std::fs::read(&path).map_err(|e| format!("Failed to read storage file: {}", e))
}

#[tauri::command]
fn delete_from_storage(file_name_or_path: String) -> Result<bool, String> {
  let storage_dir = get_storage_dir()?;
  let path = if Path::new(&file_name_or_path).is_absolute() {
    PathBuf::from(&file_name_or_path)
  } else {
    let clean_name = Path::new(&file_name_or_path)
      .file_name()
      .unwrap_or_else(|| std::ffi::OsStr::new(&file_name_or_path));
    storage_dir.join(clean_name)
  };

  if path.is_file() {
    std::fs::remove_file(&path).map_err(|e| format!("Failed to delete storage file: {}", e))?;
    return Ok(true);
  }
  Ok(false)
}

#[tauri::command]
fn list_storage_files() -> Result<Vec<String>, String> {
  let storage_dir = get_storage_dir()?;
  let mut files = Vec::new();

  if let Ok(entries) = std::fs::read_dir(storage_dir) {
    for entry in entries.flatten() {
      let path = entry.path();
      if path.is_file() {
        if let Some(ext) = path.extension() {
          let ext_str = ext.to_string_lossy().to_lowercase();
          if ext_str == "glb" || ext_str == "gltf" || ext_str == "fbx" {
            if let Some(file_name) = path.file_name() {
              files.push(file_name.to_string_lossy().to_string());
            }
          }
        }
      }
    }
  }

  Ok(files)
}

#[tauri::command]
fn read_storage_manifest() -> Result<String, String> {
  let storage_dir = get_storage_dir()?;
  let manifest_path = storage_dir.join("manifest.json");
  if !manifest_path.exists() || !manifest_path.is_file() {
    return Ok("{}".to_string());
  }
  std::fs::read_to_string(&manifest_path).map_err(|e| format!("Failed to read manifest: {}", e))
}

#[tauri::command]
fn save_storage_manifest(manifest_json: String) -> Result<bool, String> {
  let storage_dir = get_storage_dir()?;
  let manifest_path = storage_dir.join("manifest.json");
  std::fs::write(&manifest_path, manifest_json).map_err(|e| format!("Failed to write manifest: {}", e))?;
  Ok(true)
}

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
    .invoke_handler(tauri::generate_handler![
      delete_local_file,
      save_to_storage,
      read_from_storage,
      delete_from_storage,
      list_storage_files,
      read_storage_manifest,
      save_storage_manifest
    ])
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
