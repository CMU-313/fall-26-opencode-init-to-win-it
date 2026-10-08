# User Guide

How to use and check the Init-to-Win-It student features. The course deliverable lives in this file at the repository root.

## Student mode: block file writes and shell commands

Owned by Dominic (`dominicGGG`), issue #6, merged in pull request #9.

### What it does

When student mode is on, the agent can still read and explain code. It cannot write files or run shell commands. `edit`, `write`, and `apply_patch` are denied through the edit permission, and `bash` is denied too.

### How to turn it on

Either:

1. Set `student_mode` to `true` in the project config, or
2. Set the environment variable `OPENCODE_STUDENT_MODE` to `1` or `true`.

If both are set, the config value wins. Setting `student_mode` to `false` turns the block off even when the environment variable is set.

### How to user-test

1. Turn student mode on with one of the options above.
2. Start opencode in a project and ask the agent to create or edit a file, or to run a shell command.
3. Confirm the write and shell tools are refused, and that reading or explaining a file still works.
4. Turn student mode off and confirm writes and shell commands are allowed again.

### Automated tests

File: `packages/opencode/test/agent/student-mode.test.ts`

From `packages/opencode`:

```bash
bun test test/agent/student-mode.test.ts
```

| Acceptance criterion | What the test checks |
|---|---|
| File writes are blocked | `merges denies after base so write/execute stay blocked` and `disables write/edit/apply_patch and bash tools via Permission.disabled` deny `edit`, `write`, and `apply_patch` |
| Shell commands are blocked | The same tests deny `bash` |
| Reading code still works | `does not deny read by itself` and the merge test keep `read` allowed |
| Student mode off leaves normal permissions alone | `is a no-op when student mode is off` |
| The mode can be enabled from the environment or from config | `reads provisional OPENCODE_STUDENT_MODE env` and `prefers explicit config.student_mode when Task 2 sets it` |

These tests use the same `StudentMode.enabled` and `StudentMode.apply` path that `packages/opencode/src/agent/agent.ts` uses when it builds agent permissions, so they cover the deny rules the running agent applies.

## Peer summary: compare your attempt with classmates

Owned by Dominic (`dominicGGG`), issues #15 and #26, merged in pull request #23.

### What it does

After you ask a question and turn in your own solution, the TA agent can call the `peer_summary` tool. The tool:

1. Saves a performance note in the shared class file. The default path is `.opencode/class-performance.json` in the workspace.
2. Compares your question count, attempt quality from 1 to 5, and stuck points with other students on the same assignment.
3. Returns a short summary and one improvement line.

Your own note is left out of the class average. A later note from the same student on the same assignment replaces the older one. The first note on an assignment says there is no class average yet. Notes from a different assignment are ignored.

### How to user-test

1. Use the TA agent in a project where `peer_summary` is available.
2. Ask a question, then give your own solution attempt.
3. Have the agent record a note with the assignment name, a stable student name, the question count, an attempt quality from 1 to 5, and the stuck points.
4. Record a second student on the same assignment. The summary should compare question count, attempt quality, and shared stuck points, and it should name one thing to review.
5. Record the same student again. The class file should keep only the newer note for that student on that assignment.
6. Record a note for a different assignment. It should not change the average for the first assignment.

A demo from the feature pull request is in `p2-evidence/screenshots/peer-summary-demo.png`.

### Automated tests

File: `packages/opencode/test/student/peer-performance.test.ts`

From `packages/opencode`:

```bash
bun test test/student/peer-performance.test.ts
```

| Acceptance criterion | What the test checks |
|---|---|
| The first note on an assignment has no class average | `says there is no class average when this student is first` |
| The summary compares question count, attempt quality, and stuck points | `compares question count, attempt quality, and shared stuck points` |
| The current student is left out of the average | That comparison builds the average from the other students only |
| Notes are saved in the shared class file | `stores the note and keeps one note per student on an assignment` |
| One note per student per assignment; a later note replaces the earlier one | The same test re-records Grace and expects a single updated note |
| Notes from other assignments do not affect this comparison | `ignores notes from other assignments when comparing classmates` |
| The summary includes one improvement line | `includes an improvement suggestion when peers exist` |

