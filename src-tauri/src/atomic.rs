//! Atomic file writes: write to a sibling temp file, flush it to disk, then
//! rename it over the target. A crash or power loss mid-write can then never
//! leave a truncated `projects.json` / `settings.json` / `config.json` — a
//! half-written registry makes every project command fail with "registry is
//! corrupted" and there is no recovery path.
//!
//! `fs::rename` replaces the destination on Windows (MoveFileEx with
//! MOVEFILE_REPLACE_EXISTING) and is atomic on a single volume; the temp
//! file is always a sibling of the target, so the rename never crosses
//! volumes. The temp name carries the process id so two Dockberth processes
//! never fight over the same scratch file.

use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};

fn temp_path(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(format!(".tmp.{}", std::process::id()));
    path.with_file_name(name)
}

/// Write `contents` to `path` atomically. On any error the temp file is
/// cleaned up and the original target is left untouched.
pub fn write(path: &Path, contents: impl AsRef<[u8]>) -> std::io::Result<()> {
    let tmp = temp_path(path);
    let mut file = fs::File::create(&tmp)?;
    if let Err(e) = file.write_all(contents.as_ref()).and_then(|()| file.sync_all()) {
        drop(file);
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    drop(file);
    if let Err(e) = fs::rename(&tmp, path) {
        let _ = fs::remove_file(&tmp);
        return Err(e);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn writes_and_overwrites_without_leaving_temp_files() {
        let dir = std::env::temp_dir().join(format!("dockberth-atomic-{}", std::process::id()));
        let _ = fs::create_dir_all(&dir);
        let target = dir.join("registry.json");

        write(&target, b"first").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "first");

        // Overwriting an existing file succeeds (Windows rename replaces).
        write(&target, b"second, longer contents").unwrap();
        assert_eq!(fs::read_to_string(&target).unwrap(), "second, longer contents");

        // No scratch files are left behind next to the target.
        let leftovers: Vec<_> = fs::read_dir(&dir)
            .unwrap()
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().contains(".tmp."))
            .collect();
        assert!(leftovers.is_empty(), "temp files left behind: {leftovers:?}");

        let _ = fs::remove_dir_all(&dir);
    }
}
