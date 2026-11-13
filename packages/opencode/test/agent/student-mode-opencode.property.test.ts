import { describe, expect, test } from "bun:test"
import fc from "fast-check"
import { StudentMode } from "../../src/agent/student-mode"

/**
 * Property suggested by opencode for R1 (see Agent failure case in
 * traceability/zhongqia.md). The first version only checked that enabled()
 * returned a boolean, which lets H1 survive. The strengthened assertion below
 * requires config to win over env.
 */
fc.configureGlobal({ seed: 42 })

describe("StudentMode properties (opencode)", () => {
  // Strengthened: config.student_mode must decide the result even when env disagrees.
  test("R1: config.student_mode decides enabled even when env disagrees", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.constantFrom("1", "true", "0", "false"), (flag, env) => {
        const result = StudentMode.enabled({
          config: { student_mode: flag },
          env: { OPENCODE_STUDENT_MODE: env },
        })
        expect(result).toBe(flag)
      }),
      { numRuns: 50 },
    )
  })
})
