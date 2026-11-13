import { expect, test } from "bun:test"
import fc from "fast-check"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import {
  recordAssignmentQuery,
  readAssignmentCounts,
} from "../../../../.opencode/assignment"
fc.configureGlobal({ seed: 20261112 })

// R3: The system must count each unique message ID at most once per assignment.
// Kind: Model / oracle
// Generate nonempty message IDs to exercise the same ID across two different assignments.
test("R3: same message ID counts once in each assignment", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.stringMatching(/^[a-z0-9]{1,12}$/),
      async (messageID) => {
        const worktree = await mkdtemp(join(tmpdir(), "assignment-r3-"))

        try {
          await mkdir(join(worktree, ".opencode"))

          await recordAssignmentQuery(worktree, "hw1", messageID)
          await recordAssignmentQuery(worktree, "hw1", messageID)
          await recordAssignmentQuery(worktree, "hw2", messageID)

          const counts = await readAssignmentCounts(worktree)

          expect(counts).toEqual({
            hw1: 1,
            hw2: 1,
          })
        } finally {
          await rm(worktree, { recursive: true, force: true })
        }
      },
    ),
    { numRuns: 30 },
  )
})

// R2: The system must not report a positive query count for an assignment with no recorded queries.
// Kind: Invariant
// Generate invalid records with missing or incorrectly typed fields.
test("R2: invalid records never create positive counts", async () => {
  const invalidArb = fc.constantFrom(
    null,
    42,
    "invalid",
    {},
    { assignment: "hw1" },
    { messageID: "m1" },
    { assignment: 123, messageID: "m1" },
    { assignment: "hw1", messageID: 123 },
  )

  await fc.assert(
    fc.asyncProperty(
      fc.array(invalidArb, { maxLength: 20 }),
      async (records) => {
        const worktree = await mkdtemp(join(tmpdir(), "assignment-r2-"))

        try {
          await mkdir(join(worktree, ".opencode"))
          // R2: A missing query log must produce no counts.
          expect(await readAssignmentCounts(worktree)).toEqual({})
          const { queryLogPath } =
            await import("../../../../.opencode/assignment")

          await Bun.write(
            queryLogPath(worktree),
            records.map((r) => JSON.stringify(r)).join("\n") + "\n",
          )

          expect(await readAssignmentCounts(worktree)).toEqual({})
        } finally {
          await rm(worktree, { recursive: true, force: true })
        }
      },
    ),
    { numRuns: 30 },
  )
})

// R4: Query counts must be independent of the order of log records.
// Kind: Metamorphic
// Use repeated IDs across assignments to exercise ordering edge cases.
test("R4: reordering records preserves counts", async () => {
  const idArb = fc.stringMatching(/^[a-z0-9]{1,8}$/)

  const queryArb = fc.record({
    assignment: fc.constantFrom("hw1", "hw2", "hw3"),
    messageID: idArb,
  })

  await fc.assert(
    fc.asyncProperty(
      fc.array(queryArb, { minLength: 2, maxLength: 20 }),
      async (records) => {
        const worktree = await mkdtemp(join(tmpdir(), "assignment-r4-"))

        try {
          await mkdir(join(worktree, ".opencode"))

          const { queryLogPath } =
            await import("../../../../.opencode/assignment")

          const writeRecords = async (entries: typeof records) => {
            await Bun.write(
              queryLogPath(worktree),
              entries.map((r) => JSON.stringify(r)).join("\n") + "\n",
            )
          }

          await writeRecords(records)
          const before = await readAssignmentCounts(worktree)

          await writeRecords([...records].reverse())
          const after = await readAssignmentCounts(worktree)

          expect(after).toEqual(before)
        } finally {
          await rm(worktree, { recursive: true, force: true })
        }
      },
    ),
    { numRuns: 30 },
  )
})

