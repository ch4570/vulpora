# E2E catalog scenario example

Read only when the project contract and SCA-11 need a worked example. The project
`docs/e2e-scenarios/CONTRACT.md` remains authoritative for exact keys and grammar.

````markdown
### `E2E-ARTICLE-GET-HAPPY` — Article list is returned

| Field | Value |
|---|---|
| Target | `GET /api/v1/articles` (discovered-api-module) |
| Purpose | A synthetic member can read the article list |
| Preconditions | `service.api.ready == true` |
| Dataset | `memberId={{seed.MEMBER_ID}}, size=20` |
| Expected | `200 OK`; response header `X-Session-ID` present; `$.content` non-empty |
| Mutates | — |
| Depends-on | — |
| Captures | X-SESSION-ID |
| Notes | First-touch session creation path |

```http
GET {{api}}/api/v1/articles?memberId={{seed.MEMBER_ID}}&size=20
```
````
