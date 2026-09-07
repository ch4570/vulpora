---
name: e2e-report-renderer
description: Render settled e2e-runner JSON as offline HTML in single-run, trend, or comparison mode when asked to visualize or share E2E results. Preserve input data.
---

# E2E Report Renderer — HTML Rendering Protocol

This skill is **normative**. **MUST / MUST NOT / SHOULD** carry RFC-2119 meaning. Rules are cited by ID (`REN-n`).

> **Authority**: [`AGENTS.md`](../../../AGENTS.md) is binding. This skill is a *view* layer over `e2e-runner`'s data; it never re-interprets results or fabricates them.

> **Shared contract**: [`docs/e2e-scenarios/CONTRACT.md`](../../../docs/e2e-scenarios/CONTRACT.md) is the SSOT for the run-result JSON schema and mask classes. Its bootstrap source and validator ship with the required `e2e-scenario-author` dependency. If this skill disagrees with the project contract, the project contract wins.

> **Input**: a run JSON (or set of run JSONs) under `test-report/e2e/`. **Output**: an HTML file in the same directory. HTML output is git-ignored by project policy; if you want history, the JSON beside it is the SSOT.

> **Reference loading:** Apply the common REN contract below and the project report/masking contract.
> Only `trend` or `compare` loads [comparison modes](reference/comparison-modes.md), the canonical REN-18..21
> definitions. Read [HTML security](reference/kb/self-contained-html-security.md) if safe embedding is unclear,
> [artifact handling](reference/kb/artifacts-screenshots-traces.md) for missing/truncated evidence, or
> [accessibility](reference/kb/readable-failure-reporting.md) when changing the shipped visual template.
> [Principles](reference/principles.md) explain rationale; [the KB index](reference/kb/INDEX.md) locates other
> topics. Read either only when needed. MUST NOT recursively load the entire KB.

---

## A. Boundary

**REN-1 (Input is JSON only) — MUST.** The skill reads `*.json` produced by `e2e-runner`, conforming to [`CONTRACT.md §5`](../../../docs/e2e-scenarios/CONTRACT.md). It MUST NOT parse the runner's Markdown summary, the catalog, or anything else as a primary data source.

**REN-2 (Read-only on inputs) — MUST NOT.** The skill MUST NOT modify or delete the run JSON, the `raw/` directory, or the `logs/` directory. Output is written only to `test-report/e2e/*.html`.

**REN-3 (No execution) — MUST NOT.** The skill MUST NOT invoke `e2e-runner`, `e2e-scenario-author`, `docker`, `gradle`, or any system probe. It works strictly from existing files on disk.

---

## B. Modes

**REN-4 (Three modes) — MUST.** Exactly three modes; pick one per invocation:

| Mode | Trigger | Output filename |
|---|---|---|
| `single-run` (default) | User points at one `{run-id}.json` (or it is implied as "the latest settled run") | `{run-id}.html` (next to the JSON) |
| `trend` | User asks for "last N runs", "trend", "history" | `trend-N{N}-{YYYY-MM-DD}.html` (see `REN-18`) |
| `compare` | User passes two run IDs ("A vs B") | `compare-{A_lex_smaller}-vs-{A_lex_larger}.html` (see `REN-19`) |

For `single-run` with no path given, default to the most-recently-modified `*.json` under `test-report/e2e/` **that has a sibling `.done` marker** (per `REN-17`). If no such JSON exists, `REN-16` applies.

**REN-5 (Schema & contract validation) — MUST.** On reading each JSON the skill MUST validate:

1. `schemaVersion == 1` and `contractVersion == 1`. Mismatch → stop with `REN-5.VERSION: <file>: expected schemaVersion=1, contractVersion=1; got <s>, <c>`.
2. Every field listed as required in [`CONTRACT.md §5`](../../../docs/e2e-scenarios/CONTRACT.md) is present (not just defined). Missing field → `REN-5.MISSING-FIELD: <file>: <jsonpath>`.
3. `summary.total == pass + fail + skipped + failedDependency + probeError`. Mismatch → `REN-5.SUMMARY-MATH: <file>`.
4. Every `results[*].dependsOn` reference targets a `results[*].id` present in the same JSON. Missing → `REN-5.DANGLING-DEP`.

Best-effort rendering of a malformed JSON is forbidden. The renderer either produces a faithful view or nothing.

---

## C. Single-file output constraints

**REN-6 (No external resources) — MUST.** The output HTML MUST NOT reference any external URL — no CDN script, no Google Fonts, no remote images. All CSS, JS, fonts (system stack), data, and inline SVG live inside the single `.html` file.

