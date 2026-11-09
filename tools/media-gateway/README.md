# public media gateway

Local implementation only; no Worker, route, binding, account plan, bucket access setting or DNS has been changed.

The gateway serves reviewed release media without login. The R2 bucket itself stays private, with no `r2.dev` or direct public custom-domain bypass. Requests are GET/HEAD only. A bundled release manifest permits only current files; unknown paths and public writes perform no storage operations. Each admitted request uses at most one R2 read. Responses stream, support video byte ranges, and use `no-store` so the initial version has no public cache to invalidate on removal.

The cost bound depends on an account on **Workers Free**, its 100,000 requests/day limit, fail-closed routing, no bypass, and no automatic move to paid usage. The Worker code alone does not enforce that provider limit. At one read/request this endpoint can cause at most about 3.1 million reads in a 31-day month; other account usage shares R2's allowances. Storage, uploads and other services remain separate costs. Do not describe this as a provider-wide dollar cap.

## local checks

```sh
node --test tools/media-gateway/worker.test.mjs
python3 tools/media-gateway/prepare.py
```

Preparation writes only `.ghost/media-gateway/release.json`. The committed empty `release.json` and disabled example configuration cannot expose media. At a later approved release, bundle the reviewed manifest with `worker.mjs`, verify uploaded objects, confirm Workers Free and fail-closed routing, then enable serving and set `NEXT_PUBLIC_SELF_MEDIA_ORIGIN` for the site. Confirm zero direct bucket bypasses before deployment.

For deletion, remove the path from the gateway release first, then explicitly purge archived bytes and all affected versions/references as reviewed. The current archive preserves historical media for restoration; deletion of a local file alone is not a purge.

Sources: [Workers limits](https://developers.cloudflare.com/workers/platform/limits/#daily-requests), [R2 pricing](https://developers.cloudflare.com/r2/pricing/), [R2 API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).
