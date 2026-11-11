import { describe, expect } from "bun:test"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { SessionProjector } from "@opencode-ai/core/session/projector"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { ModelV2 } from "@opencode-ai/core/model"
import { Effect } from "effect"
import fc from "fast-check"
import crypto from "crypto"
import fs from "fs/promises"
import path from "path"
import { Session } from "@/session/session"
import { SessionRevert } from "../../src/session/revert"
import { Snapshot } from "../../src/snapshot"
import { MessageID, PartID, SessionID } from "../../src/session/schema"
import { provideTmpdirInstance } from "../fixture/fixture"
import { testEffect } from "../lib/effect"

// Fixed seed so every run, including each Stryker mutant run, sees the same inputs.
fc.configureGlobal({ seed: 42 })

const it = testEffect(
  LayerNode.compile(
    LayerNode.group([Session.node, SessionRevert.node, Snapshot.node, SessionProjector.node, CrossSpawnSpawner.node]),
  ),
)

// ---------- shared helpers ----------

// Files the agent may touch. The pool is small so generated operations keep
// hitting the same files (edit then delete, create then edit, the same file in
// several prompts). It includes a nested path, and .env, which is gitignored.
const AGENT_FILES = ["calc.py", "README.md", "test_calc.py", "src/util.py", ".env"]
// Files only the user edits by hand. The agent never touches them, so R4 always
// has at least one file that the reverted prompt did not modify.
const MANUAL_FILES = ["notes.txt", "docs/todo.md"]
const ALL_FILES = [...AGENT_FILES, ...MANUAL_FILES]
// Files the revised R1 says /undo restores: everything except gitignored files.
const TRACKED_FILES = ALL_FILES.filter((file) => file !== ".env")
// Non-gitignored files that a prompt's operations do not touch.
const untouchedBy = (ops: Op[]) =>
  TRACKED_FILES.filter((file) => !ops.some((op) => op.file === file || (op.type === "move" && op.to === file)))

type Op =
  | { type: "write"; file: string; text: string }
  | { type: "delete"; file: string }
  // Moves `file` to `to` (like an agent running `mv`): reads it, deletes it, and
  // writes the same contents to `to`. Does nothing if `file` does not exist.
  | { type: "move"; file: string; to: string }
type Tree = Record<string, string | null> // file -> sha256, or null if absent
type Services = Session.Service | SessionRevert.Service | Snapshot.Service

const tokens = { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } }

const writeFile = (dir: string, file: string, text: string) =>
  Effect.promise(async () => {
    await fs.mkdir(path.dirname(path.join(dir, file)), { recursive: true })
    await fs.writeFile(path.join(dir, file), text)
  })

const removeFile = (dir: string, file: string) => Effect.promise(() => fs.rm(path.join(dir, file), { force: true }))

const applyOp = Effect.fn("test.applyOp")(function* (dir: string, op: Op) {
  if (op.type === "write") return yield* writeFile(dir, op.file, op.text)
  if (op.type === "delete") return yield* removeFile(dir, op.file)
  const text = yield* Effect.promise(() => fs.readFile(path.join(dir, op.file), "utf-8").catch(() => null))
  if (text === null) return
  yield* removeFile(dir, op.file)
  yield* writeFile(dir, op.to, text)
})

// Clears the pool, gitignores .env, and writes the given initial contents.
const resetDir = Effect.fn("test.resetDir")(function* (dir: string, initial: Record<string, string>) {
  for (const file of ALL_FILES) yield* removeFile(dir, file)
  yield* writeFile(dir, ".gitignore", ".env\n")
  for (const [file, text] of Object.entries(initial)) yield* writeFile(dir, file, text)
})

const hashTree = (dir: string, files: string[]) =>
  Effect.promise(async () => {
    const tree: Tree = {}
    for (const file of files) {
      const data = await fs.readFile(path.join(dir, file)).catch(() => null)
      tree[file] = data === null ? null : crypto.createHash("sha256").update(data).digest("hex")
    }
    return tree
  })

