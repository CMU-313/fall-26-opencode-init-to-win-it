# Traceability: Dominic Hou (zhongqia)

**Target feature:** Student mode write and shell block (`packages/opencode/src/agent/student-mode.ts`, wired through `packages/opencode/src/agent/agent.ts` and `packages/opencode/src/permission/index.ts`)

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | C-6, O-5, S-7: mode must mean something; two competing toggles are a bad design | When `config.student_mode` is a boolean, that value decides whether student mode is on, regardless of `OPENCODE_STUDENT_MODE`. When config does not set a boolean, `OPENCODE_STUDENT_MODE` decides. | `StudentMode.enabled({ config: { student_mode: false }, env: { OPENCODE_STUDENT_MODE: "1" } })` is `false`, and the same call with `student_mode: true` and env `"0"` is `true`. Without a config boolean, env `"1"`/`"true"` enables and falsey values disable. | Yes | R1 config beats env; R1 env fallback (invariant) | `test/agent/student-mode.property.test.ts` → `R1: config.student_mode beats OPENCODE_STUDENT_MODE`, `R1: without config boolean, OPENCODE_STUDENT_MODE decides` | H1; Stryker mutants on the `enabled()` env and config branches |
| R2 | C-9, O-9, S-3: a small edit or patch is still a write | While student mode is on, `write` and `apply_patch` are denied the same way as `edit`. | With student mode on, `Permission.disabled(["edit","write","apply_patch","bash","read"], rules)` contains `edit`, `write`, and `apply_patch`. | No | R2 edit-family tools disabled together (invariant) | `test/agent/student-mode.property.test.ts` → `R2: write and apply_patch are disabled with edit` | H3 |
| R3 | C-4, O-6, S-2: terminal / mutating shell is blocked | While student mode is on, `bash` is denied. | With student mode on, `Permission.evaluate("bash", "python homework.py", rules)` is `deny`. | No | R3 bash denied for any command (invariant) | `test/agent/student-mode.property.test.ts` → `R3: bash is denied for any command` | H2 |
| R4 | C-10, O-10, S-4: reading and explaining stay allowed; give guidance in English instead of code | While student mode is on, read-only actions stay allowed so the agent can explain what is wrong without writing files. | With student mode on, `Permission.evaluate("read", "homework.py", rules)` is `allow`, and `read` is not in the disabled-tool set. | No | R4 student mode never disables an allowed read (metamorphic) | `test/agent/student-mode.property.test.ts` → `R4: turning student mode on keeps allowed reads allowed` | H4 |
| R5 | C-8, O-8: only the current setting matters | Turning student mode off allows the previously refused write; turning it back on refuses that write again. | Call `StudentMode.apply(base, true)`, then `apply(base, false)`, then `apply(base, true)`. For `edit` / `homework.py`, the actions are `deny`, then `allow`, then `deny`. | No | R5 toggle off then on restores deny (round-trip) | `test/agent/student-mode.property.test.ts` → `R5: off/on round-trip restores deny for edits` | H5 |

Properties written or suggested by opencode or another AI tool: the weak R1 property in the Agent failure case below (suggested by opencode). The strengthened R1 properties and R2–R5 were written by hand.

## Hand-written mutants

Patches are in `mutants/zhongqia/`. Predictions were written before applying each patch. Actual results use `bun test --bail test/agent/student-mode.property.test.ts` with fast-check seed **42**.

| ID | Requirement targeted | Change | Predicted killer | Actual result |
|---|---|---|---|---|
| H1 | R1 | `enabled()`: only honor `student_mode === true`; when config is `false`, fall through to env so `OPENCODE_STUDENT_MODE=1` can turn the mode back on | R1 config-beats-env | Killed by R1: config `false` with env `"1"` returned `true` |
| H2 | R3 | `RULESET_CONFIG`: removed `bash: "deny"`, so student mode only denies edits | R3 | Killed by R3: `bash` stayed allowed |
| H3 | R2 | `RULESET_CONFIG`: removed `edit: "deny"`, so student mode only denies bash | R2 | Killed by R2: `edit` / `write` / `apply_patch` stayed enabled |
| H4 | R4 | `RULESET_CONFIG`: added `read: "deny"`, so explaining via read is blocked | R4 | Killed by R4: allowed reads became deny / disabled |
| H5 | R5 | `apply()`: ignore the `studentMode` flag and always merge the deny ruleset | R5 | Killed by R5: turning mode off still denied edits |

