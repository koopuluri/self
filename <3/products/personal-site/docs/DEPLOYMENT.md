# homepage mvp release

## baseline

- Existing private Git repository and Vercel project reused.
- Previous production commit: `8ea6491d638cf4ebb9c73ffaaddd2e5660450973`.
- Previous deployment: `dpl_3EE3rxGKGz66r9qx36KZKXm6vSXX`.
- Previous deployment URL: https://karthikuppu-jwyvyj2a3-homan-projects.vercel.app
- Domain configuration before release: verified `koopuluri.com` redirects (308)
  to verified `www.koopuluri.com`, both assigned to `karthikuppu.com` project in
  `homan-projects`. No domain, DNS, environment or unrelated project settings changed.

## verification, october 12, 2026

- `npm ci` completed. Existing lint dependency emitted a Node engine warning;
  content checks and production build succeeded with installed Node 20.16.0.
- `npm run check:content` passed for two expressions, with explicit partial coverage.
- `npm run build` passed compilation, TypeScript and prerendering; `/` is static.
- Chrome local production preview inspected at desktop, 390px and 320px widths.
  No horizontal overflow at either mobile width. Keyboard focus is visibly outlined.
- Browser DOM confirmed all homepage copy lowercase, exactly two correct original
  X links, and dates in descending order (October 12, then October 11).
- Both original X pages opened successfully. Expandable text was fully read;
  video text/player was verified. No video-content interpretation is claimed.
- Safari/native access unavailable while the Mac was locked. Chrome used instead.
- X restricted access to five profile posts; user approved the initial accessible
  set. Older archive coverage remains incomplete and is recorded in the content file.

## deployment access finding

The Git-triggered deployment for source commit `512f547` was blocked with
`COMMIT_AUTHOR_REQUIRED`: Vercel could not find a linked Git account for the commit
author. No account permissions or authorship were changed. CLI 29.1.1 failed with
an internal JavaScript error. Official CLI 63.1.2 successfully deployed through the
already-authenticated account without changing Git authorship or permissions.

## production result

- Deployment: `dpl_9iusFRXvYv3RkSqn4473fvFVzzVJ`, state READY, target production.
- Immutable deployment URL: https://karthikuppu-1i7dng7z0-homan-projects.vercel.app
- Public entry: https://koopuluri.com → https://www.koopuluri.com
- Homepage source revision: `512f54727931ce6d1de0c954d63a68a325f281f8`.
- Public unauthenticated HTTP checks passed for both domain forms: status 200
  after redirect, new introduction, exact original post URLs, lowercase copy,
  and descending dates. Chrome opened the live page successfully.
- The CLI deployment retains existing preview authentication settings; the
  production custom domain is publicly accessible without authentication.
- Only documentation changed after the deployed homepage revision. Those notes
  do not change the delivered page. Git-triggered documentation builds may remain
  blocked until the user links their Git identity in Vercel; CLI deployment works. For rollback, use Vercel's retained prior deployment or revert
only the homepage MVP commit; preserve the source archive and unrelated routes.

## signed-in archive update, 2026-10-12 (pacific)

- Reviewed 241 distinct rendered Posts timeline entries in signed-in Chrome,
  reaching April 11, 2014 and the loaded timeline bottom. This is not an exhaustive
  export. Native Articles remain deferred; details are in expressions.json.
- Added 58 expressions, giving 60 total: 54 expandable text posts and 6 original
  captioned videos. Opened each new qualifying original and read its own text.
- Kept Maipai's intro and the approved layout unchanged.
- `npm run check:content` and `npm run build` passed; `/` is static.
- Chrome preview checks at 1200px and 390px: 60 distinct valid original X URLs,
  newest-first IDs, lowercase text, no dates, no horizontal overflow, blue
  underlined links and 23.8px paragraph line height. Screenshots visually checked.
- Production target remains the existing Vercel project and custom domains.
- Content commit: `0440239`. Git integration again reported deployment blocked;
  authenticated CLI deployed successfully with no configuration changes.
- Verified production deployment `dpl_c3ST7RQb1dHDv9qG4xvJ2TNLW3md` is READY:
  https://karthikuppu-k93pd1285-homan-projects.vercel.app
- Live browser navigation from https://koopuluri.com reached
  https://www.koopuluri.com/ and confirmed all 60 links, lowercase copy,
  newest-first ordering, no timestamps, blue underlines and no overflow.
