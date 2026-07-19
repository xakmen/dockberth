//! Windows hosts-file management for `<project>.test` domains.
//!
//! Settled decision: the main app process never touches
//! C:\Windows\System32\drivers\etc\hosts itself — writing it requires
//! administrator rights. Instead, a separate small elevated helper binary is
//! launched on demand (UAC prompt) and performs the edit. Dockberth-managed
//! entries live between `# dockberth:begin` / `# dockberth:end` markers so the
//! helper can rewrite its own block without disturbing user entries.

// TODO: read_hosts — read the hosts file (read access needs no elevation) and
//       return the entries inside the dockberth marker block.
// TODO: sync_hosts — compute the desired set of `127.0.0.1 <name>.test` lines
//       and, if it differs from the current block, spawn the elevated helper
//       (separate binary, to be added under src-tauri/bin/) with the new block
//       as an argument.
// TODO: elevated helper binary itself — a tiny Rust exe with a UAC manifest
//       that only knows how to replace the marker block, nothing else.