// Simulates one prompt: a user message, then an assistant message whose
// step-start/step-finish/patch parts record the given file operations, the
// same way session/processor.ts records agent steps. A real agent often takes
// several steps per prompt, each with its own snapshot and patch, so a prompt
// with 2 or more operations is split into two steps (first half, second half).
// That way one undo can revert two patches that touch the same file
// (hand-written mutant H3).
const turn = Effect.fn("test.turn")(function* (sessionID: SessionID, dir: string, ops: Op[]) {
  const session = yield* Session.Service
  const snapshot = yield* Snapshot.Service
  const model = { providerID: ProviderV2.ID.make("openai"), modelID: ModelV2.ID.make("gpt-4") }

  const u = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "user",
    sessionID,
    agent: "default",
    model,
    time: { created: Date.now() },
  })
  yield* session.updatePart({ id: PartID.ascending(), messageID: u.id, sessionID, type: "text", text: "prompt" })
  const a = yield* session.updateMessage({
    id: MessageID.ascending(),
    role: "assistant",
    sessionID,
    mode: "default",
    agent: "default",
    path: { cwd: dir, root: dir },
    cost: 0,
    tokens,
    ...model,
    parentID: u.id,
    time: { created: Date.now() },
    finish: "end_turn",
  })

  const half = Math.ceil(ops.length / 2)
  const steps = ops.length >= 2 ? [ops.slice(0, half), ops.slice(half)] : [ops]
  for (const step of steps) {
    const before = yield* snapshot.track()
    if (!before) throw new Error("expected snapshot")
    for (const op of step) yield* applyOp(dir, op)
    const after = yield* snapshot.track()
    if (!after) throw new Error("expected snapshot")
    const patch = yield* snapshot.patch(before)

    yield* session.updatePart({ id: PartID.ascending(), messageID: a.id, sessionID, type: "step-start", snapshot: before })
    yield* session.updatePart({
      id: PartID.ascending(),
      messageID: a.id,
      sessionID,
      type: "step-finish",
      reason: "stop",
      snapshot: after,
      cost: 0,
      tokens,
    })
    if (patch.files.length) {
      yield* session.updatePart({
        id: PartID.ascending(),
        messageID: a.id,
        sessionID,
        type: "patch",
        hash: patch.hash,
        files: patch.files,
      })
    }
  }
  return u.id
})

// /undo, following session.undo in packages/tui/src/routes/session/index.tsx:
// revert to the last user message before the current revert point.
const undo = Effect.fn("test.undo")(function* (sessionID: SessionID) {
  const session = yield* Session.Service
  const revert = yield* SessionRevert.Service
  const messages = (yield* session.messages({ sessionID })).map((msg) => msg.info)
  const revertID = (yield* session.get(sessionID)).revert?.messageID
  const index = revertID ? messages.findIndex((msg) => msg.id === revertID) : -1
  const before = index === -1 ? messages : messages.slice(0, index)
  const message = before.findLast((msg) => msg.role === "user")
  if (!message) return
  yield* revert.revert({ sessionID, messageID: message.id })
})

// /redo, following session.redo in packages/tui/src/routes/session/index.tsx:
// move the revert point to the next user message, or unrevert if there is none.
const redo = Effect.fn("test.redo")(function* (sessionID: SessionID) {
  const session = yield* Session.Service
  const revert = yield* SessionRevert.Service
  const messageID = (yield* session.get(sessionID)).revert?.messageID
  if (!messageID) return
  const messages = (yield* session.messages({ sessionID })).map((msg) => msg.info)
  const next = messages.find((msg) => msg.role === "user" && msg.id > messageID)
  if (!next) {
    yield* revert.unrevert({ sessionID })
    return
  }
  yield* revert.revert({ sessionID, messageID: next.id })
})

const newSession = Effect.fn("test.newSession")(function* () {
  const session = yield* Session.Service
  return (yield* session.create({})).id
})

