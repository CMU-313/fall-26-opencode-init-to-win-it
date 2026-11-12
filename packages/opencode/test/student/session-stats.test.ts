import { expect, test } from "bun:test"
import sessionStats from "../../../../.opencode/plugin/session-stats"

function makePlugin(messages: unknown[], worktree: string) {
  return sessionStats({
    worktree,
    client: {
      session: {
        messages: async () => ({ data: messages }),
      },
    },
  } as unknown as Parameters<typeof sessionStats>[0])
}

async function runStats(messages: unknown[], worktree: string, assignment = "hw2") {
  const hooks = await makePlugin(messages, worktree)
  return hooks.tool.session_stats.execute({ assignment }, {
    sessionID: "session-1",
  } as Parameters<typeof hooks.tool.session_stats.execute>[1])
}

test("counts real prompts, assistant steps, and step costs", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const worktree = await mkdtemp(join(tmpdir(), "session-stats-"))

  try {
    const output = await runStats(
      [
        { info: { role: "user" }, parts: [{ type: "text", text: "Explain this" }] },
        { info: { role: "user" }, parts: [{ type: "text", text: "internal", synthetic: true }] },
        {
          info: { role: "assistant", modelID: "test-model" },
          parts: [
            {
              type: "step-finish",
              cost: 1.25,
              tokens: { input: 10, output: 5, reasoning: 2, cache: { read: 3, write: 1 } },
            },
          ],
        },
        {
          info: { role: "assistant", modelID: "test-model" },
          parts: [
            {
              type: "step-finish",
              cost: 0.5,
              tokens: { input: 20, output: 6, reasoning: 4, cache: { read: 5, write: 2 } },
            },
            { type: "text", text: "done" },
          ],
        },
        { info: { role: "assistant" }, parts: [{ type: "text", text: "context" }] },
      ],
      worktree,
    )

    expect(output).toBe(
      `assignment: hw2
saved to: ${join(worktree, ".opencode", "assignment.json")}
prompts sent: 1
assistant steps: 2
cost: 1.7500
model: test-model
tokens: input=30, output=11, reasoning=6, cacheRead=8, cacheWrite=3`,
    )
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})

test("returns zero metrics for an empty session and preserves the assignment", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const worktree = await mkdtemp(join(tmpdir(), "session-stats-empty-"))

  try {
    const output = await runStats([], worktree, "project-1")

    expect(output).toBe(
      `assignment: project-1
saved to: ${join(worktree, ".opencode", "assignment.json")}
prompts sent: 0
assistant steps: 0
cost: 0.0000
model: unavailable
tokens: unavailable`,
    )
    expect(await Bun.file(join(worktree, ".opencode", "assignment.json")).json()).toEqual({ assignment: "project-1" })
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})

test("counts a user message when it contains both synthetic and real parts", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const worktree = await mkdtemp(join(tmpdir(), "session-stats-mixed-"))

  try {
    const output = await runStats(
      [
        {
          info: { role: "user" },
          parts: [
            { type: "text", synthetic: true },
            { type: "text", text: "question" },
          ],
        },
      ],
      worktree,
    )

    expect(output).toContain("prompts sent: 1")
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})

test("rejects a different assignment in the same worktree", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const worktree = await mkdtemp(join(tmpdir(), "session-stats-conflict-"))

  try {
    await runStats([], worktree, "hw1")
    await expect(runStats([], worktree, "hw3")).rejects.toThrow(
      "Only one assignment per summary. Complete the assignment in one session terminal or press –continue to come back to the session later.",
    )
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})
