import { expect, test } from "bun:test"
import fc from "fast-check"
import { randomUUID } from "node:crypto"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import plugin, {
  assignmentConflict,
  computeStats,
  formatSessionStats,
  type SessionMessage,
} from "../../../../.opencode/plugin/session-stats"
import { queryLogPath, readAssignment, writeAssignment } from "../../../../.opencode/assignment"

fc.configureGlobal({ seed: 42 })

// Derive the plugin types from the plugin itself: the test's `@opencode-ai/plugin`
// copy and the plugin's copy are distinct type identities.
type PluginInput = Parameters<typeof plugin>[0]
type PluginHooks = Awaited<ReturnType<typeof plugin>>
type ToolContext = Parameters<NonNullable<PluginHooks["tool"]>["session_stats"]["execute"]>[1]

const CONFLICT_MESSAGE =
  "Only one assignment per summary. Complete the assignment in one session terminal or press –continue to come back to the session later."

// Bad value generator for numbers
const numericValue = fc.oneof(
  fc.nat(),
  fc.integer({ min: -100, max: -1 }),
  fc.constant(Number.NaN),
  fc.constant(Number.POSITIVE_INFINITY),
  fc.constant(undefined),
)

// A value paired with how much it is allowed to add to a total. Only finite,
// non-negative numbers count; negative, NaN, Infinity, and missing values add 0.
const countedNumber = fc.oneof(
  fc.nat().map((value) => ({ value, delta: value })),
  fc.integer({ max: -1 }).map((value) => ({ value, delta: 0 })),
  fc.constant({ value: Number.NaN, delta: 0 }),
  fc.constant({ value: Number.POSITIVE_INFINITY, delta: 0 }),
  fc.constant({ value: undefined, delta: 0 }),
)

// Generator of weird messages.
// A SessionMessage is just one of many messages in a session
// (and this is an array of SessionMessages).
const messageList: fc.Arbitrary<SessionMessage[]> = fc.array(
  fc.record({
    info: fc.record({
      id: fc.option(fc.uuid(), { nil: undefined }),
      role: fc.constantFrom("user", "assistant"),
      modelID: fc.option(fc.string({ minLength: 1 }), { nil: undefined }),
    }),
    parts: fc.array(
      fc.record({
        type: fc.constantFrom("text", "step-finish"),
        synthetic: fc.boolean(),
        cost: numericValue,
        tokens: fc.option(
          fc.record({
            input: numericValue,
            output: numericValue,
            reasoning: numericValue,
            // Real providers omit the cache object; the type marks it optional.
            cache: fc.option(fc.record({ read: numericValue, write: numericValue }), { nil: undefined }),
          }),
          { nil: undefined },
        ),
      }),
    ),
  }),
)

// A token payload where each field reports its expected contribution.
const tokenPayload = fc.record({
  input: countedNumber,
  output: countedNumber,
  reasoning: countedNumber,
  cache: fc.option(fc.record({ read: countedNumber, write: countedNumber }), { nil: undefined }),
})

// A prompt with a unique id, so it cannot collide with generated message ids.
const userPrompt = (id: string, parts: SessionMessage["parts"] = [{ type: "text", synthetic: false }]) =>
  ({ info: { id: `prompt-${id}`, role: "user" }, parts }) as SessionMessage

const assistantReply = (parentID: string, error = undefined as { name: string } | undefined) =>
  ({
    info: { role: "assistant", parentID, error },
    parts: [{ type: "step-finish", cost: 1 }],
  }) as SessionMessage

//For R2, we need multiple prompts, and an indicator of which is cancelled.
// Use fc.record to create a singular random cancelled object appended to
// the end of messageList (all the other messages).

const sessionWithCancelledPrompt = fc.record({
  messages: messageList,
  cancelledPrompt: fc.record({
    id: fc.uuid(),
    cost: fc.nat(),
  }),
})

// For R3, we need two distinct names. That's all.

const assignmentSequence = fc
  .record({
    existing: fc.string({ minLength: 1 }),
    requested: fc.string({ minLength: 1 }),
  })
  .filter(({ existing, requested }) => existing !== requested)

