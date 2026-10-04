/// The desktop app is only a window around the web game: everything the
/// player sees runs in the bundled web page, with no extra native code.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running the CyberSec Game window");
}
