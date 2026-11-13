# Traceability: Kyle Luo (kyleluo)

**Target feature:** Session Stats (.opencode/command/stats.md, .opencode/plugin/session-stats.ts)

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | “negative steps or prompts or save to a file that doesn’t exist” (C1) | When /stats is run, negative values and missing assignment JSON files must be handled without corrupting the summary. | A negative prompt or metric value is rejected, and an assignment JSON file is created when it does not already exist. | No | Invariant | For any message sequence, prompt count, assistant step count, token counts, and cost are all greater than or equal to 0; missing assignment files are created and existing files remain valid JSON. | H1 |
| R2 | “Because it’s sending to a TA, if there’s no output, there’s no point in collecting it, so the assistant steps can be ignored. But the cost might be worth looking at.” (C3-C4) “I would want the prompt rollback to not count. But there’s no right or wrong answer. On the other side, even if it doesn’t change anything in the source code, it could count the tokens.” (S10-S11) | /stats should count the cost of cancelled prompts but should not count cancelled prompts in the prompt counter. | After a cancelled prompt is appended, total cost does not decrease and the prompt count does not increase. | Yes | Metamorphic | Appending a cancelled prompt never decreases cost and never changes the prompt count. | H2 |
| R3 | “Renaming the assignment…takes the aggregate of all the windows together.” (C5-C7) | A session may contain only one assignment summary; attempting to rename it in the same session must provide guidance to finish the current assignment or continue later. | When /stats is called with a different assignment name in a session that already has an assignment, it fails with: “Only one assignment per summary. Complete the assignment in one session terminal or press –continue to come back to the session later.” | No | Invariant | For any two distinct assignment names in one session, the second call fails with the exact message: “Only one assignment per summary. Complete the assignment in one session terminal or press –continue to come back to the session later.” | — (H4 survives) |
| R4 | “I might also want to see tokens instead of monetary cost” (C8) “Right now it’s just prompts and cost. Also I should know the model used…” (S4-5) | Add model information, including the model name and token usage, without relying on model resources. | The model name is included for every model, and token counts are included when available; otherwise the response displays “unavailable.” | No | Invariant | For any step data with or without token fields, output contains the model name and either token numbers or “unavailable.” |  |
| R5 | “Is there a reason for calling the model then? I think you could just have it call the plugin…” (O-3) | The stats plugin should be callable directly rather than only through a /stats command that invokes the model. | The plugin works without a /stats call, and the same statistics feature can be activated through another direct mechanism. | No | Invariant | Calling the plugin directly produces the same statistics as the equivalent /stats invocation without making a model call. | |

Properties written or suggested by opencode or another AI tool: <list by requirement ID, or "none">

R1
R2
R3
R4

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|----|-------------|--------|-----------|
| R4 | Model name is included for 100% of the models. Token count is included in the response for 90% of models. | Show the model name and tokens when the step data actually provides them, and show "unavailable" otherwise. | This is now a testable version of what the users wanted (seeing tokens instead of dollars, and to know the model). |
| R5 | Plugin works without /stats. | Stats are computed and written by the event hook (on session.idle), with no model call. /stats is removed. | /stats is a tool, so it HAS to call the model. This new requirement is just elaborating on how it will change. Furthermore, there was no need for the .json, since users did not mention they were going to use it even once in the interviews. Therefore, model invocation is unneeded. However, this is not implemented as it is the highest-cost fix out of the five new requirements. |

## Hand-written mutants

| ID | Requirement targeted | Change | Predicted killer | Predicted result and reasoning | Actual result |
|---|---|---|---|---|---|
| H1 | R1 | `session-stats.ts`: cost no longer goes through `finiteNonNegative`, so a negative or `NaN` cost comes in to the total. | R1 "stats are never negative" | Killed: the R1 generator includes negative integers and `NaN`, so `cost` becomes negative or `NaN`. | Killed by R1 and R2. R1 fails on the negative/`NaN` cost; R2 also fails because `NaN >= NaN` is false. |
| H2 | R2 | `session-stats.ts`: cancellation detection compares the error name to `"MessageAborted"` instead of `"MessageAbortedError"`. | R2 "cancelled prompts preserve prompt count and cost" (`after.prompts === before.prompts`) | Killed: Prompt count increases now that it can't tell an error occured (and cancel happened). | Killed by R2 |
| H3 | R2 | `session-stats.ts`: cost sums only parts that had tokens (`tokenParts`) instead of all step-finish parts, so a cancelled step that has a cost but no tokens contributes nothing to the overall cost. | None predicted | Survives, because the R2 property only checks that cost does not decrease after a cancelled prompt. `after.cost >= before.cost` makes this mutant fine, even though the requirement says to count it. | Survived. |
| H4 | R3 | `session-stats.ts`: `assignmentConflict` compares trimmed, lowercased names, so distinct names that differ only in case or surrounding whitespace no longer conflict. | None predicted | Survives because the R3 generator creates arbitrary distinct strings. | Survived, because the generator produced values that are too unsimilar. |
| H5 | R4 | `session-stats.ts`: `hasTokens` uses `steps.length` instead of `tokenParts.length`, so a session with steps but no token payload prints numeric zeroes instead of `"unavailable"` like specified in R4. | None predicted | Survives, because the R4 regex accepts 0s even when there's no actual token data. | Survived as predicted, because the output says `input=0, output=0, ...` whereas R4 requires `"unavailable"`. |

