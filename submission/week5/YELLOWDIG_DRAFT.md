# Week 5 Yellowdig — draft

**Can an AI agent understand ActionReady well enough to recommend it, and where should it stop?**

This week I turned my class project, ActionReady, into the brand under test. I wanted to know what happens when
someone asks an AI assistant to find them a meeting follow-up tool, and whether the answer depends on how the
product describes itself.

**Experiment A: asking Gemini cold.** I asked twice, three times each. ActionReady appeared **0 times out of 6**.
Gemini named Otter.ai every time, along with Gong, Fireflies and Fellow. That is the correct result. ActionReady is a
private class project, so no model has seen it in training. Cold recall measures how well the public knows a product.
It does not measure how good the product is. This was the biggest AEO lesson for me: a product that agents cannot
find does not exist in an agent-driven market, however good it is.

**Experiment B: the agent reads the pages.** I gave Gemini four product pages: ActionReady and three *synthetic*
competitors. Tool A is transcription-first, Tool B automates follow-up, and Tool C is a task board. I wrote each
competitor to win a different kind of request. The prompts follow FOD (Filter, Objective, Delegation) and range from
"show me options" to "pick one for me". Gemini answers in strict JSON, and **code, not the AI, scores every answer**
against truth tables for all four products.

What I measured (copy-only pages, 11 valid runs):

* ActionReady was **recommended in 9 of 11 runs** (95% range 52–95%), and all **121 of 121** capability claims
  about it were correct.
* The prompt design changed the outcome. On an open "what's useful?" prompt, ActionReady was recommended **only 1 of 3
  times**, and the automated-follow-up tool won the others. Once the prompt mentioned capacity, approval or evidence,
  ActionReady won **8 of 8**. The filter in FOD matters more than the brand.
* **Negative control:** when the user wanted Zoom transcription and automatic sending, ActionReady was correctly
  **rejected in 4 of 4 runs**. A recommendation system that always picks your own product is not measuring anything.

**What I could not measure.** The plan was to compare plain copy with the same copy plus a structured profile, using
the same schema for all four products so that the extra structure was the only difference. Gemini's free-tier rate
limit failed 13 of the 30 calls, and almost all of the failures landed on the structured condition. That left only
1 valid run there. The dashboard says "insufficient evidence", and I am not claiming an improvement. Failed runs stay
failed, because retrying them inside a measurement would hide the problem. I have since slowed the pacing so a
re-run can finish.

**Delegation boundary.** The lab's agent can *recommend*, and that is all it can do. It cannot send, approve or
publish. This is the same rule as the rest of ActionReady, where a human approves every email.

I also published a public `/agent-profile.json`. It scores 100 of 100 on a deterministic readability rubric, which
shows it is complete. It does not yet show that agents use it.

**Question for the class:** if agents increasingly pick tools for us, should a product's machine-readable profile be
treated as marketing copy or as a claim it can be held to? How would you test it?

*Screenshots: the dashboard KPIs, before → after (insufficient), prompt sensitivity, the readability scorecard, and the
P08 negative control.*
