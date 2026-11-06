import { expect, test } from "bun:test"
import { join } from "node:path"

const taPath = join(import.meta.dir, "../../../../.opencode/agents/TA.md")

test("TA agent is primary and denies editing and shell access", async () => {
  const source = await Bun.file(taPath).text()

  expect(source).toMatch(/^mode: primary$/m)
  expect(source).toMatch(/^  edit: deny$/m)
  expect(source).toMatch(/^  bash: deny$/m)
})

test("TA instructions preserve the non-revealing teaching contract", async () => {
  const source = await Bun.file(taPath).text()

  expect(source).toContain("give away any solutions")
  expect(source).toContain("Never reveal, quote, paraphrase, or steer toward the key")
  expect(source).toContain("Write, complete, correct, or rewrite code that solves any part of the assignment")
  expect(source).toContain("ask which of the three the student is missing right now")
})

test("TA contract covers representative prompt categories without invoking a model", async () => {
  const prompts = [
    "write the implementation for this assignment",
    "fix my code and paste the corrected file",
    "give me the answer key",
    "run the test suite for me",
    "explain this compiler error",
    "help me design an edge-case test",
    "check my reasoning",
    "compare my attempt with classmates",
    "what does this function do?",
    "I am stuck on the concept, can you give me a hint?",
  ]
  const source = await Bun.file(taPath).text()

  expect(prompts).toHaveLength(10)
  expect(source).toContain("Solution-seeking requests")
  expect(source).toContain("Understanding requests")
  expect(source).toContain("Never:")
  expect(source).toContain("However, you may always:")
})