**REN-7 (No build step) — MUST.** No bundler, no transpiler, no `node_modules`. CSS is hand-written with `:root` variables; JS is vanilla (ES2020). The skill writes the HTML directly using [`fixtures/template.html`](fixtures/template.html) as the structural starting point.

**REN-7.1 (Safe JSON inlining) — MUST.** When substituting the run JSON into the `<script type="application/json">` block of the template, every occurrence of `</` in the JSON text MUST be replaced with `<\/` before insertion. Without this escape, a JSON string value containing the literal `</script>` would terminate the script block early — breaking the page in the benign case and enabling XSS in an adversarial case (e.g. a response body crafted by an upstream service that the runner faithfully captured).

**REN-8 (Raw inline embedding) — MUST.** Response bodies (head 4 KB + tail 4 KB per scenario, per `RUN-13`) and log tails (failed scenarios only) MUST be embedded directly into the HTML as `<pre>` blocks rather than linked. Linked artifacts defeat the "share one file" property. On overflow show a `...truncated, see test-report/e2e/<run-id>/raw/` notice.

**REN-9 (XSS-safe text injection) — MUST.** All dynamic text from the JSON (purpose, actual, evidence, log tail, response body) is set via `textContent` or pre-escaped before insertion. `innerHTML` with un-escaped runner data is forbidden. This guards against a response body that happens to contain `<script>` or `<img onerror>`.

---

## D. Visual design

**REN-10 (Semantic color + non-color signal) — MUST.** Status uses both color *and* an icon/text glyph:

| Status | Color | Glyph |
|---|---|---|
| `PASS` | green | `✓` |
| `FAIL` | red | `✕` (bold) |
| `SKIPPED` (precondition-unmet) | gray | `–` |
| `PROBE-ERROR` | amber | `?` |
| `FAILED-DEPENDENCY` | amber | `⤴` (with link to blocking parent ID) |

Color alone MUST NOT carry information (accessibility). Contrast targets WCAG AA or better — verify with the paired token table in [`fixtures/template.html`](fixtures/template.html) (the template ships compliant pairs; do not improvise new pairs without re-checking contrast).

**REN-11 (Theme) — SHOULD.** Default theme follows `prefers-color-scheme`. Provide a top-right toggle. Persisting the user's choice in `localStorage` is acceptable but not required by this skill.

**REN-11.1 (Default UI language is Korean) — MUST.** All user-facing labels in the rendered HTML — summary card labels, filter placeholders, table headers, footer notice, error/empty-state messages, expanded-row key labels — MUST be in Korean. Status code values themselves (`PASS` / `FAIL` / `SKIPPED` / `FAILED-DEPENDENCY` / `PROBE-ERROR`) remain uppercase English because they are literal data values shared with the runner JSON contract; the filter dropdown displays them in the form `통과 (PASS)` so the data join continues to work without an i18n table on `dataset.status`. `fixtures/template.html` ships Korean labels by default; if an English variant is ever needed, fork the template under a new fixture path and select it via a future skill option — never mix the two within one report.

**REN-12 (Layout) — MUST.** The single-run report contains, in order:
1. Header — `runId`, `mode`, `git.sha`, `git.branch`, catalog SHA, stale flag, working-tree-dirty flag, wall time.
2. Summary cards — exactly five numbers (`pass`, `fail`, `skipped`, `failedDependency`, `probeError`) plus `total`. `total` is rendered as a literal copy of `summary.total` (validated for math under `REN-5`), not recomputed in JS.
3. Filters — area dropdown, status dropdown (with `PROBE-ERROR` as a distinct option), text search.
4. Results table — `ID / Purpose / Dataset / Expected / Actual / Status / Latency`, expandable per row to show embedded raw body / log tail.
5. Failures detail — every `FAIL` row expanded by default.
6. Remaining risks — bulleted list from `remainingRisks`.

For `trend` mode, prepend a small inline-SVG line chart of pass rate over the last N runs and a "flaky scenarios" table per `REN-21`.

For `compare` mode, prepend a side-by-side diff of `summary` numbers and a per-scenario status delta (`PASS → FAIL`, etc.) before the rest, plus the cross-catalog handling per `REN-20`.

---

## E. Safety & noise

**REN-13 (Masking is mandatory, not advisory) — MUST.** Apply every mask class defined in [`CONTRACT.md §7`](../../../docs/e2e-scenarios/CONTRACT.md) to any body / log text injected into the HTML — even though the runner already masked the report Markdown and the raw artifacts (`RUN-14`), the renderer MUST mask again as a second defense layer. The output HTML is the **most shareable** artifact in the pipeline; under-masking it leaks PII into chat threads and PR comments.

If the runner's JSON contains a value that already looks masked (matches a `<MASK:...>` placeholder), the renderer leaves it alone.

