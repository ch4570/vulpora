---
title: Browser rendering and request-forgery boundaries
source: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
sources:
  - uri: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html
last_fetched: 2026-09-10
skills: [security-scan-workflow]
---

## XSS decisions

Follow request, stored, and DOM inputs into the final browser context. HTML text, attributes,
URLs and JavaScript require different controls. Auto-escaped text is a safe counterexample;
raw HTML escape hatches need appropriate sanitization. Check transformations after sanitization
and dangerous URL schemes. CSP alone is not evidence that an unsafe sink is repaired.
Trace server response content type and frontend consumption together: an API value may become
stored XSS only when another component inserts it as HTML.

## CSRF decisions

CSRF exploits credentials a browser attaches automatically to forged requests. Determine actual
authentication transport per route: cookies and cookie-carried JWTs remain relevant; explicitly
attached bearer headers without ambient fallback change applicability. “Stateless” is insufficient.
Inspect filter-chain matchers, excluded paths, accepted content types, token validation, and
origin checks before concluding protection is missing or effective. CORS does not generally
prevent sending simple forged requests. SameSite is contextual defense, not a universal exemption;
state-changing GET and sibling-origin assumptions require review. Token theft is a separate
issue from request forgery, and XSS can defeat CSRF protections.

## 리뷰 훅

- [ ] All browser entry points map to their final render context or an evidence-backed exclusion.
- [ ] Safe text rendering is distinguished from raw HTML and unsafe URL/script contexts.
- [ ] Ambient authentication and effective route-level CSRF protection are evidenced together.
- [ ] Bearer-only and enforced-token safe controls are not flagged merely for missing local checks.
- [ ] Missing frontend/middleware source remains a coverage gap, never a clean verdict.
