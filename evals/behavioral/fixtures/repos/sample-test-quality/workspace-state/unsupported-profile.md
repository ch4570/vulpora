# Unsupported profile boundary

The `UnsupportedProfileSpec.kt` file is intentionally not a supported automatic
refactoring target. A quality review may report evidence and recommendations, but
an automatic edit must end as `AUDIT_ONLY` or `BLOCKED: UNSUPPORTED_PROFILE`.

The baseline manifest distinguishes staged and unstaged user changes through its
separate patch hashes. Per-entry state deliberately uses only the workflow schema's
native values: `present`, `renamed`, `deleted`, or `mode_changed`.
