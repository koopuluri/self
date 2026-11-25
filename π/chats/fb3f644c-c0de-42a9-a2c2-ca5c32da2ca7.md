**you**

also for the prev msg, the recap msg wasnt' setn even though the the prev msg wasn't in view, what is the logic to determine when to show the recap bubble?

> π: Stream only checks whether to show a recap when you click a thread in the left pane. if π’s reply arrives inline, there’s no recap check, even if your question has scrolled offscreen.
> 
> on a pane click, Stream checks your latest message in that thread, not π’s previous reply. it checks before scrolling to the reply. if even one pixel of your message bubble overlaps the editor viewport, Stream counts it as visible and skips the recap. if the whole bubble is offscreen, Stream should show the recap.
> 
> Stream doesn’t save what was visible at click time, so i can explain the rule but can’t verify what it saw for that reply.
