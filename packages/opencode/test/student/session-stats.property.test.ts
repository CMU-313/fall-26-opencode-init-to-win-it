import { expect, test } from "bun:test"
import fc from "fast-check"
import {
  assignmentConflict,
  computeStats,
  formatSessionStats,
  type SessionMessage,
} from "../../../../.opencode/plugin/session-stats"

// Bad value generator for numbers
const numericValue = fc.oneof(
  fc.nat(),
  fc.integer({ min: -100, max: -1 }),
  fc.constant(Number.NaN),
  fc.constant(undefined),
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
            cache: fc.record({ read: numericValue, write: numericValue }),
          }),
          { nil: undefined },
        ),
      }),
    ),
  }),
)

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
// step-finish parts, and cost/tokens that may be missing, NaN, or negative.
test("R1: stats are never negative", () => {
  fc.assert(
    fc.property(messageList, (messages) => {
      const s = computeStats(messages)
      expect(s.prompts).toBeGreaterThanOrEqual(0)
      expect(s.steps).toBeGreaterThanOrEqual(0)
      expect(s.cost).toBeGreaterThanOrEqual(0)
      expect(s.inputTokens).toBeGreaterThanOrEqual(0)
      expect(s.outputTokens).toBeGreaterThanOrEqual(0)
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
      expect(assignmentConflict(existing, requested)).toBe(
        "Only one assignment per summary. Complete the assignment in one session terminal or press –continue to come back to the session later.",
      )
    }),
  )
})

// R4: For any step data with or without token fields, output contains
// the model name and either token numbers or “unavailable.”
// Kind: invariant
// Generator: Same as R1
test("R4: model and token information are reported", () => {
  fc.assert(
    fc.property(messageList, (messages) => {
      const output = formatSessionStats(messages, "hw2", "/tmp/assignment.json")
      const models = messages.flatMap((message) =>
        message.info.role === "assistant" && message.info.modelID ? [message.info.modelID] : [],
      )

      expect(output).toMatch(/^model: .+$/m)
      for (const model of models) expect(output).toContain(model)
      expect(output).toMatch(
        /^tokens: (unavailable|input=\d+(, output=\d+, reasoning=\d+, cacheRead=\d+, cacheWrite=\d+)?)$/m,
      )
    }),
  )
})
