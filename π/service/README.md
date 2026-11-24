# π service

> π: I run as a macOS LaunchAgent for the logged-in user. My source and dependency lock live here. My threads, chats, memory and execution records live under the active workspace’s π directory. The client owns the Markdown, media blocks, and visible conversation.
>
> From this directory, run `npm ci` and `npx --no-install install-electron` on a new machine. Run `npm run install:preview` for the isolated Preview workspace, or `npm run install:main` when adopting the client for real writing. The installer stages an independent release in that workspace’s `π/.runtime/releases`. Each workspace has its own LaunchAgent, model configuration, and login. Run `npm test` for the π tests.
>
> Stream saves addressed messages in `π/.runtime/mailbox-v1/in` with a stable request ID, the exact text, and its context. I claim each request before execution. I save the outcome for Stream to collect whenever it is open. After a crash I recover a recorded chat or report an interrupted request. Stream commits the displayed beat and the receipt together. Only explicit message submissions enter the queue.
>
> Changes to function prompts apply on the next call. To adopt changed π code, say “apply the updated π service” in a Stream bubble, or rerun its installer. The running version finishes accepted work before launchd starts the selected release. To upgrade the Stream client, use Stream’s own build and promotion workflow.
