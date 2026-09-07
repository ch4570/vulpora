# Trend and comparison mode contract

Read only after selecting `trend` or `compare`. These are the canonical definitions of REN-18 through
REN-21. The common schema, settled-input, masking, XSS, resource, and output gates remain in
[SKILL.md](../SKILL.md) and apply to every mode.

**REN-18 (Trend mode parameters) — MUST.** `trend` mode:

- Default `N = 10`. User MAY override (`trend N=20`).
- Selection is the latest `N` settled runs by `generatedAt` ascending (oldest first in the chart).
- If `< N` settled runs exist, render with what is available; do not pad with placeholders. The output filename embeds the actual count (`trend-N{N_actual}-{YYYY-MM-DD}.html`).

**REN-19 (Compare mode canonical naming) — MUST.** `compare` mode output filename uses the two run IDs sorted lexicographically before joining: `compare-{min}-vs-{max}.html`. This makes the compare of (A, B) and (B, A) collide into the same artifact deterministically.

**REN-20 (Trend / compare cross-catalog handling) — MUST.** When the runs being compared or trended use different `catalog.sha` values:

- Render a top banner: `Catalog SHA differs across runs: {sha1} ... {shaN}` so the reader knows.
- Match scenarios across runs by `id`. Scenarios present in some runs but not others render as `—` cells (not `FAIL`).
- The "flaky scenarios" table (`REN-21`) considers only scenarios present in **every** run in the selection — comparing presence-vs-absence is a catalog change, not a test flake.

**REN-21 (Flaky definition) — MUST.** In `trend` mode, a scenario is "flaky" iff:
- It is present in all N runs (per `REN-20`).
- It has at least one `PASS` and at least one `FAIL` across the N runs.
- `SKIPPED` and `FAILED-DEPENDENCY` do not count toward flakiness either way (they are an environment / dependency signal, not a test signal).

Pass rate per scenario over the N runs is computed as `pass / (pass + fail)`.
