# Traceability: Kyle Luo (kyleluo)

**Target feature:** Session Stats (.opencode/command/stats.md, .opencode/plugin/session-stats.ts)

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | “negative steps or prompts or save to a file that doesn’t exist” (C1) | When /stats is run, negative values and missing assignment JSON files must be handled without corrupting the summary. | A negative prompt or metric value is rejected, and an assignment JSON file is created when it does not already exist. | No | Invariant | For any message sequence, prompt count, assistant step count, token counts, and cost are all greater than or equal to 0; missing assignment files are created and existing files remain valid JSON. | H1 |
| R2 | “Because it’s sending to a TA, if there’s no output, there’s no point in collecting it, so the assistant steps can be ignored. But the cost might be worth looking at.” (C3-C4) “I would want the prompt rollback to not count. But there’s no right or wrong answer. On the other side, even if it doesn’t change anything in the source code, it could count the tokens.” (S10-S11) | /stats should count the cost of cancelled prompts but should not count cancelled prompts in the prompt counter. | After a cancelled prompt is appended, total cost does not decrease and the prompt count does not increase. | Yes | Metamorphic | Appending a cancelled prompt never decreases cost and never changes the prompt count. | H3 |
| R3 | “Renaming the assignment…takes the aggregate of all the windows together.” (C5-C7) | A session may contain only one assignment summary; attempting to rename it in the same session must provide guidance to finish the current assignment or continue later. | When /stats is called with a different assignment name in a session that already has an assignment, it fails with: “Only one assignment per summary. Complete the assignment in one session terminal or press –continue to come back to the session later.” | No | Invariant | For any two distinct assignment names in one session, the second call fails with the exact message: “Only one assignment per summary. Complete the assignment in one session terminal or press –continue to come back to the session later.” | — (H5 survives) |
| R4 | “I might also want to see tokens instead of monetary cost” (C8) “Right now it’s just prompts and cost. Also I should know the model used…” (S4-5) | Add model information, including the model name and token usage, without relying on model resources. | The model name is included for every model, and token counts are included when available; otherwise the response displays “unavailable.” | No | Invariant | For any step data with or without token fields, output contains the model name and either token numbers or “unavailable.” | H2 |
| R5 | “Is there a reason for calling the model then? I think you could just have it call the plugin…” (O-3) | The stats plugin should be callable directly rather than only through a /stats command that invokes the model. | The plugin works without a /stats call, and the same statistics feature can be activated through another direct mechanism. | No | Invariant | Calling the plugin directly produces the same statistics as the equivalent /stats invocation without making a model call. | — (no property or mutant yet) |

Properties written or suggested by opencode or another AI tool: <list by requirement ID, or "none">

R1
R2
R3
R4

## Hand-written mutants

Predictions were recorded before running the property suite. Patches live in `mutants/kyleluo/` and are applied from the repository root with `git apply`.

| ID | Requirement targeted | Change | Predicted killer | Predicted result and reasoning | Actual result |
|---|---|---|---|---|---|
| H1 | R1 | `session-stats.ts`: cost no longer goes through `finiteNonNegative`; `part.cost ?? 0` only handles missing costs, so a negative or `NaN` cost flows into the total. | R1 "stats are never negative" (`expect(s.cost).toBeGreaterThanOrEqual(0)`) | Killed: the R1 generator includes negative integers and `NaN`, so `cost` becomes negative or `NaN`. | Killed by R1 and R2. R1 fails on the negative/`NaN` cost; R2 also fails because `NaN >= NaN` is false. |
| H2 | R1 | `session-stats.ts`: the reasoning-token sum drops `finiteNonNegative`; `part.tokens?.reasoning ?? 0` lets negative or `NaN` reasoning into `reasoningTokens`. | None predicted | Survives: the R1 property checks `inputTokens` and `outputTokens` but never checks `reasoningTokens` (or the cache tokens). | Killed by R4, not R1. The R4 token-line regex only accepts digits, so `reasoning=-...` or `reasoning=NaN` fails the output format. R1 still misses this. |
| H3 | R2 | `session-stats.ts`: cancellation detection compares the error name to `"MessageAborted"` instead of `"MessageAbortedError"`, so aborted prompts are not recognized. | R2 "cancelled prompts preserve prompt count and cost" (`after.prompts === before.prompts`) | Killed: the appended cancelled user message is no longer excluded, so the prompt count increases. | Killed by R2 as predicted; the prompt count changes after the cancelled prompt is appended. |
| H4 | R2 | `session-stats.ts`: cost sums only token-bearing step-finish parts (`tokenParts`) instead of all step-finish parts, so a cancelled step that has a cost but no token payload contributes nothing. | None predicted | Survives: the R2 property only checks that cost does not decrease. Ignoring the cancelled cost leaves cost equal to the old value, which satisfies `after.cost >= before.cost` even though the requirement says to count it. | Survived as predicted. The cancelled step's cost is silently dropped, but R2 only asserts `after.cost >= before.cost`. |
| H5 | R3 | `session-stats.ts`: `assignmentConflict` compares trimmed, lowercased names, so distinct names that differ only in case or surrounding whitespace no longer conflict. | None predicted | Survives: the R3 generator creates arbitrary distinct strings; it would need an `existing`/`requested` pair that normalizes to the same string, which is very unlikely. | Survived as predicted. The generator never produced a case-only or whitespace-only name pair. |
| H6 | R4 | `session-stats.ts`: `hasTokens` uses `steps.length` instead of `tokenParts.length`, so a session with steps but no token payload prints numeric zeroes instead of `"unavailable"`. | None predicted | Survives: the R4 regex accepts `tokens: input=\d+...`, and zero matches `\d+`; the property never ties availability to the presence of token data. | Survived as predicted. The output says `input=0, output=0, ...` where R4 requires `"unavailable"`. |

Run command: `cd packages/opencode && bun test test/student/session-stats.property.test.ts` (baseline: 4 pass, 0 fail). Each patch was applied from the repository root, the property file was run, and the source was reverted with `git checkout -- .opencode/plugin/session-stats.ts`.

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|----|-------------|--------|-----------|
| R4 | Model name is included for 100% of the models. Token count is included in the response for 90% of models. | Show the model name and tokens when the step data actually provides them, and show "unavailable" otherwise. | This is now a testable version of what the users wanted (seeing tokens instead of dollars, and to know the model). |
| R5 | Plugin works without /stats. | Stats are computed and written by the event hook (on session.idle), with no model call. /stats is removed. | /stats is a tool, so it HAS to call the model. This new requirement is just elaborating on how it will change. Furthermore, there was no need for the .json, since users did not mention they were going to use it even once in the interviews. Therefore, model invocation is unneeded. However, this is not implemented as it is the highest-cost fix out of the five new requirements. |

## Handwritten Mutants