# Browser profile continuity

- Website login state belongs to the user and must survive browser rebuilds, app replacement and app relocation on the same Mac/user account.
- Keep the bundle identifier `local.ghost.browser` and the existing persistent `WKWebsiteDataStore.default()` profile. `BrowserProfile.swift` centralizes this contract. A new UUID profile is an empty profile, not an upgrade.
- Do not clear website data, reset the profile, delete WebKit/HTTPStorages directories, or change signing identity/sandbox containers as routine build or test cleanup. Any required profile migration must preserve the existing data and be verified before replacing the running app.
- Never put cookies, auth headers, tokens, local-storage dumps or browser-profile backups in Ghost, source control, test output or logs.
- Use nonpersistent stores for capture/UI fixtures. Persistent-storage tests must use their own test-only app identifier and synthetic data, never the user's real profile.
- Keep the browser UI minimal. New tabs are blank and focus URL/search entry. Browser events go directly to the adjacent Ghost folder.