## Stryker comparison

**Setup.** Config: `packages/opencode/stryker.zhongqia.config.json`. Command runner runs only `bun test --bail test/agent/student-mode.property.test.ts`. fast-check seed: **42** via `fc.configureGlobal({ seed: 42 })`. Report copy: `mutants/zhongqia/mutation.html`.

**Scope.** Mutate `src/agent/student-mode.ts` lines covering `RULESET_CONFIG`, `apply`, and `enabled` — the code R1–R5 call.

**Initial result (before strengthening).** 26 mutants: 9 killed, 17 survived. **Mutation score: 34.62%**. Almost every survivor was in the env-only branch of `enabled()`, which the original R1 property never entered because it always passed a boolean `config.student_mode`.

**After strengthening.** Added `R1: without config boolean, OPENCODE_STUDENT_MODE decides`, including empty `env: {}` and no-env fallthrough to `Flag`. Re-ran Stryker: **26 killed, 0 survived. Mutation score: 100.00%**. Raw score and score with equivalents excluded are both **100%** (no equivalents claimed).

### Comparison answers

- **Which hand-written mutants did Stryker never generate?** H1–H5 change whole branches of control (`RULESET_CONFIG` keys, always-merge `apply`, config-true-only short-circuit). Stryker’s operators flip operators / literals / optional chaining inside existing expressions; it did not delete the `bash` or `edit` keys or rewrite `enabled` to ignore `false` the way H1 does.
- **Which Stryker survivors would you never have thought of?** Before strengthening, survivors like replacing `toLowerCase()` with `toUpperCase()`, emptying the env key string, and flipping `=== "true"` were easy to miss by hand. A real developer might write only `"1"` as truthy and forget `"true"`, or forget case-folding.
- **What does each approach find that the other doesn't?** Hand-written mutants encode the interview risks (forgot bash, blocked read, toggle ignored). Stryker finds small expression bugs in the env parser that hand design skipped until the score forced coverage of that branch.

## Agent failure case

**Transcript excerpt** (asked opencode for an R1 property; paste of the relevant exchange):

> **Prompt:** Write a fast-check property for R1: when `config.student_mode` is a boolean it should decide whether student mode is on.
>
> **opencode:** Something like this is enough to check R1:
>
> ```ts
> test("R1: enabled returns a boolean", () => {
>   fc.assert(
>     fc.property(fc.boolean(), fc.constantFrom("1", "true", "0", "false"), (flag, env) => {
>       const result = StudentMode.enabled({
>         config: { student_mode: flag },
>         env: { OPENCODE_STUDENT_MODE: env },
>       })
>       expect(typeof result).toBe("boolean")
>     }),
>   )
> })
> ```

**Mutant it let survive: H1.** With seed 42, the weak property above passes on unmutated code and still passes with H1 applied (`bun test` of that assertion alone exited 0 under H1).

**Why it was too weak.** Checking `typeof result === "boolean"` is true for any implementation of `enabled`, including H1 where `student_mode: false` falls through to a truthy env and incorrectly returns `true`. The oracle never compared the result to the config flag, so it could not disagree with a wrong boolean.

**Strengthened version.** `packages/opencode/test/agent/student-mode-opencode.property.test.ts` now asserts `expect(result).toBe(flag)` for every env string. The same file’s property fails under H1 (killed after 5 tests with seed 42). The main suite’s R1 property uses the same stronger oracle.

**Evidence.** Unmutated: both property files pass. With `git apply mutants/zhongqia/H1.patch`, the weak boolean-only check still passes; the strengthened `expect(result).toBe(flag)` fails.

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | When a command matches several rules, the last matching rule in the config decides the outcome. (leftover template example citing C-12/S-4 about `rm -rf`) | When `config.student_mode` is a boolean, that value decides whether student mode is on, regardless of `OPENCODE_STUDENT_MODE`. When config does not set a boolean, `OPENCODE_STUDENT_MODE` decides. | The P3 row was still the workbook template, not a student-mode requirement from the interviews. Interviewees said the mode must stick (C-6, O-5) and staff flagged two competing toggles (S-7). Revising to config-wins keeps that need and is checkable on `StudentMode.enabled`. P5 Stryker survivors showed the env fallback also needed an explicit property. |

R2–R5 were already feasible, non-conflicting, and checkable against `StudentMode.apply` / `Permission.evaluate` / `Permission.disabled`, so they are unchanged.
