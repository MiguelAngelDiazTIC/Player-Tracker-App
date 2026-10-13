use keyring::{Entry, Error as KeyringError};

/// Los únicos secretos que la app guarda en el almacén de credenciales.
const SECRET_NAMES: [&str; 1] = ["henrikdev-api-key"];

/// Entrada del almacén de credenciales del sistema. El servicio es el
/// identificador de la app, así que cada edición tiene sus propios secretos.
fn secret_entry(app: &tauri::AppHandle, name: &str) -> Result<Entry, String> {
    if !SECRET_NAMES.contains(&name) {
        return Err(format!("Secreto desconocido: {name}"));
    }
    Entry::new(&app.config().identifier, name).map_err(|error| error.to_string())
}

/// Lee un secreto; `None` si no se ha guardado.
#[tauri::command]
fn secret_read(app: tauri::AppHandle, name: String) -> Result<Option<String>, String> {
    match secret_entry(&app, &name)?.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(KeyringError::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

/// Guarda un secreto o, sin valor, lo borra.
#[tauri::command]
fn secret_write(app: tauri::AppHandle, name: String, value: Option<String>) -> Result<(), String> {
    let entry = secret_entry(&app, &name)?;
    let result = match value {
        Some(value) => entry.set_password(&value),
        None => match entry.delete_credential() {
            Err(KeyringError::NoEntry) => Ok(()),
            other => other,
        },
    };
    result.map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_sql::Builder::default().build())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![secret_read, secret_write])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
