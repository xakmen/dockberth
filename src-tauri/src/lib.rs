mod diagnostics;
mod docker;
mod domain;
/// pub: the hosts renderer is exercised by examples/hosts_render.rs.
pub mod hosts;
mod logs;
mod preset;
mod projects;
mod proxy;
mod registry;
mod scaffold;
mod settings;
mod telemetry;
mod template;
mod wsl;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Crash reporting is opt-in and disabled without a build-time DSN;
    // the guard must outlive the event loop (run() never returns).
    let _sentry_guard = telemetry::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(logs::LogSessions::default())
        .invoke_handler(tauri::generate_handler![
            docker::docker_version,
            docker::docker_start,
            proxy::proxy_ensure,
            hosts::hosts_ensure,
            hosts::hosts_repair,
            projects::detect_project,
            projects::project_list,
            projects::project_create,
            projects::project_delete,
            projects::project_start,
            projects::project_stop,
            projects::project_restart,
            projects::projects_status,
            projects::apply_domain_suffix,
            projects::project_services,
            projects::project_open_folder,
            projects::project_open_editor,
            projects::project_open_shell,
            logs::logs_start,
            logs::logs_stop,
            preset::preset_list,
            scaffold::scaffold_project,
            scaffold::scaffold_cancel,
            wsl::wsl_list_distros,
            wsl::wsl_check_docker,
            settings::settings_get,
            settings::settings_set,
            telemetry::debug_panic,
            diagnostics::diagnostics_collect,
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