// R1: Counts, tokens, and cost are never negative for any message sequence.
// Kind: invariant
// Generator: messages with random roles, synthetic parts, zero or many
// step-finish parts, and cost/tokens that may be missing, NaN, Infinity, or negative.
test("R1: stats are never negative", () => {
  fc.assert(
    fc.property(messageList, (messages) => {
      const s = computeStats(messages)
      expect(s.prompts).toBeGreaterThanOrEqual(0)
      expect(s.steps).toBeGreaterThanOrEqual(0)
      expect(s.cost).toBeGreaterThanOrEqual(0)
      expect(s.inputTokens).toBeGreaterThanOrEqual(0)
      expect(s.outputTokens).toBeGreaterThanOrEqual(0)
      expect(s.reasoningTokens).toBeGreaterThanOrEqual(0)
      expect(s.cacheReadTokens).toBeGreaterThanOrEqual(0)
      expect(s.cacheWriteTokens).toBeGreaterThanOrEqual(0)
    }),
  )
})

// R2: Appending a cancelled prompt never decreases cost and
// never changes the prompt count.
// Kind: Metamorphic
// Generator: sessionWithCancelledPrompt generates a random session of x messages, as well as
// id and cost for the cancelled message.
test("R2: cancelled prompts preserve prompt count and cost", () => {
  fc.assert(
    fc.property(sessionWithCancelledPrompt, ({ messages, cancelledPrompt }) => {
      const cancelledMessages: SessionMessage[] = [
        ...messages, //now append cancelled prompt with random id and cost.
        {
          info: { id: cancelledPrompt.id, role: "user" },
          parts: [{ type: "text", synthetic: false }],
        },
        {
          info: {
            role: "assistant",
            parentID: cancelledPrompt.id,
            error: { name: "MessageAbortedError" },
          },
          parts: [{ type: "step-finish", cost: cancelledPrompt.cost }],
        },
      ]
      const before = computeStats(messages)
      const after = computeStats(cancelledMessages)

      expect(after.prompts).toBe(before.prompts)
      expect(after.cost).toBeGreaterThanOrEqual(before.cost)
    }),
  )
})

// R3: For any two distinct assignment names in one session, the second call
// fails with an explanatory message: “Only one assignment per summary.
// Complete the assignment in one session terminal or press –continue
// to come back to the session later.”
// Kind: Invariant
// Generator: assignmentSequence generates two distinct names
test("R3: distinct assignments produce the required conflict", () => {
  fc.assert(
    fc.property(assignmentSequence, ({ existing, requested }) => {
      expect(assignmentConflict(existing, requested)).toBe(CONFLICT_MESSAGE)
    }),
  )
})

// R3b: The other two paths of the same decision table: no existing assignment
// is not a conflict, reusing the same name is not a conflict, and names that
// differ only by case or surrounding whitespace are still a rename.
// Kind: Invariant
// Generator: arbitrary names, plus numbered names with a cased prefix
test("R3b: conflict only for a genuinely different existing assignment", () => {
  fc.assert(
    fc.property(fc.string({ minLength: 1 }), (name) => {
      expect(assignmentConflict(undefined, name)).toBeUndefined()
      expect(assignmentConflict(name, name)).toBeUndefined()
    }),
  )

  fc.assert(
    fc.property(fc.nat(), (suffix) => {
      expect(assignmentConflict(`hw${suffix}`, ` HW${suffix} `)).toBe(CONFLICT_MESSAGE)
    }),
  )
})

// R4: For any step data with or without token fields, the whole summary is
// rendered exactly: every label, the model list, and either token numbers or
// “unavailable.”
// Kind: invariant
// Generator: Same as R1, plus arbitrary assignment and saved paths
test("R4: the summary reports model and token information", () => {
  fc.assert(
    fc.property(messageList, fc.string(), fc.string(), (messages, assignment, saved) => {
      const stats = computeStats(messages)
      const models = [
        ...new Set(
          messages.flatMap((message) =>
            message.info.role === "assistant" && message.info.modelID ? [message.info.modelID] : [],
          ),
        ),
      ]
      const hasTokens = messages.some((message) =>
        message.parts.some((part) => part.type === "step-finish" && part.tokens),
      )
      const tokenLine = hasTokens
        ? `tokens: input=${stats.inputTokens}, output=${stats.outputTokens}, reasoning=${stats.reasoningTokens}, cacheRead=${stats.cacheReadTokens}, cacheWrite=${stats.cacheWriteTokens}`
        : "tokens: unavailable"

      expect(formatSessionStats(messages, assignment, saved)).toBe(
        [
          `assignment: ${assignment}`,
          `saved to: ${saved}`,
          `prompts sent: ${stats.prompts}`,
          `assistant steps: ${stats.steps}`,
          `cost: ${stats.cost.toFixed(4)}`,
          `model: ${models.length > 0 ? models.join(", ") : "unavailable"}`,
          tokenLine,
        ].join("\n"),
      )
    }),
  )
})