Commands: `cd packages/opencode && bun test test/student/session-stats.property.test.ts` 
Reverted with `git checkout -- .opencode/plugin/session-stats.ts`.

## Stryker Comparison

**Run:** `packages/opencode/node_modules/.bin/stryker run packages/opencode/stryker.kyleluo.config.json` from the repository root. The config mutates only `.opencode/plugin/session-stats.ts` and runs only `packages/opencode/test/student/session-stats.property.test.ts`.

**Mutation score:** 43.17% — 60 killed, 79 survived, 0 timeout, 0 no-coverage, 0 errors across 139 mutants.

**Seed:** not fixed in the pasted run. Before the final submission, add `fc.configureGlobal({ seed: 42 })` to the property test and re-run so this score is reproducible.

**Which of your hand-written mutants did Stryker never generate? Why not?**

Stryker did not generate any of H1–H5 exactly. Its mutation operators make local syntax edits; the hand-written mutants make semantic substitutions:

- **H1** replaces `finiteNonNegative(part.cost)` with `part.cost ?? 0`. Stryker mutates the condition inside `finiteNonNegative`, but it does not replace a helper call with a different expression.
- **H2** changes the error string from `"MessageAbortedError"` to `"MessageAborted"`. Stryker's string-literal operator only blanks strings (`""`); it does not invent another non-empty string.
- **H3** changes the cost reducer from `steps` to `tokenParts`. Stryker does not swap one variable for another.
- **H4** adds `.trim().toLowerCase()` to both sides of the assignment comparison. Stryker does not synthesize method calls or method chains.
- **H5** changes `tokenParts.length` to `steps.length`. This is another cross-variable substitution, so Stryker does not generate it.

Stryker therefore covers "what local syntax can I flip?" while the hand-written mutants cover "what semantic mistake would a developer plausibly make?"

**Which Stryker survivors would you never have thought of? Are any of them bugs a real developer might plausibly write?**

Yes. The most interesting survivors are real-looking mistakes:

- **`assignmentConflict`, line 8 (`&&` → `||`)**: `existing !== undefined || existing !== requested` returns the conflict message when a session has no assignment yet, because `existing !== requested` is true for `undefined`. A one-character typo would break the first `/stats` call in a fresh session. R3 only generates two defined, distinct names, so it never exercises `existing === undefined`.
- **`assignmentConflict`, line 8 (`existing !== requested` → `true`)**: this always conflicts when an assignment exists, even when the name is unchanged. R3 only checks the renamer case, not rerunning with the same name.
- **`steps = parts.filter(...)` mutants, line 42**: `steps = parts` and `steps = parts.filter(() => true)` make every part count as an assistant step. The output then reports inflated step and cost totals. No property asserts that only `step-finish` parts are counted; R1 only checks that the result is non-negative.
- **Optional chaining removals, lines 66–70**: `part.tokens.cache.read` assumes a token payload always has a `cache` object. The generator always supplies `cache` when `tokens` exists, so the property never reaches a tokens object without cache; real provider data could omit it and crash.
- **`hasTokens` mutants, line 85**: `true` and `tokenParts.length >= 0` always take the token-number branch and print `input=0, output=0, ...` instead of `"unavailable"`. That directly violates R4, but the R4 regex accepts zeroes.
- **`message.parts.every` → `.some` / removing the `!`, line 54**: a user message with both synthetic and real parts changes from counted to not counted (or vice versa). This is a classic "every vs. some" error, and none of the properties assert the prompt count on arbitrary sessions.
- **`finiteNonNegative` `false ? value : 0`, line 38**: this turns every metric into zero. R1 only lower-bounds the metrics and R4 accepts zero token values, so neither property notices. The `value >= 0` → `value > 0` survivor is different: it is equivalent, because a value of exactly zero produces `0` either way.

The large number of survivors in `formatSessionStats` string labels and in the event/tool wiring also shows the limits of scoping Stryker to the pure property tests: those properties never assert exact labels or exercise the plugin hook/tool plumbing.

**What does each approach find that the other doesn't?**

Hand-written mutants find requirement-level semantic bugs: wrong error string, wrong variable, helper bypass, case normalization, and other mistakes a reviewer can imagine a person making. They can target an exact acceptance criterion, but they are slow to design and only cover the cases we thought of.

Stryker finds local implementation diversity at scale: condition flips, operator swaps, optional-chaining removal, string literal changes, and whole-statement/object removals. It found the uncovered `existing === undefined` branch, the step-filter gap, the missing-cache crash, and the weak `hasTokens` assertion. It also produces many equivalent or irrelevant mutants because it does not know the requirements, and scoping it to pure property tests leaves the event/tool plumbing largely unexercised. Neither approach replaces the other: hand-written mutants test whether the requirement is captured; Stryker tests whether the implementation is pinned down.




