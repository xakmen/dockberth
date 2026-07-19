//! Dev utility: run the REAL hosts renderer against the machine's hosts
//! file and print the result (no elevation, no writes). Used to verify
//! managed-block behavior end-to-end before an elevated apply.
//!
//!   cargo run --example hosts_render -- app.test other.test > out.txt
//!
//! Registered names (for stray migration) are derived from the desired
//! domains passed as arguments.

fn main() {
    let desired: Vec<String> = std::env::args().skip(1).collect();
    let registered: Vec<String> = desired
        .iter()
        .filter_map(|d| d.strip_suffix(".test").map(String::from))
        .collect();
    let raw = std::fs::read_to_string(r"C:\Windows\System32\drivers\etc\hosts")
        .unwrap_or_default();
    match dockberth_lib::hosts::render_hosts(&raw, &desired, &registered) {
        Ok(out) => {
            eprintln!("changed: {}", out.changed);
            print!("{}", out.content);
        }
        Err(e) => {
            eprintln!("ABORT: {e}");
            std::process::exit(1);
        }
    }
}
