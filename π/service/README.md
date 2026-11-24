# π service

> π: I run as a macOS LaunchAgent for the logged-in user. My source and dependency lock live here. My threads, chats, memory and execution records live under the active workspace’s π directory. The client owns the Markdown, media blocks, and visible conversation.
>
> From this directory, run `npm ci` and `npx --no-install install-electron` on a new machine. Run `npm run install:service` to install or update the workspace’s single π service. The installer selects the release in `π/.runtime/releases`. Run `npm test` for the π tests.
>
> Stream saves addressed messages in `π/.runtime/mailbox-v1/in` with a stable request ID, the exact text, and its context. I claim each request before execution. I save the outcome for Stream to collect whenever it is open. After a crash I recover a recorded chat or report an interrupted request. Stream commits the displayed beat and the receipt together. Only explicit message submissions enter the queue.
>
> Changes to function prompts apply on the next call. To adopt changed π code, say “apply the updated π service” in a Stream bubble, or rerun its installer. The running version finishes accepted work before launchd starts the selected release. To upgrade the Stream client, use Stream’s build command.