// R5: Reassigning a unique query from one assignment to another must update both assignments' counts.
// Kind: Model / oracle
// Generate distinct message IDs to avoid destination collisions.
test("R5: moving a query updates assignment counts", async () => {
  const idArb = fc.stringMatching(/^[a-z0-9]{1,8}$/)

  await fc.assert(
    fc.asyncProperty(
      fc.uniqueArray(idArb, { minLength: 1, maxLength: 10 }),
      fc.uniqueArray(idArb, { minLength: 1, maxLength: 10 }),
      async (aIDs, bIDs) => {
        const worktree = await mkdtemp(join(tmpdir(), "assignment-r5-"))

        try {
          await mkdir(join(worktree, ".opencode"))

          const { queryLogPath } =
            await import("../../../../.opencode/assignment")

          const records = [
            ...aIDs.map((id) => ({
              assignment: "A",
              messageID: `a-${id}`,
            })),
            ...bIDs.map((id) => ({
              assignment: "B",
              messageID: `b-${id}`,
            })),
          ]

          const writeRecords = async (entries: typeof records) => {
            await Bun.write(
              queryLogPath(worktree),
              entries.map((r) => JSON.stringify(r)).join("\n") + "\n",
            )
          }

          await writeRecords(records)
          const before = await readAssignmentCounts(worktree)

          expect(before).toEqual({
            A: aIDs.length,
            B: bIDs.length,
          })

          const moved = records.map((r, index) =>
            index === 0 ? { ...r, assignment: "B" } : r,
          )

          await writeRecords(moved)
          const after = await readAssignmentCounts(worktree)

          expect(after).toEqual({
            ...(aIDs.length > 1 ? { A: aIDs.length - 1 } : {}),
            B: bIDs.length + 1,
          })
        } finally {
          await rm(worktree, { recursive: true, force: true })
        }
      },
    ),
    { numRuns: 30 },
  )
})

test("R3: each assignment counts unique message IDs once", async () => {
  const idArb = fc.stringMatching(/^[a-z0-9]{1,12}$/)

  const assignmentIDsArb = fc.record({
    hw1: fc.uniqueArray(idArb, { minLength: 1, maxLength: 10 }),
    hw2: fc.uniqueArray(idArb, { minLength: 1, maxLength: 10 }),
    hw3: fc.uniqueArray(idArb, { minLength: 1, maxLength: 10 }),
  })

  await fc.assert(
    fc.asyncProperty(assignmentIDsArb, async (assignmentIDs) => {
      const worktree = await mkdtemp(join(tmpdir(), "assignment-r3-"))

      try {
        await mkdir(join(worktree, ".opencode"))

        for (const [assignment, ids] of Object.entries(assignmentIDs)) {
          for (const messageID of ids) {
            await recordAssignmentQuery(worktree, assignment, messageID)
            await recordAssignmentQuery(worktree, assignment, messageID)
          }
        }

        expect(await readAssignmentCounts(worktree)).toEqual({
          hw1: assignmentIDs.hw1.length,
          hw2: assignmentIDs.hw2.length,
          hw3: assignmentIDs.hw3.length,
        })
      } finally {
        await rm(worktree, { recursive: true, force: true })
      }
    }),
    { numRuns: 30 },
  )
})

test("R3: message IDs are case-sensitive within an assignment", async () => {
  const letterArb = fc.constantFrom(
    ..."abcdefghijklmnopqrstuvwxyz",
  )

  await fc.assert(
    fc.asyncProperty(letterArb, async (letter) => {
      const worktree = await mkdtemp(join(tmpdir(), "assignment-r3-case-"))

      try {
        await mkdir(join(worktree, ".opencode"))

        await recordAssignmentQuery(worktree, "hw1", letter)
        await recordAssignmentQuery(worktree, "hw1", letter.toUpperCase())

        expect(await readAssignmentCounts(worktree)).toEqual({
          hw1: 2,
        })
      } finally {
        await rm(worktree, { recursive: true, force: true })
      }
    }),
    { numRuns: 30 },
  )
})