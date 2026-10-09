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
  return hooks.tool.session_stats.execute(
    { assignment },
    {
      sessionID: "session-1",
    } as Parameters<typeof hooks.tool.session_stats.execute>[1],
  )
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
        { info: { role: "assistant" }, parts: [{ type: "step-finish", cost: 1.25 }] },
        { info: { role: "assistant" }, parts: [{ type: "step-finish", cost: 0.5 }, { type: "text", text: "done" }] },
        { info: { role: "assistant" }, parts: [{ type: "text", text: "context" }] },
      ],
      worktree,
    )

    expect(output).toBe(
      `assignment: hw2
saved to: ${join(worktree, ".opencode", "assignment.json")}
prompts sent: 1
assistant steps: 2
cost: 1.7500`,
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
cost: 0.0000`,
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
      [{ info: { role: "user" }, parts: [{ type: "text", synthetic: true }, { type: "text", text: "question" }] }],
      worktree,
    )

    expect(output).toContain("prompts sent: 1")
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})