// R6 (R2 refinement): Prompt counting must depend on the exact cancellation and
// synthetic-part conditions, not just on the cancelled-prompt delta.
// Kind: Metamorphic
// Generator: arbitrary sessions plus one appended user or assistant message
test("R6: prompts count only real, non-cancelled user messages", () => {
  // A user message with at least one non-synthetic part is a prompt.
  fc.assert(
    fc.property(messageList, fc.uuid(), (messages, id) => {
      const before = computeStats(messages).prompts
      const after = computeStats([...messages, userPrompt(id)]).prompts
      expect(after).toBe(before + 1)
    }),
  )

  // A fully synthetic user message is not a prompt.
  fc.assert(
    fc.property(messageList, fc.uuid(), (messages, id) => {
      const before = computeStats(messages).prompts
      const after = computeStats([...messages, userPrompt(id, [{ type: "text", synthetic: true }])]).prompts
      expect(after).toBe(before)
    }),
  )

  // A mixed message is a prompt: one real part is enough.
  fc.assert(
    fc.property(messageList, fc.uuid(), (messages, id) => {
      const before = computeStats(messages).prompts
      const after = computeStats([
        ...messages,
        userPrompt(id, [
          { type: "text", synthetic: true },
          { type: "text", synthetic: false },
        ]),
      ]).prompts
      expect(after).toBe(before + 1)
    }),
  )

  // An aborted assistant reply cancels its parent prompt.
  fc.assert(
    fc.property(messageList, fc.uuid(), (messages, id) => {
      const before = computeStats([...messages, userPrompt(id)]).prompts
      const after = computeStats([
        ...messages,
        userPrompt(id),
        assistantReply(`prompt-${id}`, { name: "MessageAbortedError" }),
      ]).prompts
      expect(after).toBe(before - 1)
    }),
  )

  // A reply that was not aborted must not cancel its parent.
  fc.assert(
    fc.property(messageList, fc.uuid(), (messages, id) => {
      const before = computeStats([...messages, userPrompt(id)]).prompts
      const after = computeStats([...messages, userPrompt(id), assistantReply(`prompt-${id}`)]).prompts
      expect(after).toBe(before)
    }),
  )

  // Only assistant errors cancel: a user message carrying an error is still a prompt.
  fc.assert(
    fc.property(messageList, fc.uuid(), fc.uuid(), (messages, id, userId) => {
      const before = computeStats([...messages, userPrompt(id)]).prompts
      const after = computeStats([
        ...messages,
        userPrompt(id),
        {
          info: {
            id: `user-${userId}`,
            role: "user",
            parentID: `prompt-${id}`,
            error: { name: "MessageAbortedError" },
          },
          parts: [{ type: "text", synthetic: false }],
        },
      ]).prompts
      expect(after).toBe(before + 1)
    }),
  )
})

// R7 (R1 refinement): Only step-finish parts contribute, and only finite
// non-negative numbers contribute. Verified by appending one part at a time.
// Kind: Metamorphic
// Generator: arbitrary sessions plus a counted number and token payload
test("R7: only valid step-finish values are aggregated", () => {
  // A step-finish part adds exactly one step and its valid cost.
  fc.assert(
    fc.property(messageList, countedNumber, (messages, cost) => {
      const before = computeStats(messages)
      const after = computeStats([
        ...messages,
        { info: { role: "assistant" }, parts: [{ type: "step-finish", cost: cost.value }] },
      ])
      expect(after.steps).toBe(before.steps + 1)
      expect(after.cost).toBe(before.cost + cost.delta)
    }),
  )

  // A part that is not step-finish contributes neither steps nor cost nor tokens.
  fc.assert(
    fc.property(messageList, countedNumber, tokenPayload, (messages, cost, tokens) => {
      const before = computeStats(messages)
      const after = computeStats([
        ...messages,
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "text",
              cost: cost.value,
              tokens: {
                input: tokens.input.value,
                output: tokens.output.value,
                reasoning: tokens.reasoning.value,
                cache: tokens.cache
                  ? { read: tokens.cache.read.value, write: tokens.cache.write.value }
                  : undefined,
              },
            },
          ],
        },
      ])
      expect(after).toEqual(before)
    }),
  )

  // Token totals add valid values per field and tolerate a missing cache object.
  fc.assert(
    fc.property(messageList, tokenPayload, (messages, tokens) => {
      const before = computeStats(messages)
      const after = computeStats([
        ...messages,
        {
          info: { role: "assistant" },
          parts: [
            {
              type: "step-finish",
              tokens: {
                input: tokens.input.value,
                output: tokens.output.value,
                reasoning: tokens.reasoning.value,
                cache: tokens.cache
                  ? { read: tokens.cache.read.value, write: tokens.cache.write.value }
                  : undefined,
              },
            },
          ],
        },
      ])
      expect(after.hasTokens).toBe(true)
      expect(after.inputTokens).toBe(before.inputTokens + tokens.input.delta)
      expect(after.outputTokens).toBe(before.outputTokens + tokens.output.delta)
      expect(after.reasoningTokens).toBe(before.reasoningTokens + tokens.reasoning.delta)
      expect(after.cacheReadTokens).toBe(before.cacheReadTokens + (tokens.cache?.read.delta ?? 0))
      expect(after.cacheWriteTokens).toBe(before.cacheWriteTokens + (tokens.cache?.write.delta ?? 0))
    }),
  )
})

