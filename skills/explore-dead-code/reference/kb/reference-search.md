---
title: Batched reference search and absence evidence
source: https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md
last_fetched: 2026-09-10
skills: [explore-dead-code]
---

# Batched reference search

[ripgrep's guide](https://github.com/BurntSushi/ripgrep/blob/master/GUIDE.md) documents default
ignore/hidden/binary filtering and explicit glob overrides. Therefore a zero-hit search is
evidence only for its effective search universe. Use local `rg --help` to confirm installed flags.

Generic examples, from the inspected repository root; substitute actual roots/names and include
only paths that exist:

```sh
rg --files -g '!node_modules/**' -g '!build/**' -g '!dist/**'
rg -n -F -e 'unusedHelper' -e 'LegacyAdapter' -- src tests config
rg -n --hidden -F -e 'LegacyAdapter' -- .github
```

These commands are lexical discovery, not resolved-symbol analysis. Quote names/paths and use
fixed strings for candidate names. Read matching context to distinguish substrings, overloads,
aliases, comments and string-based registration. File candidates also need import-path,
package/CLI entry and configuration references checked; symbol search alone is insufficient.

At invocation, confirm local exit status semantics: `rg` returns 0 for matches, 1 for no matches
and 2 for errors. Do not append `|| true` and interpret an error as no use. Check stderr and
truncation; if output is too large, narrow the batch or ask for file names first, then inspect
the relevant files. `head` on search output cannot prove the absence of unseen callers.

Before high-confidence classification, reconcile search exclusions with build/entry configuration
and, where available, Git's tracked file inventory (`git ls-files`). Relevant tracked hidden or
ignored files may need explicit paths. Keep generated/vendor output out of candidate discovery,
but inspect its registration inputs or mark generated callers unverified. Avoid an unrestricted
whole-repository scan that pulls dependency caches, secrets and binaries into context.

## 리뷰 훅

- [ ] Search roots, ignore effects and truncation are recorded; relevant config was included.
- [ ] Multiple candidate names share a search pass; whole-repository scans are not repeated per name.
- [ ] Definition occurrences and same-file uses are separated by context, not by excluding a file.
- [ ] Exit 1 is distinguished from error/denial/stale results, and no timing claim is invented.
