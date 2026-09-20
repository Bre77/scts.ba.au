# SCTS UI

A small web frontend for the [Splunk Cloud Testing Service](https://scts.dev.splunk.com/openapi.json):
create a short-lived Splunk stack, read its URL and credentials, and watch it expire.

Built as a single Cloudflare Worker that serves a React app and proxies its API calls.

## Why there's a proxy

The SCTS API sends no CORS headers, and `OPTIONS /v1/stacks` answers `405` with
`Allow: GET, POST`. Because every call needs an `Authorization` header, the browser
always sends a preflight — which fails. A browser can't call SCTS directly, so the
Worker forwards the calls instead:

```
browser → /api/v1/stacks → worker → https://scts.dev.splunk.com/v1/stacks
```

The Worker is deliberately narrow:

- **Route allowlist.** Only the five method/path pairs SCTS actually exposes are
  forwarded. Anything else gets a `404` without a request leaving Cloudflare, so this
  can't be used as an open proxy.
- **Header allowlist.** Only `Authorization`, `Content-Type` and `Accept` go upstream.
  The response is rebuilt, so no upstream cookies or caching headers come back.
- **Same-origin only.** A request carrying a foreign `Origin` is refused.
- **Nothing is retained.** The API key passes through in memory. It is never stored,
  cached, or logged, and the Worker holds no secrets of its own.

## Where the API key lives

The key is prompted for once and kept in the browser's `localStorage` under
`scts.apiKey`. It is sent with each request and never persisted server-side, so anyone
can use a deployed instance with their own Dev Portal key. **Forget my key** clears it,
and a `401`/`403` from SCTS clears it automatically and explains why.

Note this is a bearer token in `localStorage`: any script running on the page's origin
can read it. That's an acceptable trade for a single-purpose internal tool with no
third-party scripts, but it's the reason the app loads nothing from a CDN except fonts.

## Running it

```bash
npm install
npm run dev
```

`npm run dev` runs Vite with the Cloudflare plugin, so the real Worker code handles
`/api/*` in development — the proxy path is exercised locally, not stubbed.

```bash
npm test    # lease maths and the route allowlist (node:test, no extra deps)
npm run build
```

## Deploying

```bash
npm run deploy
```

That builds and runs `wrangler deploy`. There are no secrets or bindings to configure.

To serve it from `scts.ba.au`, add the zone route in `wrangler.jsonc` once the DNS
record exists (the config has it commented in place):

```jsonc
"routes": [{ "pattern": "scts.ba.au", "custom_domain": true }],
"workers_dev": false
```

Rerun `npx wrangler types` after changing `wrangler.jsonc`.

## Layout

```
worker/index.ts    the proxy and static-asset handler
src/api.ts         typed SCTS client; maps API error codes to readable messages
src/types.ts       hand-mirrored from openapi.json
src/lib/time.ts    lease maths behind the countdown bars
src/components/    key gate, stack card, create and delete dialogs
test/              node:test suites for the two bits of real logic
```

## Not built: choosing a stack lifetime

The API has no lifetime parameter. `CreateStackRequest` accepts only `splunkVersion`,
and `terminationDate` comes back server-assigned, so how long a stack lives is entirely
SCTS's decision. A "keep this for N hours" input was deliberately left out rather than
shipped as a control that silently does nothing.

If SCTS gains a lifetime field, the change is small: add it to `CreateStackRequest` in
`src/types.ts`, and add the input to `CreateStackDialog` alongside the version select.

## Notes on behaviour

- The list refreshes every 15 seconds only while a stack is `CREATING` or `STOPPING`,
  and stops once everything has settled. Countdowns tick locally every 30 seconds
  without re-fetching.
- Credentials are fetched per-stack via `GET /v1/stacks/{id}` once a stack is `RUNNING`,
  since `stackAccessDetails` doesn't exist before that.
- Each stack shows a bar of elapsed-versus-remaining life between `createdAt` and
  `terminationDate`. Under a day left, the bar and countdown turn red.
