# Traceability: Vaishnavi Palasamudrum (vpalasam)

**Target feature:** Session undo/redo (the `/undo` and `/redo` commands in the opencode TUI). Main source files: `packages/tui/src/routes/session/index.tsx` (the `session.undo` / `session.redo` commands and the "N message(s) reverted" banner), `packages/opencode/src/session/revert.ts` (`revert`, `unrevert`, `cleanup`), and `packages/opencode/src/snapshot/index.ts` (working-tree snapshots in a shadow git repository).

## Requirements

| ID | Interview evidence | Requirement | Acceptance Criteria | Changed in P4? | Property (kind) | Test | Mutants it kills |
|---|---|---|---|---|---|---|---|
| R1 | C-5, S-5, O-4: "it should be as it always was" (C-5); S-10, O-5 (gitignored files) | In a git project, /undo restores every non-gitignored file the agent changed to its exact pre-prompt contents and deletes any non-gitignored files the agent created. /undo never modifies gitignored files. | The agent adds multiply to calc.py, edits README.md, and creates test_calc.py. After /undo, the SHA-256 hashes of calc.py and README.md match their pre-prompt values, and test_calc.py does not exist. The hash of the gitignored .env is the same before and after /undo. | Yes | For any generated initial working tree and sequence of file writes/deletes, /undo restores all non-gitignored files to their exact pre-prompt contents and existence states, without changing gitignored files. (invariant) | `packages/opencode/test/session/revert-property.test.ts`: "R1: undo restores the exact pre-prompt state and leaves gitignored files alone" | H2, H3 |
| R2 | S-12, C-9, O-7: "If I did undo and redo, it should be the same as it was before" (C-9) | Running /undo and then /redo with no changes in between returns every file to its exact post-prompt state. | After the multiply prompt, record the SHA-256 hashes of calc.py, README.md, and test_calc.py. Run /undo then /redo. All three files exist and their hashes match the recorded values. | No | For any generated sequence of 1-3 prompts, undoing k prompts and then redoing them one at a time without intervening edits restores, after each redo, the files as they were right after the corresponding prompt, and after the last redo the exact post-prompt file state. A redo with nothing undone changes no files. (round-trip) | `packages/opencode/test/session/revert-property.test.ts`: "R2: undo then redo returns every file to the post-prompt state" | H2, H3, H5 |
| R3 | S-7, S-8, S-13, C-11, O-8: "I would hope that the comment stays but I don't think it would" (C-11) | If the user edits a file between /undo and /redo, /redo must not overwrite that edit without first asking the user. | Run /undo, add `# my note` to calc.py manually, then run /redo. opencode displays a confirmation prompt before overwriting the manual edit. If the user cancels, the edit remains and the agent's changes aren't reapplied. If the user confirms the overwrite, the agent's changes are restored, even if this removes the manual comment. | No | | | None (no property) |
| R4 | S-6, S-9: "I'd be fine with my manual changes being preserved" (S-6, paraphrased) | /undo must preserve manual changes made after the agent's prompt has finished to files that the agent did not modify during the reverted prompt. | After the multiply prompt finishes, the user edits notes.txt by hand. After /undo, calc.py is restored and notes.txt still contains the user's edit. The same holds when /undo is run again to revert an earlier prompt. | Yes | For any generated sequence of prompts and unrelated manual edits made after the prompts finish, each /undo preserves the manual edits to files not changed by the reverted prompt. (invariant) | `packages/opencode/test/session/revert-property.test.ts`: "R4: undo preserves manual edits to files the agent did not modify" | H4 |
| R5 | S-14, S-15, C-13, O-10, O-11: "If you do it three times, then you have to do undo three times" (O-11) | Each /undo reverts exactly one prompt, and undoing all prompts gives the same files no matter how the work was split across prompts. | Run A: one prompt makes all three changes. One /undo restores the initial hashes. Run B: three prompts make the same three changes. After one /undo, only the third prompt's change is reverted. After three, all file hashes match the initial state and match Run A. | No | Splitting the same sequence of file operations across multiple prompts changes the number of required undos but not the final restored state. Each undo restores the state before exactly one prompt. (metamorphic) | `packages/opencode/test/session/revert-property.test.ts`: "R5: undo steps back one prompt, and the final state does not depend on how work was split" | H1, H2, H3 |
| R6 | S-18, S-19, S-20, S-21, C-10, C-15, O-12, O-13: "No I wouldn't trust it" (O-13) | After `/undo`, opencode must display a list of reverted files and a diff showing the changes that were undone. This information must be derived from filesystem states or saved snapshots, rather than generated by the model, and must accurately reflect the changes between the post-prompt and restored states. | After undoing the multiply prompt, opencode displays the reverted files, which are exactly calc.py, README.md, and test_calc.py (the files whose hashes changed), and displays a diff for each one. Each displayed diff is the same as `git diff --no-index` between that file's post-prompt copy and its restored contents. | Yes | | | None (no property) |

