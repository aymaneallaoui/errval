import * as sb from "@superbuilders/errors"
import { Data } from "effect"
import { bench, do_not_optimize, group, summary } from "mitata"
import { err as nerr } from "neverthrow"
import { fail, TaggedError } from "../src/index.ts"
import { NotFound, NotFoundError } from "./shared.ts"

// Cost of producing one domain error value. Stack capture is what separates the fast
// and slow rows: errnil skips it unless you ask, everything built on `new Error` pays it.

class Traced extends TaggedError("NotFoundTraced", { stack: true })<{ readonly id: string }> {}
class NativeNotFound extends TaggedError("NotFoundNative", { native: true })<{
  readonly id: string
}> {}
class ENotFound extends Data.TaggedError("NotFound")<{ readonly id: string }> {}

let n = 0
function nextId(): string {
  n = (n + 1) & 1023
  return `u${n}`
}

group("create one domain error", () => {
  summary(() => {
    bench("errnil TaggedError", () => do_not_optimize(new NotFound({ id: nextId() }))).baseline(
      true,
    )
    bench("errnil TaggedError, stack: true", () => do_not_optimize(new Traced({ id: nextId() })))
    bench("errnil TaggedError, native: true", () =>
      do_not_optimize(new NativeNotFound({ id: nextId() })),
    )
    bench("plain object literal", () => do_not_optimize({ name: "NotFound", id: nextId() }))
    bench("new Error subclass", () => do_not_optimize(new NotFoundError(nextId())))
    bench("effect Data.TaggedError", () => do_not_optimize(new ENotFound({ id: nextId() })))
    bench("@superbuilders/errors.new", () => do_not_optimize(sb.new(`user ${nextId()} not found`)))
  })
})

group("create one failed result", () => {
  summary(() => {
    bench("errnil fail(new NotFound)", () =>
      do_not_optimize(fail(new NotFound({ id: nextId() }))),
    ).baseline(true)
    bench("neverthrow err(new Error)", () => do_not_optimize(nerr(new NotFoundError(nextId()))))
    bench("neverthrow err(object)", () => do_not_optimize(nerr({ kind: "notfound", id: nextId() })))
  })
})
