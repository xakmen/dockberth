//! Project domain construction and domain-suffix validation.
//!
//! The suffix is a global app setting (settings.json, default "test"),
//! stored WITHOUT a leading dot. Every place that builds or parses a
//! `<name>.<suffix>` domain goes through this module — no inline
//! `format!("{}.test", …)` anywhere else.

/// Historical default suffix. Hosts-file stray migration keeps accepting
/// it after the user switches to a custom suffix (legacy lines written by
/// older Dockberth versions all used `.test`).
pub const DEFAULT_SUFFIX: &str = "test";

/// Full local domain for a project: `<name>.<suffix>`.
pub fn project_domain(name: &str, suffix: &str) -> String {
    format!("{name}.{suffix}")
}

/// `true` for suffixes safe as the tail of a hosts-file domain: one or
/// more dot-separated labels, each `[a-z0-9]([a-z0-9-]*[a-z0-9])?` and at
/// most 63 chars — so both `test` and `dev.mycompany` are valid. No
/// leading/trailing dot or hyphen, no uppercase.
pub fn is_valid_domain_suffix(suffix: &str) -> bool {
    !suffix.is_empty()
        && suffix.split('.').all(|label| {
            !label.is_empty()
                && label.len() <= 63
                && label
                    .chars()
                    .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
                && !label.starts_with('-')
                && !label.ends_with('-')
        })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn builds_project_domains() {
        assert_eq!(project_domain("shop", "test"), "shop.test");
        assert_eq!(project_domain("shop", "dev.mycompany"), "shop.dev.mycompany");
        assert_eq!(project_domain("my-app", "localhost"), "my-app.localhost");
    }

    #[test]
    fn accepts_valid_suffixes() {
        for s in ["test", "localhost", "dev.mycompany", "a", "a1", "x-y.z-9"] {
            assert!(is_valid_domain_suffix(s), "should accept '{s}'");
        }
    }

    #[test]
    fn rejects_invalid_suffixes() {
        for s in [
            "", ".", ".test", "test.", "-test", "test-", "a..b", "Test",
            "te st", "te_st", "dev.-x", "dev.x-",
        ] {
            assert!(!is_valid_domain_suffix(s), "should reject '{s}'");
        }
        // 64-char label exceeds the per-label limit; 63 is fine.
        assert!(!is_valid_domain_suffix(&"a".repeat(64)));
        assert!(is_valid_domain_suffix(&"a".repeat(63)));
    }
}
