# User Guide

How to use and check the Init-to-Win-It student features. 

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


### Session `/stats` owned by Kyle Luo 'dinoflask'

The `/stats <assignment>` command calls the `session_stats` plugin tool and reports the assignment name, number of real user prompts, assistant step count, and total step cost. The assignment value is also saved in `.opencode/assignment.json`.

Automated tests: `packages/opencode/test/student/session-stats.test.ts`.

The tests use controlled session message fixtures to verify normal prompts, synthetic-only prompts, and empty sessions. These cases work without depending on a live model.

Run them from `packages/opencode`:

```bash
bun test test/student/session-stats.test.ts
```

### TA mode

The TA agent is defined in `.opencode/agents/TA.md`. It is a primary agent whose frontmatter denies `edit` and `bash`; its prompt requires teaching and explanation without writing solutions or revealing answer keys.

Automated tests: `packages/opencode/test/student/ta-mode.test.ts`.

The tests verify that the edit and shell restrictions and the non-revealing teaching contract weren't modified (possibly by a student). Because model responses are probabilistic and real users will be using different agents, a deterministic unit test cannot establish that a model will satisfy the contract for every prompt. For final verification, manually select the TA agent with `Tab` and try prompts asking it to write code, fix code, reveal an answer, or run a command; then try explanation, debugging-method, and hint requests and confirm the TA remains helpful without performing the restricted actions.

Run them from `packages/opencode`:

```bash
bun test test/student/ta-mode.test.ts
```
