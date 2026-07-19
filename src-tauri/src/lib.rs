mod docker;
mod hosts;
mod preset;
mod projects;
mod proxy;
mod registry;
mod template;
mod wsl;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            docker::docker_version,
            proxy::proxy_ensure,
            hosts::hosts_ensure,
            projects::detect_project,
            projects::project_list,
            projects::project_create,
            projects::project_start,
            projects::project_stop,
            projects::project_restart,
            projects::projects_status,
            projects::project_services,
            projects::project_open_folder,
            projects::project_open_editor,
            wsl::wsl_list_distros,
            wsl::wsl_check_docker,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
