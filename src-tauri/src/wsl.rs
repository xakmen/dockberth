//! Thin wrappers around `wsl.exe` for projects that live inside a WSL2 distro.
//!
//! Settled decision: when a project path is inside WSL2 (\\wsl$\... or
//! \\wsl.localhost\...), Docker commands are executed *inside* the distro via
//! `wsl.exe -d <distro> --cd <linux-path> -- docker compose ...` so that bind
//! mounts use fast native Linux paths. Projects on NTFS run `docker compose`
//! directly on the Windows side (see docker.rs).

// TODO: list_distros — parse `wsl.exe --list --verbose` (note: UTF-16 output)
//       and return running WSL2 distros so the UI can offer a distro picker.
// TODO: to_wsl_path — translate \\wsl.localhost\<distro>\<path> (and legacy
//       \\wsl$\) into /<path> plus the distro name.
// TODO: run_in_distro — execute an arbitrary command via
//       `wsl.exe -d <distro> --cd <path> -- <cmd>` and capture output.
