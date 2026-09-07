# Offline eval portability contract

The required CI jobs run the same complete corpus. Nothing invokes a model API,
uses an account secret, or needs a database. Node.js 22 runs deterministic test
fixtures; shell contracts support Bash 3.2 or newer and POSIX `sh` for Git hooks.

| Required leg | Pinned runner family | Awk baseline | Command |
| --- | --- | --- | --- |
| Ubuntu system awk | `ubuntu-24.04` | Actual `/usr/bin/awk`: mawk 1.3.4 or GNU Awk 5.1+ | `bash evals/test-portability.sh --awk=system` |
| Ubuntu GNU Awk | `ubuntu-24.04` | GNU Awk 5.1+; explicitly installed | `bash evals/test-portability.sh --awk=gnu` |
| macOS system awk | `macos-14` | `/usr/bin/awk`, version 20200816+ | `bash evals/test-portability.sh --awk=system` |

Runner images receive security updates, so each job prints its actual shell and
awk version. An absent requested binary, unsupported version, or unexpected
Ubuntu default produces `NOT_RUN` and exit 2. It never silently skips a leg.
GNU Awk is not an optional subtest inside the system-awk run. The system leg
does not replace Ubuntu's alternatives symlink: it tests and identifies the
image's actual default, which can itself be GNU Awk.

Every leg runs structural validation, all behavioral and improvement contract
tests, every case's dry validation, and strict catalog coverage. This includes
trailing-zero scores, malformed/non-finite numeric values, duplicate fields,
indentation shadowing, tab/control delimiters, provenance ambiguity, artifact
mutation, synthetic harness incidents, and isolated Git-hook tests. All `awk`
subprocesses use a wrapper that preserves exit codes and retains stderr even
when a rejection test hides its own stderr. Any awk diagnostic fails the leg;
stdout/stderr are also checked for awk warnings. This prevents warning output
from being mistaken for successful coverage.

The checkout action is pinned to v6.0.2 (Node.js 24), with credential persistence
disabled. The workflow has no `continue-on-error` or conditional portability
skips. Repository branch protection must select all three `Eval contracts / …`
checks to make them merge requirements; a workflow file cannot configure a
hosted repository's branch protection itself.

Passing offline contracts verifies the harness and authored assertions. It does
not establish live model quality, external runner provenance, or isolation.

## Local verification snapshot — 2026-09-07

On macOS arm64 with Bash 3.2.57, both the system Awk baseline and an additional GNU Awk 5.4.0 run passed the
complete corpus: structural 11/11, behavioral 163/163, agent coverage 28/28 and explicit artifact contracts
217/217, with no unexpected Awk diagnostics. The GNU build used a temporary prefix only; it was not added to
the repository, global tool installation or user configuration. Its official source and detached signature were
checked using the GNU release keyring. See the [GNU release announcement](https://lists.gnu.org/archive/html/info-gnu/2026-02/msg00011.html).

The local GNU run does not replace either required Ubuntu job. Those hosted jobs still need execution against
the reviewed release commit.