**REN-14 (Size cap) — SHOULD.** The produced HTML SHOULD stay under 4 MB. If it would exceed:
1. Truncate per-scenario inline bodies to 1 KB head + 1 KB tail.
2. Drop log tails for `FAIL` scenarios when total log inline > 200 KB across the report.
3. If the result still exceeds 4 MB, stop with `REN-14: report exceeds 4MB after fallback truncation; render fewer runs or single-scenario subset`.

A footer notes the applied truncation level when steps 1 or 2 fire.

**REN-15 (No browser auto-open) — MUST NOT.** The skill MUST NOT execute `open`, `xdg-open`, or any other command that opens the file in a browser — environment side effects belong to the user. Print the output path instead.

---

## F. Edge cases

**REN-16 (No-input behavior) — MUST.** If the requested input does not resolve to at least one settled run JSON:

| Situation | Action |
|---|---|
| `single-run` default, `test-report/e2e/` empty or no `.done` markers | Print `REN-16: no settled run found under test-report/e2e/`. Exit non-zero. Do NOT render an empty page. |
| `single-run` explicit path missing | Print `REN-16: file not found: <path>`. Exit non-zero. |
| `trend` with fewer than 2 settled runs | Print `REN-16: trend mode requires ≥ 2 settled runs; found <N>`. Exit non-zero. |
| `compare` with one or both run IDs missing | Print `REN-16: compare missing: <id>` for each missing one. Exit non-zero. |

**REN-17 (In-progress race protection) — MUST.** A run JSON is *settled* iff a sibling `.done` marker file exists in the same run directory (`RUN-15`). The renderer MUST refuse to render an unsettled JSON in any mode and MUST NOT include unsettled runs in `trend` selection or `compare` resolution. Unsettled JSONs print a warning line but do not crash the run.

For `trend` or `compare`, apply [REN-18 through REN-21](reference/comparison-modes.md) before selecting runs
or computing aggregates. A single-run render does not load that mode contract.

**REN-22 (Missing raw/logs degradation) — MUST.** When the run JSON references `evidence.rawBodyPath` or `evidence.logTailPath` but the file does not exist on disk:
- Render the row with a `(artifact missing)` notice in place of the inline `<pre>` block.
- Add a footer line: `Missing artifacts: <count>`.

This does NOT fail the render — a missing artifact is a known degraded state (e.g. someone copied the JSON elsewhere without the `raw/` directory) and the rest of the report is still useful.

---

## G. Companion behavior

| You want | Skill |
|---|---|
| Refresh the scenario catalog from code | `e2e-scenario-author` |
| Execute the catalog and produce JSON | `e2e-runner` |
| Turn that JSON into a shareable HTML | **this skill** |

The three skills never call each other. Their only coupling is the on-disk artifact each one consumes from the previous, plus the shared [`CONTRACT.md`](../../../docs/e2e-scenarios/CONTRACT.md).

**REN-23 (Contract reference is normative) — MUST.** The renderer treats [`CONTRACT.md`](../../../docs/e2e-scenarios/CONTRACT.md) as a normative input. A `contractVersion` bump is a coordinated three-skill PR; the renderer alone cannot raise the version. The skill recognizes `contractVersion == 1` only; any other value fails `REN-5.VERSION`.

---

## Checklist

- [ ] Input `schemaVersion == 1` AND `contractVersion == 1` verified; all required fields present; summary math checks (`REN-5`)
- [ ] Default `single-run` path waits for the `.done` marker; unsettled runs refused (`REN-17`)
- [ ] No-input edge cases handled (`REN-16`)
- [ ] Output is a single `.html` file in `test-report/e2e/` (`REN-4`)
- [ ] Trend filename embeds actual N; compare filename canonically sorted (`REN-18`, `REN-19`)
- [ ] Cross-catalog runs banner shown; flaky logic uses common-scenarios subset (`REN-20`, `REN-21`)
- [ ] Zero external network references in output (`REN-6`)
- [ ] All runner-derived text injected via `textContent` or pre-escaped (`REN-9`)
- [ ] Status uses color + glyph; `PROBE-ERROR` distinguished from `SKIPPED` (`REN-10`)
- [ ] Defensive masking from `CONTRACT.md §7` applied to embedded bodies and logs (`REN-13`)
- [ ] Size cap fallback applied or hard-failed; missing artifact degradation graceful (`REN-14`, `REN-22`)
- [ ] Output path printed; no browser auto-open (`REN-15`)
- [ ] Runner JSON, raw/, logs/ untouched (`REN-2`)
- [ ] Contract version on disk matches renderer-supported version (`REN-23`)
