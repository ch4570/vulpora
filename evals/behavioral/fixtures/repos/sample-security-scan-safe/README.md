# Static negative controls

Read these source snippets only. No dependencies are installed and no application,
test, container or service should be started. All service clients are illustrative.

The browser uses textContent. Queries bind values and select SQL identifiers from
a closed map. The API accepts verified bearer headers only with no cookie fallback;
the separate cookie-authenticated route checks a session-bound CSRF token. Local
`src/authentication.js` supplies the middleware and opaque-token validation using
server-held records and expiry, without an undeclared external auth adapter. Cleanup
clients are constructed inside the same function from fresh Testcontainers mapped
ports, with no externally supplied endpoints, singleton pool, reuse or host-network
option. This is source evidence of ownership, not a claim of runtime validation.
