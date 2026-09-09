# Overnight improvement feedback log — 2026-09-08

Status: implementation and review recorded; final CI/merge status is in
[PR #7](https://github.com/ch4570/vulpora/pull/7). Started
from `52ce077` (`v1.0.1`) on `codex/overnight-feedback-20260908`. The user ended
further exploration on September 9 and requested a pull request. No npm release
has been published. Final aggregate verification is recorded in the pull request.

The requested loop is to improve Vulpora throughout the night, evaluate the
changes, and use the findings to choose the next improvement. Each cycle records
a reproducible failure, a regression check that fails before the fix, the
implementation, and an independent review or broader verification. Passing
offline checks does not establish live agent quality or operational promotion.

## Initial measurements

These checks completed before the implementation changes:

| Check | Observed result | Scope |
| --- | --- | --- |
| `bash evals/run-evals.sh` | 11/11 passed | Structural evaluation contracts |
| `bash evals/behavioral/run-behavioral-evals.sh --validate` | 167/167 passed | Behavioral case definitions; no model execution |
| `npm run test:economics` | 84/84 passed | Offline cost accounting and synthetic experiment contracts |

The initial `install/test-offline-suite.sh` run completed with **72 test suites
passing, zero failures**. Because its tests read the working tree while fixes
were being developed and its inventory preceded the new test files, this is a
broad diagnostic result, not a frozen before/after comparison. The complete
system-Awk portability corpus also passed with zero Awk diagnostics, **28/28**
agents covered, and **221/221** required artifacts explicitly declared. Final
verification must check the complete candidate after the edits settle.

## Cycle 1: failures missed by the existing checks

Independent audits examined installation/removal, session preparation/accounting,
and improvement evidence. The coordinator also exercised process timeouts with
an outer watchdog confined to a temporary process group.

| Failure reproduced | Expected behavior | Progress |
| --- | --- | --- |
| A single selector containing `entity --apply` made `setup --dry-run` install files. | Preserve argument boundaries and reject malformed selectors before mutation. | Fixed; malformed setup/uninstall selectors fail before writes. |
| Removing the last receipt also removed `.vulpora/tasks` and an approved task specification. | Preserve task records and metadata that the receipt does not own. | Fixed; task evidence and user settings survive final removal and a repeated removal. |
| Quoted duplicate `actual` and `verdict` YAML keys were ignored by strict result comparison. | Reject ambiguous core evidence fields. | Fixed; malformed variants fail while an unmodified sample runner result still passes comparison. |
| An edit proposal with a missing parent directory launched a synthetic worker before failing, recording 110 synthetic tokens. | Reject an ineligible target before dispatch or budget reservation. | Fixed; regression proved rejection during preparation and after a parent was removed before dispatch. |
| A scoped file named `__proto__` vanished from the workspace fingerprint map. | Track every declared file and reject a stale workspace. | Fixed with a prototype-free map; four prototype-like names covered. |
| A command ignoring TERM ran beyond the timeout; descendants and the timer could keep output pipes open. | Enforce a bounded grace period and clean up owned command/timer processes. | Fixed and independently reviewed; six timeout checks pass after the follow-up below. |

Session verification passed **42/42** runner contracts and **49/49** accounting
checks after the fixes. Its three new contracts failed before implementation.
All runtime executions in those checks use the existing fake runtime fixture.

Installer verification passed **4/4** new boundary checks (all four failed before
the fix), **36/36** installation checks, **18/18** removal checks, and **23/23**
CLI checks on the standalone rerun. Independent review also exercised multiple
selectors and both runtimes under Bash 3.2.57, including empty-target dry runs.
The first parallel CLI run had one TTY removal failure; a focused reproduction
and the standalone rerun passed. Its cause is unresolved, and failure-log output
was added to retain evidence if it recurs. The real doctor check remains skipped
where its runtime prerequisite is unavailable.

Improvement record contracts, the five signed-evidence boundary tests, and the
Awk audit passed. A new integration check creates a deterministic sample-runner
candidate, verifies it unchanged, then confirms that adding a quoted verdict
causes rejection. This is synthetic evidence, not a live model comparison.

### Review feedback applied

An independent reviewer found that cancellation during timeout cleanup could
kill the watchdog before it stopped a reparented descendant. The added regression
failed against the first fix. Cancellation now waits for the watchdog's retained
process cleanup and ignores repeated termination signals during that cleanup.
The six-test suite passes, and the reviewer separately verified a sequence of
TERM, TERM, HUP, and INT signals without a surviving descendant or open pipe.
The existing offline network-isolation fixture also passes through the changed
timeout runner.

The first-cycle npm integration completed with **23/23** checks passing,
including the extracted package's prepack/source gate, inert npm installation,
explicit setup and receipt-based removal, and the guided npx entrypoint. This
package was captured before the second-cycle code changes.

The review identified another, pre-existing limit: if a command exits normally
before the deadline while leaving a background descendant holding its output
pipes, the wrapper does not currently retain that descendant. This is queued for
the next cycle's caller-contract investigation; the current timeout fixes do not
claim to resolve it.

## Feedback for the next cycle

The initial passing checks did not cover several boundaries between components:
shell argument forwarding, receipt ownership versus task storage, YAML syntax
versus score extraction, file eligibility versus budget reservation, and process
termination versus descendant cleanup. Further cases should vary those
boundaries and assert visible effects, including absence of an unwanted launch
or deletion, rather than relying on a success message alone.

## Cycle 2: complete process shutdown and repeated path computation

The process investigation found a concrete consumer: the native Codex app-server
adapter sent TERM and exited immediately after writing a report. Its failure path
scheduled a later KILL but exited before that timer could run. Downstream
evaluation can therefore read results while the runtime is still alive.

Five fake app-server tests reproduced an adapter returning before the server
stopped: graceful completion, TERM-resistant completion, protocol failure,
missing report, and caller interruption. All five failed before implementation
and passed afterwards. The adapter now waits for child close and event flush,
keeps the KILL timer alive, and returns a failure if cleanup cannot be verified
within its bound. Missing runtime, existing-report preservation, and messages
arriving after completion also have regression coverage.

Independent review found a second failure: Node invokes the Writable `end`
callback with an error before emitting the stream's `error` event. If the child
had already closed, ignoring that callback argument returned exit zero while
losing the terminal event. The new delayed-write regression first reproduced
that false success. The callback now records failure before finalizing shutdown.
The hard deadline also covers an event write whose callback never completes:
that regression initially returned zero despite `cleanup_unverified`, and now
returns failure within the deadline. The app-server suite passes **10/10** checks.
Independent review reran its original EIO reproduction and confirmed failure
instead of success. No real runtime authentication or model call is used by these
tests.

The timeout wrapper now retains ownership of the command's process group through
normal leader exit. Background writes stop and inherited pipes close before the
evaluator takes its after-snapshot. Regression checks also verify that an
unrelated sibling group survives. Processes that deliberately leave that group
remain outside this local ownership mechanism.

The first group-cleanup implementation passed nine targeted checks and the real
offline fixture, but independent review showed that a wrapped command could
forge the temporary completion file and be killed while the wrapper returned
zero. Both control FIFOs are now opened and unlinked before launching the command;
the worker and timer do not inherit their descriptors. The supervisor sends the
actual command child's wait result. A separate child also preserves `exit` and
`exec` builtin behavior; `exit 7` had regressed to 125 in the first implementation.

The final timeout suite passes **12/12** checks. Independent review reran a
stronger forged-file attack and observed timeout 124 with process cleanup, then
verified literal arguments and exit-code/output preservation. The fake Codex
adapter also passes with its timeout explicitly enabled, exercising stdin prompt,
stdout response, and metrics. The offline network fixture passes. These are
macOS Bash 3.2 results; Linux execution and external enforced isolation remain
unverified. The running source gate began before this follow-up, so the final
package run captures the settled candidate separately.

Small removal fixtures showed repeated checksums of the same target path in the
receipt helpers. The optimization reuses only the derived anchor path and keeps
all filesystem, ownership, snapshot, and pre-deletion checks. Target/state-path
changes and unsafe-state mutations have their own regression checks (**7/7**
passed; the repeated-checksum regression failed before implementation). Existing
removal checks (**18/18**) and installer boundary checks (**4/4**) also passed.

| Synthetic removal fixture | Checksum calls before → after | Observed seconds before → after |
| --- | --- | --- |
| 1 receipt entry | 43 → 15 | 1.169 → 0.766 |
| 4 receipt entries | 136 → 57 | 2.154 → 1.490 |

Filesystem safety function and `find`, `diff`, `cmp`, `cp`, and `mv` invocation
counts were unchanged. The coordinator independently recounted the saved Bash
traces; the measurements above are the saved repeat, which used identical
uninstaller code and recorded before/after helper hashes. Timing is a small local
measurement affected by concurrent test load; repeated full-tree scans remain,
so this does not establish an overall catalog-scale speedup. Independent review
confirmed that only the derived path
is cached, and reran all seven mutation and path-change checks successfully.

The second-cycle source gate completed successfully (`npm package source OK`).
It read the working tree while follow-up work continued; the frozen second-cycle
package integration subsequently passed **23/23**, including its extracted full
source gate. All **17** changed code files in that extracted package were checked
against the saved second-cycle hashes and matched.

## Cycle 3: query boundaries and real project layouts

The E2E inventory treated a root-level Spring source such as
`src/main/kotlin/demo/ArticleController.kt` as a different module from every other
source file. The root-module regression failed with
`src:main:kotlin:demo:ArticleController.kt` instead of one root-module identity.
Path normalization fixes the source-root boundary. Independent review then
reproduced a collision between the checkout basename and a same-named child
module, as well as changed targets under an unchanged source fingerprint after a
checkout rename. The final fix uses `:` for the root, matching the existing test
profile runner convention and catalog grammar; nested names remain unchanged.
The author contract now passes root-module identity, relocation-invariant output,
unchanged nested `services:api` identity, duplicate root-endpoint rejection, and
root catalog binding. Independent Java/Kotlin fixtures confirmed the original
collision is fixed and a Korean/space-containing checkout rename preserves the
complete inventory, while real duplicate root endpoints are still rejected.

A fake-driver NL-to-SQL audit reproduced an allowlist bypass: a non-recursive
CTE name was incorrectly visible inside its own definition, so an unqualified
physical relation escaped the schema check. No database connection was made.
Scope-aware validation now rejects self/future-name and nested-name leakage
before either `run_select` or `explain_select` calls the driver. Valid earlier
siblings, nested scopes, outer references, and dialect-specific recursive CTEs
remain supported. The implementation follows the
[PostgreSQL WITH rules](https://www.postgresql.org/docs/current/sql-select.html#SQL-WITH),
[MySQL WITH rules](https://dev.mysql.com/doc/refman/8.4/en/with.html), and
[SQL Server CTE rules](https://learn.microsoft.com/en-us/sql/t-sql/queries/with-common-table-expression-transact-sql?view=sql-server-ver17).
Six newly added checks first failed; the final NL-to-SQL suite passes **43/43**, its
build/typecheck pass, and its locked dependency audit reports zero vulnerabilities.
The coordinator independently checked **19** more nested/quoted/function/TABLE
variants with zero DB calls. An explicit scope stack avoids JavaScript recursion;
PostgreSQL recursive bodies share the completed name set instead of copying it
for every CTE. This is still a conservative schema-access parser, not proof that
arbitrary SQL is syntactically valid or safe under unrestricted DB privileges.

The earlier TTY removal failure remains unreproduced after six focused runs
(whole input, byte-split input, and confirmation after preview; two of each), all
preserving the unselected agent and removing the selected one. Its investigation
found a separate false-positive test assertion: a trailing newline in the grep
pattern supplied an empty alternative that matched any output line. The assertion
now checks the actual runtime-autodetection and scope-selection rows exactly.
Unrelated/missing-row logs first exposed two failures; the corrected positive and
three negative checks pass. The complete CLI suite passes **26/26**. Its real
dual-runtime doctor branch remains skipped because the Claude CLI is absent.

The adjacent E2E verdict/profile contracts also pass. The **22** changed code
files in the third-cycle candidate matched their saved hashes before launching a
new frozen npm integration run. Its extracted files were independently checked
against those hashes. The run completed with **23/23** package checks passing,
including the complete extracted source gate.

The next isolated audits chose further improvements below. The overnight
objective remains active.

## Cycle 4: preserving edits and rejecting incomplete commands

Isolated, deterministic filesystem hooks reproduced two routing-updater losses:
an exclusive-create collision was followed by deletion of the pre-existing
temporary file, and a manual `AGENTS.md` edit during source inspection was
overwritten by the initially read text. Neither reproduction touched user files.
Ownership-aware temporary cleanup and a pre-publication drift check now preserve
those files and return a clear error. The check compares raw bytes, file identity,
mode, type, and existence; `--check` and no-op paths also reject a changed snapshot
instead of reporting a stale success. Only the temporary file whose ownership
and identity were established is cleaned up. Initial atomic regressions had
**10 failures out of 14**; two additional stale-success regressions failed before
their fix. The final atomic suite passes **16/16**, and the complete updater shell
contract passes its existing **12** stack tests plus those **16** checks.
The coordinator reran both original reproductions in a new directory and all
16 atomic checks: foreign temporary data and concurrent manual edits survive,
with no publication on either conflict. Existing creation-mode/umask behavior
remains unchanged. A portable check followed by rename is not a filesystem-wide
atomic compare-and-swap; that remaining race is explicitly documented. If an I/O
error prevents proving temporary-file identity, preservation is preferred to an
unverified deletion.

The native start-task adapter also loops on each of its ten value-taking options
when the last value is missing. Consuming `--preflight-only` as a value can instead
skip the intended preflight path and reach runtime discovery. Reproductions used
a sanitized PATH with no runtime binaries and an isolated HOME; no authentication
or model was accessed. A common argument guard now returns structured
`missing_option_value` with exit 2 before consuming such an option. Leading-dash
literal values remain expressible through the existing `--option=value` form.
The initial **100** missing/next-option checks failed before implementation.

Follow-up review found that the task serializer and hash subprocess could treat
a leading-dash task as a Node option. A harmless stdout-only `--eval` payload was
executed instead of serialized/hashed. The two directly exposed task expressions
now separate program and data arguments with `--`; the other five Node eval calls
also use that separator defensively for derived paths. Six expression regressions
failed before the fix. Final verification passes **140** input/semantic checks,
**8** actual-source expression checks, the existing input/auth/drift contracts,
and **20** interruption/forced-failure cleanup checks with zero orphan, runtime,
or personal-auth sentinel hits. The start-task contract and Bash 3.2 syntax checks
also pass. The coordinator independently checked four argument cases and twelve
more expression variants, including option-like text, Korean, and newlines.
Expression/preflight tests are not a live adapter/model integration test.

A further portability check reproduced locale-dependent E2E inventories: the
same Unicode-named Java/Kotlin inputs were ordered differently under English,
Swedish, and Korean Node locales. This changed the source fingerprint without a
source edit. Locale-independent code-unit sorting now governs traversal, hashed
inputs, and surface ordering. The regression verifies the actual three resolved
locales and compares complete inventories, including Unicode route ordering.
It first failed across English/Swedish and now passes the complete author
contract. Existing root-module identity fixes remain in place. Catalogs generated
under a different old sort order need regeneration with the corrected generator;
if their old input order already matches, the fingerprint remains unchanged.

The fourth-cycle candidate's **27** changed code files matched their saved hashes
in the extracted lifecycle source. That frozen run has now passed **23/23** npm
integration checks, including the complete extracted source gate. This avoids
mistaking a preceding snapshot's pass for verification of later edits. The
overnight work remains active; no package or operational promotion has been
published.

## Cycle 5: expression scope, outer row caps, and source provenance

The SQL schema scanner mistook `FROM` inside `EXTRACT`, `SUBSTRING`, and `TRIM`
for a physical relation. PostgreSQL/MySQL queries using these ordinary functions
were rejected before the driver. Both relation and comma-source scanners now
recognize that separator only at the direct argument depth of those three
unquoted, unqualified function names. Nested SELECT/TABLE sources, CTE visibility,
qualified functions, and forbidden calls are still checked. Three new test groups
failed before implementation; the initial joint MCP suite then passed **48/48**.
An independent coordinator matrix later accepted **18** public-schema variants
and rejected **18** private-schema variants across both dialects and three query
locations. Every accepted variant also received its required outer row cap.

A separate fake-driver reproduction showed that any nested `LIMIT` suppressed
the outer cap. `TOP(...)` functions and keyword-like identifiers could do the same.
Clause detection now uses complete masked tokens and query depth, with dialect-
specific LIMIT/FETCH/TOP handling. Quoted atoms retain a harmless placeholder so
an alias such as `AS "x"` cannot disappear and change the next clause's meaning.
Comments remain whitespace. Complete query wrappers are distinguished from
parenthesized UNION operands; a single matching pass avoids quadratic rescanning.
User-supplied outer limits, including large values, remain unchanged. This is
outer-cap injection, not a new streaming guarantee or a rewrite of explicit
limits. Existing post-fetch result truncation still applies.

The initial cap tests had **8** failures; added identifier cases exposed **2** more
failures in the intermediate patch, and independent variable/wrapper review
exposed **6** failing test groups before the follow-up fix. These overlapping
group counts are not unique-defect totals. The current joint MCP suite passes
**62/62**, plus build and typecheck; it includes fake-driver SQL/binding assertions
and 15,000-deep wrapper/expression inputs. Independent final review passes **33**
source-guard/fake-service variants, **6** masking checks, **6** write/row-lock
rejection checks, and the **26/26** guard/query-limit tests.
The optional package's dependency audit reports **0 vulnerabilities**; no dependency
or lockfile changed.
Syntax references: [PostgreSQL SELECT](https://www.postgresql.org/docs/current/sql-select.html),
[MySQL SELECT](https://dev.mysql.com/doc/refman/8.4/en/select.html),
[MySQL identifiers](https://dev.mysql.com/doc/refman/8.4/en/identifiers.html),
[MySQL variables](https://dev.mysql.com/doc/refman/8.4/en/user-variables.html), and
[MySQL parenthesized queries](https://dev.mysql.com/doc/refman/8.4/en/parenthesized-query-expressions.html).
No real database or model was called.

For receipt removal, validated ordinary relative paths now use Bash string
splitting rather than external dirname/basename. Option-like paths keep their
legacy fallback; physical-parent, symlink, ownership, and snapshot checks are
unchanged. Two new tests first failed on subprocess counts; final derived-path
**12/12**, uninstall **18/18**, and boundary **4/4** suites pass. The coordinator
reviewed the limited source change and independently reran all twelve path tests.
Actual small 1/4-entry uninstall fixtures reduced dirname+basename calls from
**19 to 9 / 49 to 21**, with safety and snapshot call counts unchanged. Single-run
times varied in both directions (**0.623 to 1.142s / 3.485 to 3.245s**), so this
supports deterministic subprocess reduction, not an overall speedup claim.

The DTO audit reproduced ambiguity and cross-module constraint leakage from
global simple-name lookup, including cases where an unconstrained declaration
was omitted from the index. Resolution now uses explicit Spring imports or the
same package/module, and direct relative Nest imports or proven same-file DTOs.
Duplicate FQNs without a build graph, unresolved imports, aliases, re-exports, and
unsupported inherited/generic/nested validation fail closed. Unconstrained
declarations remain in the index; Java records retain their last constrained
component. Initial regressions produced **15 failures out of 19**.

Independent review found three additional silent gaps: direct scalar validation
skipped DTO resolution, comments obscured an import alias, and a bodyless Kotlin
class adopted the following class's body. Those paths now retain their own source
boundaries, and nested classes no longer become top-level FQN candidates. A
separate compatibility check showed four inline Nest DTO cases passed at HEAD
but failed in the intermediate patch. They are restored through same-file proof,
without reintroducing global fallback. Comment/string annotation examples do not
become request metadata. Finally, three failing multiline-string cases reproduced
fake import/package statements changing DTO resolution. Candidates now require
an actual source token at that offset, not text inside a string.

The final DTO suite passes **35/35** and is connected to the full author shell
contract. Independent external scenarios passed **17/17** before the final small
string-token follow-up; the coordinator reviewed that follow-up and reran the
complete author contract, including all 35 tests, on the final source. Root-module
and locale invariance regressions remain passing. This is a conservative source
resolver, not a full JVM/TypeScript compiler or dependency-graph resolver.

The fifth candidate passed its own frozen npm integration run: **23/23**, including
the extracted full source gate. All **31** changed code files in that lifecycle
snapshot matched their saved hashes. No previous package result is attributed to
these later changes.

## Cycle 6: cleanup failures and preview/write boundaries

A fake-transport audit using the actual installed connection pools reproduced
rollback failures returning transaction-active connections for later reuse.
The PostgreSQL/MySQL drivers now discard those connections using their public
pool APIs rather than releasing them normally. Successful query results remain
available if discard returns normally; setup/query failures retain the original
error object. If release/discard itself throws and there was no earlier failure,
the query fails rather than reporting success. No cleanup is attempted when
connection acquisition fails, and no normal release follows a discard attempt.

The new driver suite initially passed **13/39** and failed **26/39**; after the
patch it passes **39/39**. The joint MCP tests pass **101/101**, with build and
typecheck passing. The coordinator independently reviewed the source and public
pool implementations and reran all 39 cleanup tests. Tests assert zero real
socket-connect attempts, empty pool/idle counts after discard, a different next
connection, and primary-error identity. They do not prove server-side rollback
completion or identify a live engine condition that causes the synthetic
nonfatal rollback error.

SQL Server remains a separate, explicit limitation: node-mssql **12.7.0** returns
the connection inside its transaction rollback callback even when that callback
reports an error. The real Transaction/Tarn pool plus fake transport reproduced
reuse despite the default `SELECT 1` health check. Changing only the caller's
error response would not prevent that reuse. No private dependency fields,
SQL Server driver code, or whole-pool shutdown behavior was changed. The MCP
README records this unresolved limitation separately from the PG/MySQL fix.

An existing endpoint-only MCP configuration exposed another preview violation:
`mcp install --dry-run` entered the policy-upgrade writer. Fresh-install previews
were unaffected. A new tree-preservation test failed before the fix; existing
missing/exact/conflicting policy previews now inspect without entering the
writer or rollback path. The MCP manager suite passes **32/32**, including those
three cases and its existing install/login/rollback behaviors, all against fake
runtime CLIs.

Adjacent read-only audits then reproduced two further target boundaries:
option-like relative paths `-P`/`--` were interpreted by shell `cd`, redirecting a
project installation to the synthetic HOME; dangling config symlinks could reach
the fake add command and create an outside target before rejection, or succeed
for packs without a tool policy. The originally suspected `--target --dry-run`
case did **not** apply: `cd` rejected it first. The fixes distinguish those actual
reproductions from the unconfirmed hypothesis. Separated option operands now
reject missing, empty, and option-like values; equals-form literal paths remain
supported. Canonicalization uses an absolute operand and `cd --`. All Codex packs
check config/root types and symlinks before their first runtime call, independent
of tool-policy requirements; dangling symlinks are checked independently of file
existence. The initial boundary suite had **56 failures out of 75**. The expanded
suite passes **80/80**, including five more user-scope literal-path cases, and the
coordinator independently reran all 80. This is a preflight boundary, not an atomic
filesystem-wide guarantee against a subsequent path replacement.

The final manager also passes independent **72/72** preview combinations and a
fresh **32/32** manager suite. The preview checks compare file content, inode,
permissions, and modification time across two runtimes/scopes/packs and additional
remove/login/status/multi-pack cases. Only fake getter calls are permitted; login
with dry-run rejects before even a getter call.

A separate Spring source audit found direct validation leaking from an unused
class after the last controller or a method-local class. Eighteen Java/Kotlin
fixtures yielded **10 correct / 8 incorrect** inventories; all scanner processes
returned success, so content assertions were essential. Real scalar and referenced
DTO cases remained correct. A small lexical helper now passes only proven Spring
formal parameter text to direct/DTO validation, preserving the final Java `)` and
ignoring parentheses inside annotation strings/comments. Ambiguous declarations
and executable default-argument bodies fail closed instead of searching a wider
body for constraints. Nest parsing is unchanged in this step. The focused suite
passes **29/29**, the prior DTO suite **35/35**, and the complete author contract
passes again. The coordinator independently reran the complete contract and
checked the actual extracted helper with **72** synthetic header/annotation/suffix
transformations plus **5** expected rejections; these helper transformations are
not a claim that every synthetic suffix is valid compiler input.

The sixth candidate is settled with saved hashes for **38** changed code files.
The coordinator's final joint MCP run passes **101/101**, with typecheck and build.
Its own frozen package run passed **23/23**, including the full extracted source
gate, with all **38** extracted lifecycle source hashes verified. The fifth
snapshot did not contain these later changes.
No commit, publication, live model, or real database action has been performed.

## Cycle 7: observed drift and lexical boundaries (in progress)

The next cycle began only after all 38 sixth-cycle extracted source hashes were
verified. That now-passing frozen package result remains separate from these
newer changes.

A session snapshot audit showed configured Git diff helpers executing during
preparation. A constant text-conversion or external-diff result also concealed
changes to a tracked file outside the declared task files; volatile conversion
output could instead reject unchanged source as stale. The snapshot now passes
`--no-ext-diff --no-textconv` to Git diff. These are the documented controls for
[external diff drivers and text-conversion filters](https://git-scm.com/docs/git-diff#Documentation/git-diff.txt---no-ext-diff).
This changes the fingerprint's input, not the session's runtime authority.

Eight synthetic-repository tests produced **2 PASS / 6 FAIL** against the frozen
sixth-cycle runner, including both hidden changes and a false `STALE_WORKSPACE`.
The same final tests pass **8/8** after the fix; existing session contracts pass
**42/42**. They check that no diff helper ran, stale attempts create no launch or
budget reservation, ordinary/binary edits remain detectable, and an in-workspace
attempt excludes its own generated artifacts. Fixtures use real Git and a fake
runtime only. Independent review reran all eight and passed **10/10** additional
cases covering staged/unstaged/binary/mode/rename/deletion changes, attribute and
environment diff helpers, and unchanged-source execution. No new finding emerged.

The session documentation also narrows the coverage explicitly: this is not a
Git sandbox or whole-filesystem fingerprint. Git clean filters/normalization
remain configured; unrelated untracked contents and ignored files are not fully
hashed. Only declared task files receive the existing raw-content hashes.

The SQL audit reproduced a schema-policy bypass: PostgreSQL SQL after a bare CR
was hidden inside the guard's LF-only comment, even though the engine ends that
comment at CR. Non-ASCII PostgreSQL dollar tags also exposed literal `LIMIT` text
to outer-cap detection. Both lexers now agree on PostgreSQL/SQL Server CR/LF
comment endings and PostgreSQL Unicode dollar delimiters, including identifier
boundaries and exact closing-tag matching. MySQL retains LF-only line-comment
termination; applying the CR change indiscriminately would change its semantics.
These distinctions are backed by the [PostgreSQL scanner](https://raw.githubusercontent.com/postgres/postgres/REL_18_STABLE/src/backend/parser/scan.l),
[MySQL scanner](https://raw.githubusercontent.com/mysql/mysql-server/refs/heads/8.4/sql/sql_lex.cc),
and [SQL Server comment documentation](https://learn.microsoft.com/en-us/sql/t-sql/language-elements/comment-transact-sql?view=sql-server-ver17).

The new lexical suite moved from **11 PASS / 10 FAIL** to **21/21 PASS**. The
original 40-case audit now has zero mismatches; the coordinator independently
reviewed both lexers, reran all 21 tests, and checked **36** extra Unicode-tag and
nested-query/comment variants. The joint MCP suite passes **122/122** in both the
implementer's and coordinator's runs, with build/typecheck passing. These are
guard/fake-driver results with zero real socket connects, not live-database tests.

The MCP policy audit reproduced lost operator edits at two distinct levels: the
original manager plus a fake verification getter modified config before failing,
after which blind restore erased that edit; a separately instrumented source copy
inserted a prepublication edit that blind publication erased. The manager now
builds from a raw backup, checks config bytes/type/identity/mode before publishing,
and restores only its still-owned published result. Unpublished failures do not
replace the original inode. Observed drift and restore I/O failure preserve the
current config and private recovery backup, stop subsequent runtime removal or
OAuth, and report paths without config contents. Foreign temporary-file
replacements are not deleted. Recovery backups may contain sensitive settings;
INSTALL documents their 0600 permissions and required manual review.

Initial policy regressions were **10 PASS / 30 FAIL**. Additional restore-I/O and
login tests reproduced four missing recovery-diagnostic/continuation boundaries.
Review also found BSD-first `stat -f` could accept a GNU filesystem report if the
format string happened to name a real file. Strict output validation now accepts
only the intended five fields and otherwise tries the GNU format. That portability
case uses a simulated GNU argument parser, **not** a real Linux/GNU execution.
Four of its six helper cases were RED initially. Final policy tests pass **55/55**
in both implementer and coordinator runs; existing manager **32/32** and boundary
**80/80** suites pass on the final hash. Bash 3.2 syntax passes. The final
check-to-rename window is still not an atomic compare-and-swap guarantee.

The receipt audit found a separate rollback error: after detecting that a removal
candidate differed from its expected snapshot, a failed restore was ignored and
the transaction directory containing the only current copy was deleted. Both a
static helper mismatch plus synthetic restore failure and a complete uninstall
with a synthetic last-moment edit/restore fault reproduced the loss. Normal
restore and snapshot-cleanup-failure controls behaved correctly.

The small failure-branch fix retains a private `.vulpora-remove.*/candidate`,
best-effort `original.path` record, and an explicit recovery-path diagnostic.
The absent original path's receipt/baseline/anchor can be released; its recovery
copy is not falsely re-registered as an installed asset. A later uninstall may
report `nothing_installed`, but neither restores nor deletes the recovery copy.
The partial-uninstall message no longer implies everything stayed at its original
location. The new suite moved from **4 PASS / 3 FAIL** to **7/7 PASS**, independently
rerun by the coordinator. Two extra coordinator probes confirm the candidate
survives even when the recovery record cannot be written. Derived-path **12/12**,
uninstall **18/18**, and installer boundary **4/4** tests pass. A small offline
tarball had matching hashes for the three related code files and passed all seven
rollback tests; this does not replace the complete frozen package gate.

The seventh candidate is settled with saved hashes for **42** changed code files.
Focused checks, independent reviews, and manifest consistency pass. Its own
frozen source/package gate passed **23/23**, including the full extracted source
gate, with all **42** extracted lifecycle code hashes verified. No earlier
package result is attributed to these newer changes. The follow-up investigations
below started only after that source snapshot had been verified.

## Cycle 8: final recovery and identifier-boundary follow-ups

The replacement helper had the same unique-copy loss in two branches: restoring
a mismatched displaced original, and restoring after new-file publication failed.
Eight independent file/directory fixtures gave four successful restoration
controls and four restore-fault losses. Both error branches now preserve the
private transaction's `old` copy and best-effort `original.path`, report only
paths, return failure, and restore the caller's working directory. If no previous
destination existed, the caller's source remains intact and temporary-copy cleanup
is unchanged. Installer metadata is not falsely reported as restored: an interrupted
snapshot update can leave the old receipt with a missing local snapshot, which
fails the existing anchor-consistency check. Recovery remains available for manual
inspection. The INSTALL guide separates this from removal's ownership release.

The expanded rollback suite moved from **13 PASS / 11 FAIL** to **24/24 PASS**,
including the previous seven removal tests, missing recovery-record writes,
no-previous-destination controls, and three real installer fixtures with synthetic
I/O faults. The coordinator independently reran all 24 and reviewed both branches.
Derived-path **12/12** and boundary **4/4** checks pass; the original eight external
reproductions retain their RED evidence and now preserve all displaced copies.

The SQL follow-up found JavaScript whitespace classification was not MySQL's
`--` byte rule: non-ASCII whitespace hid real private relations, while ASCII
control characters exposed commented-out `LIMIT` to cap detection. Both guards
now use MySQL's ASCII whitespace/control and end-of-input rule, retaining LF-only
comment termination. Embedded NUL in raw MySQL SQL is conservatively rejected;
NUL in separately bound parameter values remains supported. A real, unconnected
mysql2 pool and prepare-packet checks confirm the default UTF-8 encoding preserves
the tested bytes. Syntax conclusions use official lexer/grammar sources; no
database server was contacted.

A separate schema-name audit found Unicode whitespace turning a different
schema into an allowed ASCII name. PG/MySQL now refuse that unquoted boundary.
Review then reproduced Unicode identifier suffixes matching only a CTE's ASCII
prefix in all three dialects. The lexer reads the complete identifier and applies
the existing ASCII relation/CTE-name policy before granting a CTE exemption.
MSSQL's existing whitespace interpretation is not otherwise changed. Unicode
column expressions and opaque strings/dollar literals remain supported, while
previously accepted unsupported Unicode relation names and quoted aliases can
now fail closed. The audit records **seven** public alias cases and **two** public
table-name cases as compatibility restrictions, not as private-schema bypasses.

The final independent review found one normalization gap: JavaScript `trim()`
removed a trailing NBSP before the schema check and changed the requested table
name. PG/MySQL normalization now strips only their ASCII whitespace/terminators;
MSSQL's existing normalization is unchanged. Two further failing test groups now
pass, covering leading/trailing NBSP and semicolon combinations with zero driver
calls, plus normal ASCII normalization controls. The earlier final package run
was stopped as obsolete and is not counted as a passing validation.

The final lexical tests pass **48/48** (21 prior plus 27 new); the joint MCP suite
passes **149/149**, with typecheck/build passing. Original private-relation
bypasses, commented-limit omissions, and false comment rejections were checked
against their preserved audit inputs rather than relabeled as passing evidence.

Finally, review caught a flaw in the new session test itself: inherited
`GIT_CONFIG` redirected fixture config writes outside the fixture even while all
eight assertions passed. The test now clears inherited `GIT_*` path/config
overrides before establishing its controlled environment and restores the caller's
environment in `finally`. A ninth nested regression uses two synthetic hostile
environments and checks the outside file and directory are unchanged. Restoring
the old cleanup in an isolated test copy gives **8 PASS / 1 FAIL**; the final suite
and an independent rerun pass **9/9**. This is Git-environment fixture isolation,
not a sandbox for arbitrary PATH, BASH_ENV, or NODE_OPTIONS.

The final candidate contains **43** changed code files. The corrected final npm
gate was attempted separately from the passing seventh-cycle snapshot, but disk
exhaustion (`ENOSPC`) prevented lifecycle extraction. It is **not** a passing
verification of the final candidate. The two generated failed/cancelled package
fixtures were removed, retaining logs; no user data was removed. The final
149-test MCP run, 48 lexical tests, 24 rollback tests, nine snapshot tests, and
15-case independent normalization recheck pass. CI must repeat the complete
source/package gate on the final commit before merge.

PR preparation does not publish an npm release, merge the changes, or run live
models/databases. Public disclosure requires the maintainer's explicit exception
to SECURITY.md. Remaining boundaries include the previously documented SQL
Server rollback-pool limitation, check-to-rename races, and unverified real Linux
and authenticated-runtime behavior.

## PR #7: merge-readiness follow-up — 2026-09-09

The maintainer explicitly approved the public draft PR as an exception to
SECURITY.md, then authorized merge only after evaluation. The merge threshold is
all current-head CI/evaluation checks passing, no blocking security, data-loss,
or regression finding in the reviewed scope, and an exact match between the
reviewed commit and the commit being merged. This does not authorize an npm
release or replace least-privilege deployment controls.

On `3e6bc98`, Linux core checks on Node 22/24, macOS core on Node 24, both SQL
jobs, and all six push/PR evaluation jobs passed. macOS core on Node 22 failed
two timeout tests at their seven-second outer watchdog; that failure blocks
merge even though the other eleven jobs passed.

An independent controlled probe isolated the timeout issue: adding only 150 ms
to each process-table read extended a one-second timeout to approximately
7.8 seconds, and 250 ms extended it to 11.2 seconds. Workers were stopped in
both probes. Counting twenty sleeps did not bound the elapsed cleanup grace
because process inspection time accumulated between sleeps. The seven-second
test watchdog is retained rather than increased.

Both cleanup polling phases now use an owned two-second deadline job, including
process-inspection time in the wait budget. Existing running-job, parent PID,
and process-group ownership checks are unchanged. Deadline jobs are stopped and
reaped on success, failure, and cancellation; cleanup uses KILL for its own timer
because a timer started after cancellation can inherit ignored TERM. A new
250 ms delayed-inspection regression failed the old runner at 7.0 seconds and
passed the candidate at 5.5 seconds, checking observed workers and timers were
stopped. The author and final coordinator timeout runs passed **13/13**. External process
inspection can still stall; this is not an operating-system scheduling or
isolation guarantee.

The final source-discovery review also reproduced a valid NestJS import
regression: a semicolonless side-effect import consumed the next direct relative
named DTO import. Restricting the binding match from crossing a quote preserves
the declaration boundary. Four quote/multiline combinations failed before the
fix and now pass; alias and re-export rejection remain covered by two controls.
All **70** DTO/formal-parameter tests passed both author and coordinator reruns,
and a separate read-only review found no blocker in this narrow change.
The coordinator also reran the full source-author contract successfully. No
tests were skipped or their watchdog increased to make these changes pass.

The coordinator's first timeout rerun had two exit-code-1 failures in ordinary
completion cases, before additional assertion diagnostics were present. Their
cause is not established and is not claimed fixed. Both cases passed a focused
rerun; the complete final suite then passed **13/13**, including delayed process
inspection in 4.3 seconds. Assertions now preserve captured output if either
failure recurs. The local filesystem remains near capacity, so final full
source/package validation must be established by CI on the follow-up commit,
not inferred from these focused runs. Separate read-only review accepted both
the timeout ownership/timer cleanup change and the import-boundary change.
