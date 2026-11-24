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
