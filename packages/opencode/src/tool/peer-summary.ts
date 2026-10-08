import { Effect, Schema } from "effect"
import { join } from "node:path"
import * as Tool from "./tool"
import DESCRIPTION from "./peer-summary.txt"
import { recordPerformance } from "@/student/peer-performance"

export const Parameters = Schema.Struct({
  assignment: Schema.String.annotate({ description: "Assignment name, such as hw1" }),
  student: Schema.String.annotate({ description: "Stable student name for this note" }),
  questionCount: Schema.Number.annotate({ description: "How many questions the student has asked on this assignment" }),
  attemptQuality: Schema.Number.annotate({ description: "Quality of the student's own solution attempt, from 1 to 5" }),
  stuckPoints: Schema.Array(Schema.String).annotate({ description: "Ideas or mistakes the student is stuck on" }),
  file: Schema.optional(Schema.String).annotate({
    description: "Shared class file. Defaults to .opencode/class-performance.json in the workspace.",
  }),
})

export const PeerSummaryTool = Tool.define(
  "peer_summary",
  Effect.succeed({
    description: DESCRIPTION,
    parameters: Parameters,
    execute: (params: Schema.Schema.Type<typeof Parameters>, ctx: Tool.Context) =>
      Effect.gen(function* () {
        yield* ctx.ask({
          permission: "peer_summary",
          patterns: ["*"],
          always: ["*"],
          metadata: {},
        })

        const summary = yield* Effect.promise(() =>
          recordPerformance(params.file ?? join(process.cwd(), ".opencode", "class-performance.json"), {
            assignment: params.assignment,
            student: params.student,
            questionCount: params.questionCount,
            attemptQuality: params.attemptQuality,
            stuckPoints: params.stuckPoints,
          }),
        )

        return {
          title: `${params.student} vs class on ${params.assignment}`,
          output: summary.summary,
          metadata: summary,
        }
      }),
  }),
)