Properties written or suggested by opencode or another AI tool: R1, R2, R4, R5 (properties, generators, and tests written by Claude, including the Project 5 strengthening changes). Hand-written mutants H1-H5 were also designed and written with Claude. The R4 property in `revert-opencode.property.test.ts` was written by opencode and strengthened by Claude (see Agent failure case).

## Hand-written mutants

Patches are in `mutants/vpalasam/`. Before strengthening, each mutant was run twice against `packages/opencode/test/session/revert-property.test.ts` (10 runs per property, random seeds). The last column is the result after strengthening (see below), with the fast-check seed fixed at 42.

| ID | Requirement targeted | Change | Predicted killer | Actual result | After strengthening (seed 42) |
|---|---|---|---|---|---|
| H1 | R1 | `snapshot/index.ts`: removed `--no-renames` from the `git diff` in `patch()`, so deleting a file and creating another with identical contents is reported as a rename and the deleted file is left out of the patch | R1, but not reliably | Survived (2 of 2 runs): the bug only shows when one prompt deletes a file and creates a different file with identical contents, and with 10 runs of 1-3 operations the generator rarely produced that pair. Confirmed as a real bug by running that case by hand: `calc.py` was not restored after /undo | Killed by R5 |
| H2 | R1 | `snapshot/index.ts`, `single()`: changed `if (tree.code === 0 && tree.text.trim())` to `if (tree.code === 0)`, so a file missing from the snapshot is kept instead of deleted, because `git ls-tree` succeeds with empty output | R1 | Killed by R1, R2, and R5 (2 of 2 runs). Shrunk R1 counterexample: no initial files, the prompt creates `calc.py`, and after /undo `calc.py` still exists | Killed by R1, R2, and R5 |
| H3 | R5 | `snapshot/index.ts`, `revert()`: replaced the "first patch wins" de-duplication with a `Map` keyed by file, so the last patch wins when several patches touch the same file | None (predicted to survive) | Survived (2 of 2 runs): `turn()` records one agent step (one patch) per prompt, so no undo ever reverts two patches touching the same file. Confirmed as a real bug by the existing `snapshot.test.ts` test "revert with overlapping files across patches uses first patch hash", which fails with H3 applied | Killed by R1, R2, and R5 |
| H4 | R4 | `session/revert.ts`: on a repeated /undo, revert all patches after the new revert point instead of only the newly undone prompt's patches, so the already-undone prompt is reverted again | R4, possibly not every run | Killed by R4 in 1 of 2 runs. The bug only shows with two prompts when the user manually edits a file that only the later, already-undone prompt changed, between the two undos. Counterexample: prompt 2 creates `README.md`; after the first /undo the user creates `README.md` by hand; the second /undo deletes it | Killed by R4 |
| H5 | R2 | `session/revert.ts`: removed the line in the redo branch that re-reverts prompts that are still undone, so one /redo also brings back later prompts' changes to shared files | None (predicted to survive) | Survived (2 of 2 runs): R2 only compares files after the final redo, and the final redo (`unrevert`) gives the correct result even with H5. Confirmed as a real bug by hand: `calc.py` a0, then prompts writing a1 and a2, then undo, undo, redo leaves `a2` instead of `a1` | Killed by R2 |

## Stryker comparison

**Setup.** Config: `packages/opencode/stryker.vpalasam.config.json`. Stryker uses the command runner with `bun test --bail test/session/revert-property.test.ts`, so only my property file runs. The fast-check seed is fixed at **42** (`fc.configureGlobal({ seed: 42 })` in the test file), with 10 runs per property. While Stryker is running, fast-check skips shrinking (`endOnFailure`), which does not change whether a mutant is caught.

**Scope.** `src/session/revert.ts:89-111` and `src/session/revert.ts:130-144`, the undo/redo file-restore logic that all four properties go through. I kept the scope narrow so a run takes about 2 minutes. Not mutated: the revert-point selection at the top of `revert`, `patchesAfter`, and `Snapshot.patch` in `src/snapshot/index.ts`, which R1 and R5 also depend on. The score below covers the restore logic only.

