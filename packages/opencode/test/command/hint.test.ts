import { describe, expect, test } from "bun:test"
import type { SessionV1 } from "@opencode-ai/core/v1/session"
import { Hint } from "../../src/command/hint"

function textPart(metadata?: Record<string, unknown>) {
  return { type: "text", text: "", metadata } as SessionV1.Part
}

describe("Hint.next", () => {
  test("escalates one level per earlier hint and caps at level 3", () => {
    expect([0, 1, 2, 3, 10].map(Hint.next)).toEqual([1, 2, 3, 3, 3])
  })
})

describe("Hint.count", () => {
  test("counts only text parts stamped with a hint level", () => {
    const parts = [
      textPart({ [Hint.METADATA_KEY]: 1 }),
      textPart(),
      textPart({ other: 2 }),
      textPart({ [Hint.METADATA_KEY]: 2 }),
    ]
    expect(Hint.count(parts)).toBe(2)
  })

  test("counts only the hints since the student last started over at level 1", () => {
    const hints = (levels: number[]) => levels.map((level) => textPart({ [Hint.METADATA_KEY]: level }))
    expect(Hint.count(hints([]))).toBe(0)
    expect(Hint.count(hints([1, 2, 3, 3]))).toBe(4)
    expect(Hint.count(hints([1, 2, 3, 1]))).toBe(1)
    expect(Hint.count(hints([1, 2, 1, 2]))).toBe(2)
  })
})

describe("Hint.parse", () => {
  test("starts over when the first word is new or reset, and drops that word", () => {
    expect(Hint.parse("new")).toEqual({ reset: true, question: "" })
    expect(Hint.parse("  RESET  why is my tree unbalanced?")).toEqual({
      reset: true,
      question: "why is my tree unbalanced?",
    })
  })

  test("keeps escalating for any other arguments", () => {
    expect(Hint.parse("")).toEqual({ reset: false, question: "" })
    expect(Hint.parse("newline characters break my parser")).toEqual({
      reset: false,
      question: "newline characters break my parser",
    })
  })
})

describe("Hint.template", () => {
  test("injects the instruction for the requested level", () => {
    expect(Hint.template(1)).toContain("hint level 1 of 3 (Nudge)")
    expect(Hint.template(2)).toContain("hint level 2 of 3 (Direction)")
    expect(Hint.template(3)).toContain("hint level 3 of 3 (Worked analogy)")
  })

  test("tells the model to label the reply with the hint level", () => {
    for (const level of [1, 2, 3] as const) {
      expect(Hint.template(level)).toContain(`start the reply with 'Hint ${level}/3:'`)
    }
  })

  test("keeps the no-answer guardrails at every level", () => {
    for (const level of [1, 2, 3] as const) {
      expect(Hint.template(level)).toContain("Never write the solution or code for their problem")
    }
  })

  test("ends with the $ARGUMENTS placeholder for the student's question", () => {
    expect(Hint.template(1).endsWith("$ARGUMENTS")).toBe(true)
  })
})
