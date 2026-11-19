---
title: Browser media evidence with Playwright
source: https://playwright.dev/docs/videos
additional_sources:
  - https://playwright.dev/docs/screenshots
  - https://playwright.dev/docs/test-use-options
  - https://playwright.dev/docs/test-configuration
last_fetched: 2026-10-28
skills: [e2e-evidence-report]
---

# Browser media evidence with Playwright

- The `video` option accepts `'off'` (default), `'on'`, `'retain-on-failure'` and `'on-first-retry'`. Evidence mode
  needs `'on'`: `retain-on-failure` deletes recordings of passing tests, which are exactly the ones a reviewer wants
  to see.
- Videos are written to the test output directory when the browser context closes at the end of the test. A test
  that creates its own context must `await context.close()` or its video is lost.
- By default the video matches the viewport, scaled down to fit 800×800. Set the viewport if a larger recording is needed.
- `screenshot: 'on'` captures one screenshot after each test. Checkpoints the TC names need explicit
  `page.screenshot({ path, fullPage: true })` or `testInfo.attach` calls inside `test.step`.
- Relative paths in a Playwright config resolve against the config file. The generated overlay lives in the evidence
  directory, so it re-anchors `testDir`, `globalSetup`, `globalTeardown`, project `testDir` and `webServer.cwd` to the
  repository config's folder. Report any other relative path the repository config relies on as a gap.
- Project-level `use` overrides top-level `use`, so the overlay applies the evidence options to every project too.

## 리뷰 훅

- [ ] The browser run used the generated overlay; the repository's Playwright config is unchanged.
- [ ] Every browser case in `evidence.json` references its video; a missing video is reported, not hidden.
- [ ] Each TC checkpoint has a named screenshot.
- [ ] Captures were checked for visible secrets or personal data before being referenced.