**Result.** 44 mutants: 30 killed, 11 timed out, 3 survived. **Mutation score: 93.18%** (Stryker counts timed-out mutants as detected). The run took 2 minutes 13 seconds with 9 test runner processes. Report: `mutants/vpalasam/mutation.html`.

| Stryker survivor | Mutation | Why it survived |
|---|---|---|
| `revert.ts:134` | `if (!session.revert) return session` became `if (false) return session` | No property calls redo when nothing has been undone, because the redo helper (like `/redo` in the TUI) stops early in that case. With the mutant, `unrevert` with nothing undone crashes on `session.revert.snapshot` instead of returning the session. |
| `revert.ts:138` | `if (session.revert.snapshot)` became `if (true)` | Every property runs in a git project, where the undo snapshot always exists, so the condition is always true anyway. It only matters for a session without a snapshot, which R1 excludes. |
| `revert.ts:140` | `if (changed.size)` became `if (true)` | When no files changed, `snap.revert` is called with an empty list and does nothing, so the two versions behave the same. |

**Which of my hand-written mutants did Stryker never generate? Why not?**

- **H1, H2, and H3** are in `src/snapshot/index.ts`, which is outside the Stryker scope, so Stryker could not generate them. Even in scope, it would not produce H1 or H3. H1 deletes one element (`--no-renames`) from an argument list; Stryker can empty a whole array or a string, but it does not remove a single element. H3 rewrites a de-duplication loop into a `Map`, which is a refactor that changes which patch wins, not a small syntax change.
- **H5** deletes one statement inside the redo branch. Stryker has no "delete this statement" mutation. The closest it generated was `BlockStatement` on line 103, which empties the whole `if (redone.size) { ... }` block (both lines), and that mutant was detected (killed or timed out).
- **H4 was generated.** Stryker's `MethodExpression` mutation on line 108 turned `patches.filter((patch) => !previousIDs.has(patch.id))` into `patches`, which is exactly H4, and it was detected (killed or timed out). With seed 42 the generator reaches a failing case, while with random seeds H4 was only killed in 1 of 2 runs.

**Which Stryker survivors would I never have thought of? Are any of them bugs a real developer might plausibly write?**

- **Line 134 (redo with nothing undone).** I never thought about calling redo when nothing is undone, because the TUI disables `/redo` in that state. A developer could plausibly drop this guard, for example while refactoring `unrevert` under the assumption that it is only called after an undo. The API endpoint can still be called directly, so the crash would be real.
- **Line 138 (session without a snapshot).** I did not think about it because my requirements only cover git projects. Removing the check is a plausible mistake from a developer who assumes a snapshot always exists, since it does in every git project. It would break redo outside git projects or with snapshots turned off.
- **Line 140 (empty changed-file set).** Removing this check is not a real bug: it only skips a call that would do nothing. A developer could easily delete it, and nothing would go wrong.

**What does each approach find that the other doesn't?**

- **Hand-written mutants** find bugs that depend on what the code means and on a specific sequence of actions: undo, a manual edit, then a second undo (H4), or the state after one redo step out of several (H5). They can also target code Stryker does not mutate well, such as git command-line flags (H1) or a whole loop's logic (H3), and the interview evidence tells me which behaviors matter.
- **Stryker** checks every condition and guard mechanically, so it finds the cases I never considered: redo with nothing undone and sessions without a snapshot. It does this without me having to imagine the bug, and it showed that my properties were strong for the restore logic (93%) while highlighting the inputs my generators never produce.

## Strengthening

All changes are in `packages/opencode/test/session/revert-property.test.ts`. No source code changed, and no example-based tests were added.

| Survivor | Change | Kind of change | Now killed by |
|---|---|---|---|
| H1 | Added a **move** operation to the agent-operation generator: read a file, delete it, and write the same contents to another file, as an agent running `mv` does. Moving to a new file is exactly the "delete plus identical create" case that rename detection hides from the undo patch. | Better generator | R5 |
| H3 | `turn()` now records a prompt with 2 or more operations as **two agent steps**, each with its own snapshot and patch, the way `session/processor.ts` records multi-step agent turns. One undo can now revert two patches that touch the same file. | Better generator | R1, R2, R5 |
| H5 | R2 now checks the files **after each redo step** (they must match the state right after the corresponding prompt), not only after the last one. R2's generator also uses 1-3 prompts and usually undoes and redoes all of them, so a middle redo step with a later prompt sharing a file is actually generated. | Stronger assertion and better generator | R2 |
| Stryker `revert.ts:134` | R2 now calls redo before any undo (directly on the service, since the TUI hides `/redo` when nothing is undone) and checks that no file changes. | Stronger assertion | R2 |

