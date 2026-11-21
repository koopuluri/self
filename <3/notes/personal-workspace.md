---
title: "Personal Workspace"
date: "November 2026"
---

This is the design specification for the personal workspace. The presentation essay is a separate artifact.

## Introduction

I want an unfragmented experience for consuming information, expressing myself, producing worthy artifacts, and connecting with people.

It should capture the shape of my mind's movement: what I explore, choose to develop, refine, and return to. This personal data will help me train π (my personal artificial intelligence).

## Principles

- **Expression comes first.** Organization emerges from the stream. I can explore without first deciding where a thought belongs.
- **Natural language is the primary interface.** I direct work and configure the workspace through conversation with π.
- **Keep things fundamental.** Use simple, open formats: Markdown for material I edit directly; JSON for configuration managed through π.
- **Enable workflows through configuration.** The workspace provides the capabilities. Specific skills, commands, schedules, and responses to events can be configured through π as needed.

Writing, selecting, following links, browsing, and dropping media remain direct interactions. Organization, settings, and ongoing work are primarily managed through chat.

## Workspace

The workspace has three panes:

- **Left:** the filesystem, providing access to the material in self.
- **Middle:** the stream and documents, opened in tabs.
- **Right:** chat, browser, and control center, selected through a top row of icons.

The stream is the default place to begin writing. The inbox opens as an ordinary document. Filesystem organization and ordering are controlled through π.

π can change the visible workspace when asked to open or show something. Background work preserves the current activity so I can continue writing or browsing while it runs.

## Stream of consciousness

The stream is my primary place to think and explore: one continuous document that opens at the end so I can keep going. It continues across days without requiring me to create or name daily documents. It supports ordinary text editing, links, and media.

Writing in the stream and interacting with π are separate activities. Direct interaction happens in chat. Writing “π — do this” in the stream records an instruction; it does not immediately execute it or start a conversation.

A `process_stream` skill can be configured later to review the stream daily, act on instructions, maintain its own working memory, and surface anything needing my attention in the inbox. This is a workflow enabled by the workspace's general capabilities.

## Artifacts

Ideas can earn their own artifacts. Essays, products, and videos graduate from the stream into things I develop independently. Other thoughts can remain in the stream.

- Documents open in tabs and support familiar keyboard navigation.
- Typing `[[` opens document autocomplete. Following a link opens the referenced material.
- Dropping media into the stream, a document, or a chat places it in shared assets and inserts a link and preview at the destination.
- Text is the primary medium. Ordinary files and previews provide the starting point for other artifacts.

## Working with π

π is my main working partner. I express a desire; π helps me fulfill it. Skills are facets of the same π. I do not interact with separate agent identities.

Multiple conversations and chat history are available, all with the same π. π can retrieve relevant material across the workspace.

### Attention and context

π knows my current field of attention: the active pane, document or page, selection, cursor position, and visible region.

Entering the chat composer retains the context I came from. If I select a paragraph and then type to π, that paragraph remains the reference. Moving to another artifact updates the context for my next message. Work already underway keeps its original target.

### Workspace control

Through conversation, π can edit material, organize files, change settings, open documents and views, operate its browser, and configure scheduled or event-driven work.

Additional instances of π can be introduced later. They remain an internal way for π to fulfill requests.

## Browsing

My browsing and π's work proceed independently. The browser has two spaces, **Me | π**, each with its own tabs, active tab, navigation, and scroll position. Switching spaces shows the tabs belonging to that space.

When I ask π to do something in the browser, it works in its own space. If the request concerns a page I am viewing, that page and my selection supply the context; π opens the relevant page in its space. My browsing remains available while it works.

### Observing and taking control

I can open π's space to observe its work without interrupting it. Taking control pauses π's browser interaction. One of us controls the page at a time.

When π needs help, such as logging into a service, it pauses so I can interact with the relevant page. I tell π when I am done, and it resumes the work. I can also request control myself.

Returning to **Me** restores my browsing position. Switching away from π's space does not itself return control after a handoff.

## Command panel

Cmd-K offers actions relevant to the current document, page, or selection. Typing searches across available actions. The command uses the context from which it was invoked.

I configure the menu through π, with its configuration represented in JSON. Commands can open material, search, start or continue a conversation, or perform another configured operation.

The exact entries and shortcuts can evolve through use. Choices such as “open in chat” and “open in new chat” belong in that configuration.

## Control center

The control center shows what π is doing: live work, schedules, event-triggered work, progress, and anything waiting on me.

I manage this work through conversation with π and see its state reflected in the control center. It is a surface for inspecting ongoing activity; configuration happens through chat.

Instructions can live in Markdown. Schedules and event handling live in JSON. Daily stream processing is one example of work that can be configured this way.

## Inbox

The inbox holds things π thinks deserve my attention: discoveries, results, questions, and requests for help. It is represented through ordinary Markdown records that I can open and read.

How I engage with these items—what I open, act on, or leave alone—is part of the personal data the workspace captures. This helps π improve its judgment about what to surface.

## Personal data

My taste is expressed in how I wield my attention: when I dive deeper, when I move on, and what I return to.

The workspace records:

- **Expression:** the stream, conversations, and the creation, revision, and publication of artifacts.
- **Consumption:** what I encounter while browsing and how I scroll, select, and engage with it.
- **Attention:** how I move between documents, conversations, browser pages, and other activities.
- **Actions:** what I do, how I engage with the inbox, and the costs associated with my work.
- **π's work:** requests, actions, and outcomes within the workspace.

The record preserves timestamps, context, revisions, and who did what. Observations remain distinguishable from interpretations.

For example, a passage in the stream becomes a post: I select it, revise it, publish it, and return to writing. The useful record connects those moments and preserves the relevant versions.

Capturing the raw information matters now. As our ability to interpret it improves, we can derive better insights and train better personal models.

## Status

The first version needs the stream, documents, chat, both browser spaces, the command panel, scheduled and event-driven work, control center, inbox, and activity capture.

It should let me think, browse, create, and work with π while capturing the personal data this produces. Then, through the workspace, we can iterate on the workspace.

Specific workflows and command choices can be configured later. Privacy, publication, persistence, and additional instances of π are deferred. Raw keystroke capture is outside the initial scope.

Design follows this specification. Implementation follows design. The shared [design guidelines](../products/personal-site/DESIGN_GUIDELINES.md) apply.

Sources: [November 12](_nov-12-2026.md), [November 13](_nov-13-2026.md), and the workspace specification discussion.