`peer_summary` calls `recordPerformance`, which calls `summarizeAgainstPeers`. These tests exercise that same code, so they cover the comparison the agent reports back to the student.

## Student mode lock: TA is the only agent

Owned by Vaishnavi (`vaishnavipalas`), issue #19, merged in pull requests #21 and #28.

### What it does

With `student_mode` on, TA is the only primary agent. Build and Plan are hidden, and any request for them (Tab, the API, old sessions) gets TA instead. Subagents still work.

### How to turn it on

Add this to `.opencode/opencode.json`:

```json
{ "student_mode": true }
```

The TA agent must exist at `.opencode/agents/TA.md`, or opencode shows an error.

### How to user-test

1. Turn on `student_mode` and run `bun dev`.
2. Confirm the prompt says **TA** and Tab doesn't switch agents.
3. Set `student_mode` to `false` and confirm Build and Plan come back.

### Automated tests

Files: `packages/opencode/test/agent/agent.test.ts` and `packages/opencode/test/session/prompt.test.ts`

```bash
bun test test/agent/agent.test.ts -t student_mode
bun test test/session/prompt.test.ts -t student_mode
```

| Acceptance criterion | Test |
|---|---|
| TA is the default, even over `default_agent` | `student_mode forces TA as the default agent over default_agent` |
| TA is the only agent you can pick | `student_mode leaves TA as the only selectable primary agent` |
| Requests for Build or Plan get TA | `student_mode resolves requests for other primary agents to TA` and `student_mode runs prompts for other primary agents as TA` |
| Subagents still work | `student_mode keeps subagents and internal agents available` |
| Missing TA gives an error | `defaultAgent throws when student_mode is enabled without a TA agent` |
| Flag off changes nothing | `student_mode off keeps other primary agents selectable` |

Every way of picking an agent goes through `Agent.get()`, and it's tested both directly and through a real prompt, so the lock is covered everywhere. The prompt test fails if the redirect to TA is removed.

## `/hint`: hints that get more detailed each time

Owned by Vaishnavi (`vaishnavipalas`), issues #20 and #29, merged in pull requests #22 and #30.

### What it does

Each `/hint` in a session gives more help, without giving code or the answer:

1. **Nudge**: guiding questions about where to look.
2. **Direction**: names the concept and gives one clue.
3. **Worked analogy**: an example on a different problem.

It stays at level 3 after that. `/hint new` starts over at level 1 for a new problem.

### How to user-test

1. Run `bun dev` and switch to **TA**.
2. Type `/hint <your question>`, then `/hint` twice. Replies should go Hint 1/3 → 2/3 → 3/3.
3. Type `/hint new <another question>`. It should go back to Hint 1/3.

### Automated tests

Files: `packages/opencode/test/command/hint.test.ts` and `packages/opencode/test/session/prompt.test.ts`

```bash
bun test ./test/command/hint.test.ts
bun test test/session/prompt.test.ts -t hint
```

| Acceptance criterion | Test |
|---|---|
| Levels go 1 → 2 → 3 and stay at 3 | `escalates one level per earlier hint and caps at level 3` and `hint command escalates one level per call and stays at the last level` |
| Each level sends a different instruction | `injects the instruction for the requested level` |
| No level gives code or the answer | `keeps the no-answer guardrails at every level` |
| `/hint new` starts over at level 1 | `starts over when the first word is new or reset, and drops that word` and `hint new starts the hint levels over at level 1` |
| Normal questions don't reset | `keeps escalating for any other arguments` |

The logic is tested by itself and through the real `/hint` command, and the end-to-end tests fail if escalation or reset is broken. Tests can't check how the model words its reply, so that part is checked with the user-test steps.

## Other team features

TA mode and assignment query stats are documented by the teammates who implemented them. A short TA-mode note also lives in `.opencode/UserGuide.md`.