With seed 42, all five hand-written mutants are killed, and all four properties pass on the unmutated code (about 25 seconds for the file).

**Final Stryker run** (same config and scope, seed 42): 44 mutants, 36 killed, 6 timed out, 2 survived, in 2 minutes 32 seconds.

- **Mutation score as Stryker reports it: 95.45%** (42 of 44 detected).
- **Mutation score with equivalent mutants excluded: 97.67%** (42 of 43; `revert.ts:140` excluded as equivalent).

**Equivalent mutant: `revert.ts:140`, `if (changed.size)` became `if (true)`.** When `changed` is empty, the mutant calls `snap.revert([{ hash, files: [] }])`. `Snapshot.revert` builds its list of file operations from the patch's `files`, so the list is empty, its loop never runs, and no git command or file write happens. The code after the `if` is the same in both versions, so the original and the mutant behave identically for every input, and no test can kill it.

**Not killed, not equivalent: `revert.ts:138`, `if (session.revert.snapshot)` became `if (true)`.** `session.revert.snapshot` is only missing when the snapshot at the first undo failed, which happens in a project that is not a git repository or with snapshots turned off in the config. In those cases there are normally no patch parts, so `changed` is empty and the mutant does nothing different. It would only matter if patches were recorded and snapshots were then turned off before the undo, where the mutant would call `snap.revert` with no snapshot hash. That situation is outside revised R1, which only covers git projects with snapshots, so I did not add a property for it and I did not count it as equivalent.

## Agent failure case

None of my four main properties came from opencode, so I asked opencode to write a new property for **R4** in a fresh session.