// Runs a fast-check property inside a temp git project. Every generated input
// gets a fresh session; resetDir puts the files back in a known state.
const property = <T>(name: string, arb: fc.Arbitrary<T>, body: (dir: string, input: T) => Effect.Effect<void, unknown, Services>) =>
  it.live(
    name,
    provideTmpdirInstance(
      (dir) =>
        Effect.gen(function* () {
          const run = Effect.runPromiseWith(yield* Effect.context<Services>())
          yield* Effect.promise(() =>
            fc.assert(
              fc.asyncProperty(arb, (input) => run(body(dir, input))),
              // Stop after 45 seconds (each run does real git work). A failure found by
              // then is still reported with the counterexample shrunk so far.
              // Under Stryker, skip shrinking: it only makes failures smaller and does not
              // change whether a mutant is caught, so killed mutants finish sooner.
              {
                numRuns: NUM_RUNS,
                interruptAfterTimeLimit: 45_000,
                endOnFailure: !!process.env.__STRYKER_ACTIVE_MUTANT__,
              },
            ),
          )
          // The package test script uses --only-failures, which hides passing tests,
          // so print a line to show in the CI log that this property ran.
          console.log(`[property] ${name}: passed`)
        }),
      { git: true },
    ),
    180_000,
  )

// ---------- generators ----------

// File contents mix a few fixed strings with random ones. The fixed strings
// make it likely that the agent writes a file's existing contents back (a
// prompt that changes nothing) and that two prompts write the same text. The
// random strings include the empty file and multi-line text.
const textArb = fc.oneof(
  fc.constantFrom("", "a", "def multiply(a, b):\n    return a * b\n"),
  fc.string({ maxLength: 20 }),
  fc.array(fc.string({ maxLength: 10 }), { maxLength: 4 }).map((lines) => lines.join("\n") + "\n"),
)
// Any subset of the files may exist before the first prompt, so agent writes
// cover both editing existing files and creating new ones, and deletes cover
// both existing and missing files.
const initialArb = fc.dictionary(fc.constantFrom(...ALL_FILES), textArb)
// Moves cover an agent renaming a file. When the destination is new, git sees a
// deleted file and an added file with identical contents, which is the case
// rename detection can hide from the undo patch (hand-written mutant H1).
const agentOpArb: fc.Arbitrary<Op> = fc.oneof(
  fc.record({ type: fc.constant("write" as const), file: fc.constantFrom(...AGENT_FILES), text: textArb }),
  fc.record({ type: fc.constant("delete" as const), file: fc.constantFrom(...AGENT_FILES) }),
  fc.record({
    type: fc.constant("move" as const),
    file: fc.constantFrom(...AGENT_FILES),
    to: fc.constantFrom(...AGENT_FILES),
  }),
)
// One prompt is 1 to 3 operations, so a prompt can touch the same file twice.
const promptArb = fc.array(agentOpArb, {
  minLength: 1,
  maxLength: 3,
})
// 1 to 2 prompts, so undo and redo are exercised past the first step.
const promptsArb = fc.array(promptArb, {
  minLength: 1,
  maxLength: 2,
})

const NUM_RUNS = 10

// ---------- properties ----------

describe("session undo/redo R4 property", () => {
  // R4: /undo must preserve manual changes made after the agent's prompt has
  // finished to files that the agent did not modify during the reverted prompt.
  // Kind: invariant
  //
  // Originally written by opencode, which only ever ran ONE /undo (reverting the
  // last prompt), so a bug that only shows on a repeated /undo (hand-written
  // mutant H4) was never reached. Strengthened version: after all prompts have
  // finished, /undo is run once per prompt, newest first. Before each /undo the
  // user hand-edits files that the prompt about to be reverted did NOT touch,
  // which includes files only a later, already-undone prompt changed. After each
  // /undo, the files that prompt touched are back to how they were before it,
  // and every hand-edited file still has the user's edit.
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
})
