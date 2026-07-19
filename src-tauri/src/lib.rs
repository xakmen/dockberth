mod docker;
mod hosts;
mod logs;
mod preset;
mod projects;
mod proxy;
mod registry;
mod template;
mod wsl;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(logs::LogSessions::default())
        .invoke_handler(tauri::generate_handler![
            docker::docker_version,
            proxy::proxy_ensure,
            hosts::hosts_ensure,
            projects::detect_project,
            projects::project_list,
            projects::project_create,
            projects::project_delete,
            projects::project_start,
            projects::project_stop,
            projects::project_restart,
            projects::projects_status,
            projects::project_services,
            projects::project_open_folder,
            projects::project_open_editor,
            projects::project_open_shell,
            logs::logs_start,
            logs::logs_stop,
            wsl::wsl_list_distros,
            wsl::wsl_check_docker,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            // Log followers are external processes — Windows does not kill
            // child trees on exit, so clean them up explicitly.
            if let tauri::RunEvent::Exit = event {
                logs::kill_all(&app_handle.state::<logs::LogSessions>());
            }
        });
}
