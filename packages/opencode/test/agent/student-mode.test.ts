import { describe, expect, test } from "bun:test"
import { Permission } from "../../src/permission"
import { StudentMode } from "../../src/agent/student-mode"

describe("StudentMode.ruleset", () => {
  test("denies edit and bash wildcards", () => {
    const rules = StudentMode.ruleset()
    expect(Permission.evaluate("edit", "src/main.ts", rules).action).toBe("deny")
    expect(Permission.evaluate("bash", "ls", rules).action).toBe("deny")
  })

  test("does not deny read by itself", () => {
    const rules = StudentMode.ruleset()
    // No matching rule → default ask from evaluate()
    expect(Permission.evaluate("read", "src/main.ts", rules).action).toBe("ask")
  })
})

describe("StudentMode.apply", () => {
  test("is a no-op when student mode is off", () => {
    const base = Permission.fromConfig({ edit: "allow", bash: "allow", read: "allow" })
    const next = StudentMode.apply(base, false)
    expect(next).toBe(base)
    expect(Permission.evaluate("edit", "a.ts", next).action).toBe("allow")
    expect(Permission.evaluate("bash", "echo hi", next).action).toBe("allow")
  })

  test("merges denies after base so write/execute stay blocked", () => {
    const base = Permission.fromConfig({
      "*": "allow",
      edit: "allow",
      bash: "allow",
      read: "allow",
    })
    const next = StudentMode.apply(base, true)

    expect(Permission.evaluate("edit", "homework.py", next).action).toBe("deny")
    expect(Permission.evaluate("bash", "python homework.py", next).action).toBe("deny")
    // Reads remain usable for explaining code
    expect(Permission.evaluate("read", "homework.py", next).action).toBe("allow")
  })

  test("disables write/edit/apply_patch and bash tools via Permission.disabled", () => {
    const next = StudentMode.apply(Permission.fromConfig({ "*": "allow" }), true)
    const hidden = Permission.disabled(["edit", "write", "apply_patch", "bash", "read", "grep"], next)

    expect(hidden.has("edit")).toBe(true)
    expect(hidden.has("write")).toBe(true) // maps to edit permission
    expect(hidden.has("apply_patch")).toBe(true) // maps to edit permission
    expect(hidden.has("bash")).toBe(true)
    expect(hidden.has("read")).toBe(false)
    expect(hidden.has("grep")).toBe(false)
  })

  test("overrides a build-like allow ruleset the way plan mode does for edit", () => {
    // Mirrors default build agent: edit/bash allow, then student denies win via merge order
    const buildLike = Permission.merge(
      Permission.fromConfig({ "*": "allow" }),
      Permission.fromConfig({ question: "allow", plan_enter: "allow" }),
    )
    const student = StudentMode.apply(buildLike, true)
    expect(Permission.evaluate("edit", "*", student).action).toBe("deny")
    expect(Permission.evaluate("bash", "*", student).action).toBe("deny")
    expect(Permission.evaluate("question", "*", student).action).toBe("allow")
  })
})

describe("StudentMode.enabled", () => {
  test("reads provisional OPENCODE_STUDENT_MODE env", () => {
    expect(StudentMode.enabled({ env: {} })).toBe(false)
    expect(StudentMode.enabled({ env: { OPENCODE_STUDENT_MODE: "0" } })).toBe(false)
    expect(StudentMode.enabled({ env: { OPENCODE_STUDENT_MODE: "1" } })).toBe(true)
    expect(StudentMode.enabled({ env: { OPENCODE_STUDENT_MODE: "true" } })).toBe(true)
  })

  test("prefers explicit config.student_mode when Task 2 sets it", () => {
    expect(StudentMode.enabled({ config: { student_mode: true }, env: {} })).toBe(true)
    expect(
      StudentMode.enabled({
        config: { student_mode: false },
        env: { OPENCODE_STUDENT_MODE: "1" },
      }),
    ).toBe(false)
  })
})
