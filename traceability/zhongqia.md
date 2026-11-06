# Traceability: Dominic Hou (zhongqia)

**Target feature:** Student mode write and shell block (`packages/opencode/src/agent/student-mode.ts`, wired through `packages/opencode/src/agent/agent.ts` and `packages/opencode/src/permission/index.ts`)

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test |
|---|---|---|---|---|---|---|
| R1 | C-6, O-5, S-7: mode must mean something; two competing toggles are a bad design | When `config.student_mode` is a boolean, that value decides whether student mode is on, regardless of `OPENCODE_STUDENT_MODE`. | `StudentMode.enabled({ config: { student_mode: false }, env: { OPENCODE_STUDENT_MODE: "1" } })` is `false`, and the same call with `student_mode: true` and env `"0"` is `true`. | Yes | R1 config beats env (invariant) | `test/agent/student-mode.property.test.ts` → `R1: config.student_mode beats OPENCODE_STUDENT_MODE` |
| R2 | C-9, O-9, S-3: a small edit or patch is still a write | While student mode is on, `write` and `apply_patch` are denied the same way as `edit`. | With student mode on, `Permission.disabled(["edit","write","apply_patch","bash","read"], rules)` contains `edit`, `write`, and `apply_patch`. | No | R2 edit-family tools disabled together (invariant) | `test/agent/student-mode.property.test.ts` → `R2: write and apply_patch are disabled with edit` |
| R3 | C-4, O-6, S-2: terminal / mutating shell is blocked | While student mode is on, `bash` is denied. | With student mode on, `Permission.evaluate("bash", "python homework.py", rules)` is `deny`. | No | R3 bash denied for any command (invariant) | `test/agent/student-mode.property.test.ts` → `R3: bash is denied for any command` |
| R4 | C-10, O-10, S-4: reading and explaining stay allowed; give guidance in English instead of code | While student mode is on, read-only actions stay allowed so the agent can explain what is wrong without writing files. | With student mode on, `Permission.evaluate("read", "homework.py", rules)` is `allow`, and `read` is not in the disabled-tool set. | No | R4 student mode never disables an allowed read (metamorphic) | `test/agent/student-mode.property.test.ts` → `R4: turning student mode on keeps allowed reads allowed` |
| R5 | C-8, O-8: only the current setting matters | Turning student mode off allows the previously refused write; turning it back on refuses that write again. | Call `StudentMode.apply(base, true)`, then `apply(base, false)`, then `apply(base, true)`. For `edit` / `homework.py`, the actions are `deny`, then `allow`, then `deny`. | No | R5 toggle off then on restores deny (round-trip) | `test/agent/student-mode.property.test.ts` → `R5: off/on round-trip restores deny for edits` |

Properties written or suggested by opencode or another AI tool: none

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | When a command matches several rules, the last matching rule in the config decides the outcome. (leftover template example citing C-12/S-4 about `rm -rf`) | When `config.student_mode` is a boolean, that value decides whether student mode is on, regardless of `OPENCODE_STUDENT_MODE`. | The P3 row was still the workbook template, not a student-mode requirement from the interviews. Interviewees said the mode must stick (C-6, O-5) and staff flagged two competing toggles (S-7). Revising to config-wins keeps that need and is checkable on `StudentMode.enabled`. |

R2–R5 were already feasible, non-conflicting, and checkable against `StudentMode.apply` / `Permission.evaluate` / `Permission.disabled`, so they are unchanged.
