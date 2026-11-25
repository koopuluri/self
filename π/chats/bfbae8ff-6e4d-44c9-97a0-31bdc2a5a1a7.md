**you**

for the thread summary bubble that is placed above the response bubble when i select an open thread, what is the prompt that is generating that? i'm asking bec it is a summary if what has happened in the thread - which is vv different than the context i need. the context i need is to just remind me what i even asked that led to this thread in the first place. that is often different from the summary of the entire thread so far. so let's actualy discuss this diff and what we can do to improve this

> π: there’s no prompt run when you select the thread. if your latest message in that thread isn’t already in view, Stream shows the thread title and its saved summary. only if there’s no summary does it show what you last wrote.
> 
> the relevant instruction in `π/functions/update-thread/SKILL.md` is:
> 
> > Update this thread’s short, recognizable title, summary of verified progress, and what (if anything) the writer needs to do next. The writer owns archiving. Keep the summary useful when returning to the thread after time away.
> 
> the mismatch is in “useful when returning.” the prompt interprets that as “where did we leave off?” but before you read a response, your question is “what did i ask?” the first answer changes as work happens. the second should stay put. and putting a progress recap directly above the response makes you read two versions of what π did before you remember why.
> 
> i’d keep the progress summary for status and change what this bubble draws from. my first pass would be a quiet `you asked` label and your original words, with the response right below. no new model call. for a long ask, show the opening lines and let you expand; if the ask is already in view, skip the reminder.
> 
> the case i’d design around is a thread that starts with a substantial request and ends with “yep, do that.” the latest message is technically what π answered, but it’s a terrible reminder. i’d anchor the bubble to the request that started the thread, not the latest turn. if the conversation later changes direction, that’s a reason to show the follow-up alongside the original—not to let a rolling summary quietly replace it.

**you**

wyt?

> π: i’d add `human_context` alongside `summary` in the same `update-thread` call. i’d revise my earlier take: the reminder shouldn’t stay fixed on the first question. it should change when your ask changes, not when π makes progress.
> 
> i’d prompt it like this:
> 
> > π: In one or two sentences, remind the writer what they asked that this response is answering. Use their own terms. Include the original motivation only if it helps the current question make sense. If the latest message is shorthand like “yep, do that,” say what “that” refers to. Keep the previous reminder if the ask hasn’t changed. Don’t recap π’s work or give the answer.
> 
> for this thread, the bubble could read: “you want the bubble above a reply to remind you what you asked, not what π did. in a long thread, how should that reminder change as your question evolves?”
> 
> i’d give the update call the previous `human_context` and the actual exchange that led to the reply, rather than asking it to infer your intent from a progress summary. then selection just displays the saved field. no extra call or wait when you open the thread.

**you**

sure yea update whatever you need to update to make this work as we discussed. use your good judgement. all the best!

> π: the reminder above a reply now answers “what did i ask?” rather than “what has π done?” it uses your words, resolves shorthand like “yep, do that” from the exchange, and changes when your ask changes—not when π makes progress. the progress summary stays separate.
> 
> opening a thread makes no extra model call. if your ask is already visible, Stream skips the reminder. if there’s no saved reminder for that ask yet, it shows your message instead.
> 
> all 15 targeted tests passed. the π update is staged to start after current work finishes. quit Stream with ⌘Q and reopen it to use the new bubble.
