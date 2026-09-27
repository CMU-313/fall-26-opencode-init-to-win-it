import { describe, expect, test } from "bun:test"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { recordPerformance, summarizeAgainstPeers, type PerformanceNote } from "../../src/student/peer-performance"

const ada: PerformanceNote = {
  assignment: "hw1",
  student: "ada",
  questionCount: 2,
  attemptQuality: 4,
  stuckPoints: ["off-by-one"],
}

const grace: PerformanceNote = {
  assignment: "hw1",
  student: "grace",
  questionCount: 6,
  attemptQuality: 2,
  stuckPoints: ["Off-by-one", "null check"],
}

describe("summarizeAgainstPeers", () => {
  test("says there is no class average when this student is first", () => {
    const summary = summarizeAgainstPeers(ada, [])
    expect(summary.peerCount).toBe(0)
    expect(summary.questionAverage).toBeNull()
    expect(summary.summary).toContain("No other students")
  })

  test("compares question count, attempt quality, and shared stuck points", () => {
    const summary = summarizeAgainstPeers(grace, [ada, { ...ada, student: "linus", questionCount: 4, attemptQuality: 4 }])
    expect(summary.peerCount).toBe(2)
    expect(summary.questionAverage).toBe(3)
    expect(summary.qualityAverage).toBe(4)
    expect(summary.commonStuckPoints).toContain("off-by-one")
    expect(summary.sharedStuckPoints).toContain("off-by-one")
    expect(summary.summary).toContain("asked more")
    expect(summary.summary).toContain("behind")
    expect(summary.summary).toContain("common miss")
  })
})

describe("recordPerformance", () => {
  test("stores the note and keeps one note per student on an assignment", async () => {
    const root = await mkdtemp(join(tmpdir(), "peer-performance-"))
    const file = join(root, "class-performance.json")

    try {
      const first = await recordPerformance(file, ada)
      expect(first.peerCount).toBe(0)

      const second = await recordPerformance(file, grace)
      expect(second.peerCount).toBe(1)
      expect(second.questionAverage).toBe(2)

      await recordPerformance(file, { ...grace, questionCount: 3, attemptQuality: 5, stuckPoints: [] })
      const saved = JSON.parse(await readFile(file, "utf8")) as { notes: PerformanceNote[] }
      const graceNotes = saved.notes.filter((note) => note.student === "grace")
      expect(graceNotes).toHaveLength(1)
      expect(graceNotes[0].questionCount).toBe(3)
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })
})
