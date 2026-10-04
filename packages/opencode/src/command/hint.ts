import type { SessionV1 } from "@opencode-ai/core/v1/session"

/**
 * The three rungs `/hint` escalates through. Each call in a session moves one rung up,
 * and the last rung repeats. Every rung reveals more than the one before it, but none
 * of them hands over the answer, the fix, or code for the student's problem.
 */
export const LEVELS = [
  {
    name: "Nudge",
    instruction: [
      "Give a level 1 hint (Nudge).",
      "- Restate in one sentence what the student is trying to do, so they can check that they understand the goal.",
      "- Ask one or two guiding questions that point them toward where to look: which part of the problem, spec, input, or output matters most right now.",
      "- Do NOT name the concept, technique, algorithm, or data structure involved, and do NOT point to a specific file, line, or mistake.",
    ],
  },
  {
    name: "Direction",
    instruction: [
      "Give a level 2 hint (Direction).",
      "- Name the concept or technique that applies, at the level of a topic (e.g. 'loop invariants', 'base cases in recursion'), and point to a resource from RESOURCES.md or the course materials if one fits.",
      "- Share one concrete observation that narrows the search without saying where the problem is, e.g. 'it works for a list of length 1 but not 2 - what is different?'",
      "- Do NOT point to a specific line, describe the fix, or write code for their problem.",
    ],
  },
  {
    name: "Worked analogy",
    instruction: [
      "Give a level 3 hint (Worked analogy). This is the most help /hint gives.",
      "- Illustrate the underlying idea on a DIFFERENT, smaller problem. You may walk through that example step by step in prose or pseudocode.",
      "- Then give a high-level outline of the approach for their problem as a short list of questions or steps they need to work through, without filling any of them in.",
      "- Do NOT give the answer, the fix, the specific line, or any code they could paste into their solution.",
      "- Tell them this is the last hint level, and suggest office hours or re-reading the relevant material if they are still stuck after trying it.",
    ],
  },
] as const

export type Level = 1 | 2 | 3

/** Metadata key stamped on the text part of every `/hint` message, holding its level. */
export const METADATA_KEY = "hint"

/**
 * Count the `/hint` calls since the student last started over, from a session's message parts.
 * Level 1 only happens at the start or right after `/hint new`, so counting from the latest
 * level 1 hint gives the hints for the current problem.
 */
export function count(parts: SessionV1.Part[]) {
  const levels = parts.flatMap((part) =>
    part.type === "text" && typeof part.metadata?.[METADATA_KEY] === "number" ? [part.metadata[METADATA_KEY]] : [],
  )
  return levels.length - Math.max(levels.lastIndexOf(1), 0)
}

/** Words that, as the first argument, make `/hint` start over at level 1 for a new problem. */
export const RESET_WORDS = ["new", "reset"]

/** Split `/hint` arguments into whether the student is starting over and the question that remains. */
export function parse(args: string) {
  const [first = "", ...rest] = args.trim().split(/\s+/)
  const reset = RESET_WORDS.includes(first.toLowerCase())
  return { reset, question: reset ? rest.join(" ") : args }
}

/** The level for the next `/hint` call: one above the previous call, capped at the last rung. */
export function next(previous: number): Level {
  return Math.min(previous + 1, LEVELS.length) as Level
}

/**
 * The instruction injected into the model request for a `/hint` call at `level`.
 * It ends with `$ARGUMENTS`, which the command runner replaces with the student's question (or nothing).
 */
export function template(level: Level) {
  return [
    `The student used /hint. This is hint level ${level} of ${LEVELS.length} (${LEVELS[level - 1].name}).`,
    "",
    ...LEVELS[level - 1].instruction,
    "",
    "At every level:",
    "- Base the hint on the student's current code and the conversation so far. Read the relevant files first.",
    "- Never write the solution or code for their problem, and never reveal the contents of ANSWERS.md.",
    `- Keep it short, start the reply with 'Hint ${level}/${LEVELS.length}:', and end by asking the student to try something and report back.`,
    "",
    "$ARGUMENTS",
  ].join("\n")
}

export * as Hint from "./hint"