// R8 (R5): Calling the plugin directly registers the tool, persists the
// assignment, and returns the same summary as the pure formatter.
// Kind: Invariant over generated sessions and assignment names
test("R8: the plugin tool saves the assignment and formats the session", async () => {
  const base = await mkdtemp(join(tmpdir(), "session-stats-tool-"))
  try {
    await fc.assert(
      fc.asyncProperty(messageList, fc.string({ minLength: 1 }), async (messages, assignment) => {
        const worktree = join(base, randomUUID())
        const input = {
          worktree,
          client: { session: { messages: async () => ({ data: messages }) } },
        } as unknown as PluginInput
        const hooks = await plugin(input)
        const definition = hooks.tool?.session_stats
        expect(definition).toBeDefined()
        if (!definition) throw new Error("session_stats tool was not registered")

        expect(definition.description).toContain("prompts")
        expect(definition.args.assignment).toBeDefined()
        expect(definition.args.assignment.description).toBeTruthy()

        const result = await definition.execute({ assignment }, { sessionID: "ses_test" } as unknown as ToolContext)
        expect(result).toBe(formatSessionStats(messages, assignment, join(worktree, ".opencode", "assignment.json")))
        expect(await readAssignment(worktree)).toBe(assignment)
      }),
      { numRuns: 20 },
    )
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

// R8b (R3): A different assignment in an existing session is rejected before
// anything is written.
// Kind: Invariant over generated sessions
test("R8b: the plugin tool rejects a second, different assignment", async () => {
  const base = await mkdtemp(join(tmpdir(), "session-stats-conflict-"))
  try {
    await fc.assert(
      fc.asyncProperty(messageList, fc.uuid(), async (messages, id) => {
        const worktree = join(base, randomUUID())
        const existing = `hw-${id}`
        const requested = `hw-${randomUUID()}`
        await writeAssignment(worktree, existing)

        const input = {
          worktree,
          client: { session: { messages: async () => ({ data: messages }) } },
        } as unknown as PluginInput
        const hooks = await plugin(input)
        const definition = hooks.tool?.session_stats
        if (!definition) throw new Error("session_stats tool was not registered")

        await expect(
          definition.execute({ assignment: requested }, { sessionID: "ses_test" } as unknown as ToolContext),
        ).rejects.toThrow(CONFLICT_MESSAGE)
        expect(await readAssignment(worktree)).toBe(existing)
      }),
      { numRuns: 20 },
    )
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})

// R9 (R5): The event hook records a query only for user messages when the
// session already has an assignment.
// Kind: Invariant over generated event metadata
test("R9: the event hook records only user prompts when an assignment exists", async () => {
  const base = await mkdtemp(join(tmpdir(), "session-stats-events-"))
  try {
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.constant("message.updated"), fc.constantFrom("session.idle", "message.part.updated")),
        fc.constantFrom("user", "assistant"),
        fc.boolean(),
        fc.uuid(),
        async (type, role, hasAssignment, messageID) => {
          const worktree = join(base, randomUUID())
          if (hasAssignment) await writeAssignment(worktree, "hw2")

          const input = { worktree } as unknown as PluginInput
          const hooks = await plugin(input)
          const onEvent = hooks.event
          expect(onEvent).toBeDefined()
          if (!onEvent) throw new Error("event hook was not registered")

          await onEvent({
            event: { type, properties: { info: { id: messageID, role } } },
          } as unknown as Parameters<typeof onEvent>[0])

          const log = Bun.file(queryLogPath(worktree))
          const lines = (await log.exists()) ? (await log.text()).trim().split("\n").filter(Boolean) : []
          const shouldRecord = type === "message.updated" && role === "user" && hasAssignment
          expect(lines).toHaveLength(shouldRecord ? 1 : 0)
        },
      ),
      { numRuns: 60 },
    )
  } finally {
    await rm(base, { recursive: true, force: true })
  }
})
