<!--
Short, human-readable Markdown summary written alongside the JSON SSOT.
This template is the SHAPE the runner MUST follow (RUN-15). Replace {...} tokens.
For a visual report, run `e2e-report-renderer` against the sibling .json.
-->

# E2E Run — `{runId}`

| | |
|---|---|
| Generated | `{generatedAt}` |
| Status | `{terminalStatus}` |
| Topology | `{environment.topology}` · owner: `{environment.owner}` |
| Runtime proof | `{environment.runtimeProof.verdict}` |
| Cleanup · orphan audit | `{cleanup.verdict}` · `{environment.orphanAudit.verdict}` |
| Branch · SHA | `{git.branch}` · `{git.sha}` |
| Changed modules | `{git.changedModules joined with ", "}` |
| Catalog | `docs/e2e-scenarios/catalog.md` @ `{catalog.sha}` · stale: `{catalog.stale}` |
| Wall time | `{wallTimeMs} ms` |

## Summary

| pass | fail | skipped | failed-dependency | total |
|---|---|---|---|---|
| **{summary.pass}** | **{summary.fail}** | {summary.skipped} | {summary.failedDependency} | {summary.total} |

## Results

| ID | Status | Latency | Notes |
|---|---|---|---|
| `{result.id}` | {result.status} | {result.latencyMs} ms | {result.skippedReason or "—"} |

## Failures
<!-- One block per FAIL result, in catalog order. -->

### `{result.id}`
- **Purpose**: {result.purpose}
- **Dataset**: `{result.dataset}`
- **Expected**: {result.expected}
- **Actual**: {result.actual}
- **Evidence**: [`{result.evidence.rawBodyPath}`](./{result.evidence.rawBodyPath}), [`{result.evidence.logTailPath}`](./{result.evidence.logTailPath})

## Skipped

- `{result.id}` — {result.skippedReason}

## Remaining risks (self-assessment)

- {risk}

---

> For an interactive view (filters, dark mode, raw bodies inline), run `e2e-report-renderer` against `{runId}.json`. HTML output is git-ignored by design.
