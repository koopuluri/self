---
name: publish-ghost
description: Publish self (formerly Ghost), its media archive, and personal site after approval of the exact prepared commit message. Use when asked to publish or release the workspace.
---

# publish ghost

Ghost is the canonical workspace, including `<3/products/personal-site/` and `tools/`. Read `README.md`, `AGENTS.md`, and `tools/publishing/README.md` from the Ghost root. Use `tools/publishing/publish.py` for deterministic preparation, upload, Git publication, and conditional Vercel deployment.

## prepare the release

First read and apply [organize](../organize/SKILL.md) to align the repository with Ghost's structure. Complete its moves, reference repairs, and relevant checks before preparing a release plan or proposing the final commit message. Include those changes in the publication scope. Resolve any organization issue that would leave affected references broken before preparing; report ambiguous placements without guessing. Do not run organization between approval and execution of an existing plan; any new organization changes require a fresh prepared plan and message approval.

Inspect the working changes and last published revision. Preserve user wording and source records. New editorial annotations in user material start with `> π:`; ordinary status updates and the commit message do not need that prefix.

Complete necessary edits and appropriate checks before asking for message approval. Review `ghost.publish.json` and confirm the intended destinations. Source and site copy are public by default. Normal publication uploads assets to the existing private R2 bucket, pushes source to `koopuluri/self`, and deploys the site. Cloudflare domain changes and public media gateway setup remain deferred; they are not prerequisites for this private-archive workflow. Public media may be served only through the separately configured and verified capped gateway. Credentials, browser sessions, local app state, build products, and private media bytes must not enter the Git publication. If the credential scan finds a value in a historical transcript, do not rewrite the source record silently: resolve its publication treatment with the user.

Propose a commit message describing what changed and how Ghost evolved. Use one or two short, lowercase, informal sentences. Avoid a change-log dump, conventional-commit prefixes, and implementation trivia unless they are the point of the change.

Run `python3 tools/publishing/publish.py prepare --message 'the proposed message'`. Inspect the resulting plan and source diff. Review newly outgoing Git history, media/metadata, and references to any excluded record. Use tools/publishing/review.py for local review and purge planning; it performs no external deletion. Automated scanning is advisory for privacy and cannot replace review. Present the exact message and any material publication limitation. **Wait for the user to confirm the commit message before executing the publish flow.** This is the user's explicit preferred approval step; a request to prepare or set up publishing is not approval of an unseen message.

If the user edits the message, prepare again with their wording. If source files, assets, destinations, or publishing configuration change after approval, show the updated scope/message and get approval for the new plan. Do not manufacture an approval, bypass the plan check, or automatically approve a generated message.

## execute the approved plan

Once the user confirms the prepared message, run the publisher with that exact plan ID using the local `.venv/bin/python` and the configured private credentials. This approval authorizes the described Git, R2, and Vercel steps; do not ask again for each routine step. Respect any narrower authorization the user gives.

The private R2 policy includes local upload/request/storage limits and Cloudflare billing alerts. The user accepted that $20 is not a guaranteed hard cap. Do not describe alerts or local limits as a provider-enforced cap, expose the bucket, or raise limits to make a blocked run succeed without the user's agreement.

The site deploys only when its declared inputs differ from the last successful deployment. Keep all public workspace roots and READMEs in `site.inputs`; newly added content beneath them is automatically included. Root and section READMEs own the site introduction and landing copy. Essays in `<3/essays/` retain root slugs. Preserve historical site posts.

If a stage fails, report the actual partial state. Keep its receipt and plan; retry only after identifying the cause, with at most two retries for a transient provider failure. On an ambiguous deployment outcome, inspect the existing Vercel result before attempting another deployment. Never force-push, overwrite local edits during restore, delete old media, or rotate credentials as recovery shortcuts.

Return a short outcome containing the approved commit message/revision, number of uploaded assets, and site URL or “unchanged; deployment skipped.” Claim completion only when the Git push, asset verification, and required site deployment all succeeded. Mention any stage still blocked.