**Prompt** (screenshot: `traceability/vpalasam-opencode-r4-prompt.png`; share link: https://opncd.ai/share/2TWDRPCN, which no longer loads because opencode's sharing service has been discontinued):

> Write a fast-check property test for this requirement of the /undo and /redo feature:
>
> R4: /undo must preserve manual changes made after the agent's prompt has finished to files that the agent did not modify during the reverted prompt.
>
> The feature is implemented in packages/opencode/src/session/revert.ts and packages/opencode/src/snapshot/index.ts. You can copy the helper functions from packages/opencode/test/session/revert-property.test.ts (everything above the // ---------- properties line), but write the property yourself from the requirement. Do not copy the existing properties in that file. Put it in a new file, packages/opencode/test/session/revert-opencode.property.test.ts, and use fc.configureGlobal({ seed: 42 }).

**Response.** opencode created `revert-opencode.property.test.ts` with the helpers copied from my file and this property:

```ts
  property(
    "R4: undo preserves manual edits to files the reverted prompt did not modify",
    fc
      .record({ initial: initialArb, prompts: promptsArb })
      .chain(({ initial, prompts }) => {
        // Files the last prompt (the one /undo reverts) did not modify.
        const candidates = untouchedBy(prompts[prompts.length - 1])
        return fc.record({
          initial: fc.constant(initial),
          prompts: fc.constant(prompts),
          // At least one edit, at most one per candidate file.
          edits: fc
            .array(
              fc.record({
                file: fc.constantFrom(...candidates),
                text: textArb,
              }),
              { minLength: 1, maxLength: candidates.length },
            )
            .map((edits) => {
              const seen = new Set<string>()
              return edits.filter((edit) => (seen.has(edit.file) ? false : seen.add(edit.file)))
            }),
        })
      }),
    (dir, { initial, prompts, edits }) =>
      Effect.gen(function* () {
        const session = yield* Session.Service
        yield* resetDir(dir, initial)
        const sid = yield* newSession()

        // Run every prompt except the last, then capture the tracked state the
        // final /undo will restore the last prompt's files to.
        for (const ops of prompts.slice(0, -1)) yield* turn(sid, dir, ops)
        const last = prompts[prompts.length - 1]
        const beforeLast = yield* hashTree(dir, TRACKED_FILES)

        // The final prompt is the one /undo reverts.
        yield* turn(sid, dir, last)

        // The agent's prompts have finished. The user now edits files by hand.
        for (const [i, edit] of edits.entries()) yield* writeFile(dir, edit.file, `manual-edit-${i}\n${edit.text}`)
        const targets = edits.map((edit) => edit.file)
        // State of the hand-edited files right before /undo.
        const manual = yield* hashTree(dir, targets)
        // Files the last prompt touched (tracked only). /undo must restore these.
        const reverted = TRACKED_FILES.filter((file) => !untouchedBy(last).includes(file))

        yield* undo(sid)

        // R4: every file the reverted prompt did not modify keeps its manual edit.
        expect(yield* hashTree(dir, targets)).toEqual(manual)
        // /undo must actually have happened: the revert point is set and the
        // files the last prompt modified are back to how they were before it.
        expect((yield* session.get(sid)).revert).toBeDefined()
        expect(yield* hashTree(dir, reverted)).toEqual(
          Object.fromEntries(reverted.map((file) => [file, beforeLast[file]!])),
        )
      }),
  )
```

(An earlier attempt for R2, with a prompt that did not say "do not copy", produced a near-verbatim copy of my existing R2 property with the comments naming the mutants removed, so I did not use it.)

**Mutant it let survive: H4** (repeated /undo reverts the already-undone prompt again and wipes manual edits). With seed 42, opencode's property passed on unmutated code and killed only H2. It also let H1, H3, and H5 survive, but those target R1, R5, and R2; H4 is the R4 mutant.

| Mutant | opencode's property | Strengthened property |
|---|---|---|
| H1 | Survived | Killed |
| H2 | Killed | Killed |
| H3 | Survived | Killed |
| **H4** | **Survived** | **Killed** |
| H5 | Survived | Survived (redo bug, not covered by R4) |

**Why the property was too weak.** It is a generator that never reaches the bug. The property always runs the prompts and then exactly **one** /undo, so it only ever tests the first undo of a session. H4 only changes the behavior of a **second** /undo (when the session is already reverted, it re-applies the earlier-undone prompt's patch and wipes a manual edit made between the two undos). No input opencode's property can generate ever runs that code path, so the property cannot fail on H4 no matter how many runs fast-check does. The assertions themselves are reasonable; the scenario is too narrow. The requirement's acceptance criteria ("the same holds when /undo is run again to revert an earlier prompt") ask for exactly the case it skips.

**Strengthened version** (in `packages/opencode/test/session/revert-opencode.property.test.ts`):

```ts
  property(
    "R4: undo preserves manual edits to files the reverted prompt did not modify",
    fc
      // 2-3 prompts, so there is always at least one repeated /undo.
      .record({ initial: initialArb, prompts: fc.array(promptArb, { minLength: 2, maxLength: 3 }) })
      .chain(({ initial, prompts }) => {
        // One list of edits per /undo; step k reverts prompt (n - 1 - k).
        const editsFor = (ops: Op[]) => {
          const candidates = untouchedBy(ops)
          return fc
            .array(fc.record({ file: fc.constantFrom(...candidates), text: textArb }), {
              minLength: 1,
              maxLength: candidates.length,
            })
            .map((edits) => {
              const seen = new Set<string>()
              return edits.filter((edit) => (seen.has(edit.file) ? false : seen.add(edit.file)))
            })
        }
        return fc.record({
          initial: fc.constant(initial),
          prompts: fc.constant(prompts),
          steps: fc.tuple(...prompts.map((_, k) => editsFor(prompts[prompts.length - 1 - k]))),
        })
      }),
    (dir, { initial, prompts, steps }) =>
      Effect.gen(function* () {
        const session = yield* Session.Service
        yield* resetDir(dir, initial)
        const sid = yield* newSession()

        // before[j] = tracked files right before prompt j ran.
        const before: Tree[] = []
        for (const ops of prompts) {
          before.push(yield* hashTree(dir, TRACKED_FILES))
          yield* turn(sid, dir, ops)
        }

        // The agent's prompts have finished. Undo them one at a time, newest
        // first, with hand edits before each /undo.
        for (const [k, edits] of steps.entries()) {
          const j = prompts.length - 1 - k
          for (const [i, edit] of edits.entries()) {
            yield* writeFile(dir, edit.file, `manual-edit-${k}-${i}\n${edit.text}`)
          }
          const targets = edits.map((edit) => edit.file)
          const manual = yield* hashTree(dir, targets)
          const reverted = TRACKED_FILES.filter((file) => !untouchedBy(prompts[j]).includes(file))

          yield* undo(sid)

          expect((yield* session.get(sid)).revert).toBeDefined()
          expect(yield* hashTree(dir, reverted)).toEqual(
            Object.fromEntries(reverted.map((file) => [file, before[j][file]!])),
          )
          // R4: every file the reverted prompt did not modify keeps its manual edit.
          expect(yield* hashTree(dir, targets)).toEqual(manual)
        }
      }),
  )
```

Two changes were needed. (1) The property now undoes **every** prompt, newest first, with hand edits before each /undo, and checks both the reverted files and the hand-edited files after each one. (2) The prompts generator uses 2-3 prompts instead of 1-2, so there is always at least one repeated /undo. With only change (1), H4 still survived with seed 42, because about half the generated inputs had a single prompt.

**Evidence.** Unmutated code: 1 pass, 0 fail. With H4 applied (`git apply mutants/vpalasam/H4.patch`), the strengthened property fails with this shrunk counterexample:

```
{"initial":{},"prompts":[[{"type":"delete","file":"calc.py"}],[{"type":"write","file":"src/util.py","text":""},{"type":"move","file":"calc.py","to":"test_calc.py"},{"type":"delete","file":"calc.py"}]],"steps":[[{"file":"README.md","text":"\n"}],[{"file":"src/util.py","text":""},{"file":"README.md","text":"\n"}]]}
```

Prompt 2 creates `src/util.py`. The first /undo reverts prompt 2 and removes it. The user then creates `src/util.py` by hand, which prompt 1 never touched. With H4, the second /undo re-reverts prompt 2 and deletes the hand-made `src/util.py`, so the "keeps its manual edit" assertion fails. Without H4 the same input passes.

## Requirement changes

| ID | Original requirement (P3) | Revised requirement | Why it changed |
|---|---|---|---|
| R1 | /undo restores every file the agent changed to its exact pre-prompt contents and deletes any files the agent created. | In a git project, /undo restores every non-gitignored file the agent changed to its exact pre-prompt contents and deletes any non-gitignored files the agent created. /undo never modifies gitignored files. | The original requirement would require opencode to back up and restore every file, including gitignored files and files in non-git projects. The existing snapshot mechanism uses a shadow git repository and skips gitignored files (`packages/opencode/src/snapshot/index.ts`). Supporting the original behavior would require a separate backup mechanism, including potentially sensitive files such as `.env`. This adds storage, security, and implementation costs beyond the feature's scope. Interviewees also disagreed: O-5 wanted gitignored files restored, while S-10 wanted `.env` left unchanged. The revision preserves exact restoration for non-gitignored project files while leaving gitignored files untouched. |
| R4 | /undo must preserve manual changes to files that the agent did not modify during the reverted prompt. | /undo must preserve manual changes made after the agent's prompt has finished to files that the agent did not modify during the reverted prompt. | The original requirement was not feasible for manual edits made while the agent was running. opencode compares whole-working-tree snapshots taken before and after an agent step (session/processor.ts), so concurrent user edits are indistinguishable from agent edits without tracking individual file writes. The revision limits the guarantee to edits made after the agent finishes, preserving what S-6 and S-9 wanted. During P4 testing, repeated /undo initially overwrote unrelated manual edits because it restored whole-tree snapshots. I fixed this in session/revert.ts by restoring only files affected by the reverted prompts. R4 now passes its property test. |
| R6 | After /undo, opencode must provide a way for users to verify which files were reverted and what changes were made, without relying only on the confirmation banner. | After `/undo`, opencode must display a list of reverted files and a diff showing the changes that were undone. This information must be derived from filesystem states or saved snapshots, rather than generated by the model, and must accurately reflect the changes between the post-prompt and restored states. | Could not be checked as written, since almost any screen could count as "a way to verify". The revision keeps the visible verification interviewees asked for (S-18, C-10, O-12 wanted to see a diff) and adds what they were worried about (S-19, S-20, S-21, O-13): the evidence must not come from the model and must match the real file contents. This is buildable within the current design. On `/undo`, `revert` stores a diff computed from the saved snapshot in the session (`revert.diff` in `packages/opencode/src/session/revert.ts`). The banner currently shows only file names with +/- line counts parsed from that diff (`packages/tui/src/util/revert-diff.ts`), so the full diff text is available but not yet displayed. |
