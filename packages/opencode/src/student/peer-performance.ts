import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"

export type PerformanceNote = {
  assignment: string
  student: string
  questionCount: number
  attemptQuality: number
  stuckPoints: readonly string[]
}

type Store = {
  notes: PerformanceNote[]
}

export type PeerSummary = {
  assignment: string
  student: string
  peerCount: number
  questionAverage: number | null
  qualityAverage: number | null
  commonStuckPoints: string[]
  sharedStuckPoints: string[]
  summary: string
}

const emptyStore = (): Store => ({ notes: [] })

export function summarizeAgainstPeers(note: PerformanceNote, peers: PerformanceNote[]): PeerSummary {
  const others = peers.filter((item) => item.assignment === note.assignment && item.student !== note.student)
  const questionAverage = mean(others.map((item) => item.questionCount))
  const qualityAverage = mean(others.map((item) => item.attemptQuality))
  const commonStuckPoints = frequentStuckPoints(others)
  const sharedStuckPoints = note.stuckPoints
    .map(normalizePoint)
    .filter((point) => point.length > 0 && commonStuckPoints.includes(point))

  return {
    assignment: note.assignment,
    student: note.student,
    peerCount: others.length,
    questionAverage,
    qualityAverage,
    commonStuckPoints,
    sharedStuckPoints,
    summary: comparisonText(note, others.length, questionAverage, qualityAverage, commonStuckPoints, sharedStuckPoints),
  }
}

export async function recordPerformance(file: string, note: PerformanceNote): Promise<PeerSummary> {
  const store = await readStore(file)
  const peers = store.notes.filter((item) => !(item.assignment === note.assignment && item.student === note.student))
  const summary = summarizeAgainstPeers(note, peers)
  await writeStore(file, { notes: [...peers, cleanNote(note)] })
  return summary
}

async function readStore(file: string): Promise<Store> {
  const text = await readFile(file, "utf8").catch(() => "")
  if (!text.trim()) return emptyStore()
  const parsed = JSON.parse(text) as Store
  if (!Array.isArray(parsed.notes)) return emptyStore()
  return parsed
}

async function writeStore(file: string, store: Store) {
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, JSON.stringify(store, null, 2))
}

function cleanNote(note: PerformanceNote): PerformanceNote {
  return {
    assignment: note.assignment.trim(),
    student: note.student.trim(),
    questionCount: note.questionCount,
    attemptQuality: note.attemptQuality,
    stuckPoints: note.stuckPoints.map(normalizePoint).filter((point) => point.length > 0),
  }
}

function mean(values: number[]) {
  if (values.length === 0) return null
  const total = values.reduce((sum, value) => sum + value, 0)
  return Math.round((total / values.length) * 10) / 10
}

function frequentStuckPoints(peers: PerformanceNote[]) {
  const counts = new Map<string, number>()
  for (const peer of peers) {
    for (const point of new Set(peer.stuckPoints.map(normalizePoint).filter((point) => point.length > 0))) {
      counts.set(point, (counts.get(point) ?? 0) + 1)
    }
  }
  const threshold = peers.length < 2 ? 1 : 2
  return [...counts.entries()]
    .filter((entry) => entry[1] >= threshold)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map((entry) => entry[0])
}

function normalizePoint(value: string) {
  return value.trim().toLowerCase()
}

function comparisonText(
  note: PerformanceNote,
  peerCount: number,
  questionAverage: number | null,
  qualityAverage: number | null,
  commonStuckPoints: string[],
  sharedStuckPoints: string[],
) {
  if (peerCount === 0 || questionAverage === null || qualityAverage === null) {
    return `No other students have a note for ${note.assignment} yet. Saved ${note.questionCount} questions, attempt quality ${note.attemptQuality}/5, and stuck points: ${list(note.stuckPoints)}.`
  }

  const questions =
    note.questionCount === questionAverage
      ? `You asked ${note.questionCount} questions, the same as the class average.`
      : `You asked ${note.questionCount} questions. The class average is ${questionAverage}, so you asked ${note.questionCount > questionAverage ? "more" : "fewer"} than most.`

  const quality =
    note.attemptQuality === qualityAverage
      ? `Your attempt quality is ${note.attemptQuality}/5, the same as the class average.`
      : `Your attempt quality is ${note.attemptQuality}/5. The class average is ${qualityAverage}/5, so this attempt is ${note.attemptQuality > qualityAverage ? "ahead of" : "behind"} the class.`

  const stuck =
    commonStuckPoints.length === 0
      ? "Classmates do not share one stuck point yet."
      : `Classmates most often get stuck on ${list(commonStuckPoints)}.${sharedStuckPoints.length > 0 ? ` You share ${list(sharedStuckPoints)}.` : ""}`

  return [questions, quality, stuck, improvement(note, questionAverage, qualityAverage, sharedStuckPoints)].join(" ")
}

function improvement(
  note: PerformanceNote,
  questionAverage: number,
  qualityAverage: number,
  sharedStuckPoints: string[],
) {
  if (sharedStuckPoints.length > 0) {
    return `A common miss on this assignment is ${list(sharedStuckPoints)}. Review that, then retry your own solution before the next question.`
  }
  if (note.attemptQuality < qualityAverage) {
    return "Your attempt is behind the class average. Redo the part you got stuck on before asking another question."
  }
  if (note.questionCount > questionAverage) {
    return "You are asking more than average. Try one more attempt on your own before the next question."
  }
  return "You are at or ahead of the class on questions and attempt quality. Test a case you have not tried yet."
}

function list(values: readonly string[]) {
  if (values.length === 0) return "none"
  return values.join(", ")
}
