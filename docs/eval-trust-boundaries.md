# Evaluation evidence: what is and is not verified

These tools address part of [the operational trust work](issue-resolution.md).
They are offline building blocks, **not an agent-promotion system**. No signing key,
production credential, paid model call, remote upload, or scheduled live job is supplied.

## Signed evidence verifier

```sh
node install/eval-evidence.js verify /absolute/trusted-policy.json /absolute/bundle.json
bash install/test-eval-evidence.sh
```

The first command always exits nonzero: `1` for invalid evidence, `3` for verified
signatures with missing operational controls. A valid result says
`evidence=VERIFIED_SIGNATURES`, **`promotion=BLOCKED`**. Do not reinterpret exit `3`
as a successful release gate.

The externally protected policy pins a run ID, snapshot SHA-256 (not a Git SHA-1),
runner and environment digests, expected cases and exact per-case `expectedChecks` ID lists, repeat count, freshness, outcome
floor, aggregate token/USD/time limits and trusted Ed25519 public keys. `maxTrials`
caps total trials across both modes and all cases, while `minTrials` applies to
each case/mode. Baseline and candidate trial counts must match.

Use independently provisioned producer and approver identities. A trusted key policy
must live outside candidate-writable inputs and be reviewed out of band: an attacker
who replaces both the policy and evidence can authorize their own signatures.
Never commit private keys. Duplicate key material and producer self-approval are rejected.

`install/eval-evidence.test.js` contains an executable synthetic example of the exact
policy/trial/approval schemas; its ephemeral keys are test-only. Inputs must be sorted-key
canonical JSON with one terminal newline. Sign UTF-8 bytes consisting of the domain
`vulpora/eval-evidence/v1\n` followed by the canonical payload, using
[Node's Ed25519 signing/verification API](https://nodejs.org/api/crypto.html#cryptosignalgorithm-data-key-callback).
The approval binds the SHA-256 of the canonical complete trial-envelope array.
Scores are recomputed from the signed check outcomes, never accepted from a summary field.
Missing, cancelled, stale, duplicated, unmeasured or over-budget evidence fails closed.

Traces contain only allowlisted action/decision classifications and source digests.
`safe-quotation` can describe a response, never a tool action. Raw prompts, commands,
responses and secret-bearing excerpts are not accepted in the trace schema.
Signatures establish attribution/integrity under the supplied trust policy; they do
**not** prove that classifications, check results, usage measurements or digests are truthful.

## Explicit bounded local runner

```sh
node install/run-budgeted-eval.js /absolute/run-spec.json
```

The spec has exactly `executable`, `sha256`, `args`, `cwd`, `files`, `passEnv`,
`timeoutMs`, and `maxOutputBytes`. `executable` and each `{path, sha256}` entry in
`files` must be absolute regular non-symlink paths. `cwd` must be canonical and
non-symlinked. Pin every intended script/input explicitly. Only the explicitly
listed environment variable names are inherited, in addition to a minimal PATH/LANG.
Argument arrays are passed without shell expansion. No model or credential is chosen for you.

The runner checks pinned files before/after execution, bounds leader-process time
and combined stdout/stderr volume, attempts to terminate the still-owned process group on interruption,
and retains only output digests. `outputScope=observed-stream` hashes every observed
chunk (including the chunk exceeding the limit), not unseen output after termination.
Nonzero exits, cancellation, output/time exhaustion,
or changed inputs cannot become a successful execution. Even an exit-zero process
reports **`outcome=INCONCLUSIVE`**, `execution=EXIT_ZERO`, `promotion=BLOCKED`, and exits `3`.

POSIX process groups are not a sandbox: descendants can detach and escape cleanup.
`isolationEnforced=false` and `cleanupEnforced=false` are always explicit.
No termination signal is sent after the leader is observed to exit. A fixed
cleanup/drain deadline releases caller handles even when termination is denied
or pipes remain open; returning does not prove descendants stopped. A signal
error is recorded as `cleanupFailure` without replacing the original budget reason.
Pre/post file digests do not eliminate races or authenticate unpinned dynamic libraries,
imports, network services or container images. Output hashing is not an immutable
result store. Token/USD usage remains `unmeasured`; post-hoc signature budget validation
does not enforce provider-side spending. Run only trusted commands locally.

## Required operator work before promotion

- Controlled runner/image identity, independent provenance signing and protected policy delivery.
- Enforced container/job isolation with filesystem/network/secret denial probes and descendant cleanup.
- Immutable result storage and a verifier bound to original execution records and case/grader digests.
- Provider-side token/USD caps and a reviewed, funded schedule for repeated live security comparisons.
- External approval, redaction review and repeatability evidence across supported runtimes.

The existing baseline matrix is explicit opt-in. Offline contract passes do not
substitute for these live checks, and an environment variable saying “sandboxed” is not proof.
