import { expect, test } from "bun:test"
import { formatAssignmentStats } from "../../src/cli/cmd/assignment-stats"

test("displays query counts by assignment", () => {
  expect(formatAssignmentStats({ "Assignment 2": 3, "Assignment 1": 1 })).toBe(
    "Assignment 1: 1 query\nAssignment 2: 3 queries",
  )
  expect(formatAssignmentStats({})).toBe("No assignment queries recorded.")
})
test("records queries by assignment without counting the same message twice", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { recordAssignmentQuery, readAssignmentCounts } = await import("../../../../.opencode/assignment")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-stats-"))
  try {
    await mkdir(join(worktree, ".opencode"))
    await recordAssignmentQuery(worktree, "hw1", "message-1")
    await recordAssignmentQuery(worktree, "hw1", "message-1")
    await recordAssignmentQuery(worktree, "hw1", "message-2")
    await recordAssignmentQuery(worktree, "hw2", "message-3")

    expect(await readAssignmentCounts(worktree)).toEqual({ hw1: 2, hw2: 1 })
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})
test("returns empty counts when the query log does not exist", async () => {
  const { mkdtemp, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { readAssignmentCounts } = await import("../../../../.opencode/assignment")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-stats-missing-"))
  try {
    const counts = await readAssignmentCounts(worktree)

    expect(counts).toEqual({})
    expect(formatAssignmentStats(counts)).toBe("No assignment queries recorded.")
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})

test("returns empty counts when the query log is empty", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { queryLogPath, readAssignmentCounts } = await import("../../../../.opencode/assignment")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-stats-empty-"))
  try {
    await mkdir(join(worktree, ".opencode"))
    await Bun.write(queryLogPath(worktree), "")

    const counts = await readAssignmentCounts(worktree)

    expect(counts).toEqual({})
    expect(formatAssignmentStats(counts)).toBe("No assignment queries recorded.")
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})
test("ignores invalid records while counting valid queries", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { queryLogPath, readAssignmentCounts } = await import("../../../../.opencode/assignment")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-stats-invalid-"))
  try {
    await mkdir(join(worktree, ".opencode"))

    const entries = [
      null,
      42,
      "invalid",
      {},
      { assignment: "hw1" },
      { messageID: "message-1" },
      { assignment: 123, messageID: "message-1" },
      { assignment: "hw1", messageID: 123 },
      { assignment: "hw1", messageID: "message-1" },
      { assignment: "hw2", messageID: "message-2" },
    ]

    await Bun.write(
      queryLogPath(worktree),
      entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n",
    )

    expect(await readAssignmentCounts(worktree)).toEqual({ hw1: 1, hw2: 1 })
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})
test("duplicate queries preserve counts and a new query increments only its assignment", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { recordAssignmentQuery, readAssignmentCounts } = await import("../../../../.opencode/assignment")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-stats-properties-"))
  try {
    await mkdir(join(worktree, ".opencode"))

    await recordAssignmentQuery(worktree, "hw1", "message-1")
    await recordAssignmentQuery(worktree, "hw2", "message-2")

    const before = await readAssignmentCounts(worktree)
    expect(before).toEqual({ hw1: 1, hw2: 1 })

    // Repeating existing messages must not change the counts.
    await recordAssignmentQuery(worktree, "hw1", "message-1")
    await recordAssignmentQuery(worktree, "hw2", "message-2")

    const afterDuplicates = await readAssignmentCounts(worktree)
    expect(afterDuplicates).toEqual(before)

    // A new message must increment only its assignment.
    await recordAssignmentQuery(worktree, "hw1", "message-3")

    const afterNewQuery = await readAssignmentCounts(worktree)
    expect(afterNewQuery).toEqual({
      ...before,
      hw1: before.hw1! + 1,
    })
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})
test("skips malformed JSON lines and continues counting valid queries", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const { queryLogPath, readAssignmentCounts } = await import("../../../../.opencode/assignment")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-stats-malformed-"))
  try {
    await mkdir(join(worktree, ".opencode"))

    const lines = [
      JSON.stringify({ assignment: "hw1", messageID: "message-1" }),
      "{broken json",
      JSON.stringify({ assignment: "hw2", messageID: "message-2" }),
      JSON.stringify({ assignment: "hw1", messageID: "message-3" }),
    ]

    await Bun.write(queryLogPath(worktree), lines.join("\n") + "\n")

    expect(await readAssignmentCounts(worktree)).toEqual({ hw1: 2, hw2: 1 })
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})
test("CLI reads assignment logs and outputs correct counts", async () => {
  const { mkdtemp, mkdir, rm } = await import("node:fs/promises")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")

  const worktree = await mkdtemp(join(tmpdir(), "assignment-cli-test-"))

  try {
    const git = Bun.spawn(["git", "init"], {
      cwd: worktree,
      stdout: "pipe",
      stderr: "pipe",
    })
    expect(await git.exited).toBe(0)

    await mkdir(join(worktree, ".opencode"), { recursive: true })

    const lines = [
      { assignment: "hw1", messageID: "message-1" },
      { assignment: "hw1", messageID: "message-2" },
      { assignment: "hw2", messageID: "message-3" },
    ]

    await Bun.write(
      join(worktree, ".opencode", "assignment-queries.jsonl"),
      lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
    )

    const cli = Bun.spawn(
      [
        "bun",
        "run",
        "--conditions=browser",
        join(import.meta.dir, "../../src/index.ts"),
        "assignment-stats",
      ],
      {
        cwd: worktree,
        stdout: "pipe",
        stderr: "pipe",
      },
    )

    const [exitCode, stdout, stderr] = await Promise.all([
      cli.exited,
      new Response(cli.stdout).text(),
      new Response(cli.stderr).text(),
    ])

    expect(exitCode).toBe(0)
    expect(stderr).not.toContain("error")
    expect(stdout.trim()).toBe("hw1: 2 queries\nhw2: 1 query")
  } finally {
    await rm(worktree, { recursive: true, force: true })
  }
})