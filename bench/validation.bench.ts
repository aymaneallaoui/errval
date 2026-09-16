import * as sb from "@superbuilders/errors"
import { Data } from "effect"
import { bench, do_not_optimize, group, summary } from "mitata"
import { type Result as NResult, err as nerr, ok as nok } from "neverthrow"
import { fail, join, ok, type Result, TaggedError } from "../src/index.ts"
import { rotate } from "./shared.ts"

// Validating a ten-field form where several fields fail. Every invalid field produces
// one error value; the caller wants all of them, not just the first. This is the shape
// of input validation, batch imports and linters: many small expected failures.

type Form = Record<string, string>
const FIELDS = [
  "name",
  "email",
  "age",
  "street",
  "city",
  "zip",
  "country",
  "phone",
  "company",
  "role",
]

function makeForms(count: number, invalidPerForm: number): Form[] {
  const forms: Form[] = []
  for (let i = 0; i < count; i++) {
    const form: Form = {}
    FIELDS.forEach((f, j) => {
      form[f] = (j + i) % FIELDS.length < invalidPerForm ? "" : `value ${i}`
    })
    forms.push(form)
  }
  return forms
}

class Invalid extends TaggedError("Invalid")<{ readonly field: string }> {}

function errvalValidate(form: Form): Result<Form, Invalid> {
  const errors: Invalid[] = []
  for (const field of FIELDS) {
    if (form[field] === "") errors.push(new Invalid({ field }))
  }
  return errors.length === 0 ? ok(form) : fail(join(errors) as unknown as Invalid)
}

class InvalidError extends Error {
  readonly field: string
  constructor(field: string) {
    super(`invalid ${field}`)
    this.field = field
  }
}
function throwValidate(form: Form): Form {
  const errors: InvalidError[] = []
  for (const field of FIELDS) {
    if (form[field] === "") errors.push(new InvalidError(field))
  }
  if (errors.length > 0) throw new AggregateError(errors, "invalid form")
  return form
}

function neverthrowValidate(form: Form): NResult<Form, { field: string }[]> {
  const errors: { field: string }[] = []
  for (const field of FIELDS) {
    if (form[field] === "") errors.push({ field })
  }
  return errors.length === 0 ? nok(form) : nerr(errors)
}

class EInvalid extends Data.TaggedError("Invalid")<{ readonly field: string }> {}
function effectDataValidate(form: Form): EInvalid[] | Form {
  const errors: EInvalid[] = []
  for (const field of FIELDS) {
    if (form[field] === "") errors.push(new EInvalid({ field }))
  }
  return errors.length === 0 ? form : errors
}

function sbValidate(form: Form): Form {
  const errors: Error[] = []
  for (const field of FIELDS) {
    if (form[field] === "") errors.push(sb.new(`invalid ${field}`))
  }
  if (errors.length > 0) throw new AggregateError(errors, "invalid form")
  return form
}

for (const invalid of [0, 2, 5]) {
  const forms = makeForms(500, invalid)
  group(`validate a 10-field form, ${invalid} invalid fields`, () => {
    summary(() => {
      const next = rotate(forms)
      bench("errval (TaggedError + join)", () => {
        const [err, form] = errvalValidate(next())
        do_not_optimize(err ? err.message.length : form)
      }).baseline(true)
      const next2 = rotate(forms)
      bench("throw AggregateError of Error subclass", () => {
        try {
          do_not_optimize(throwValidate(next2()))
        } catch (e) {
          do_not_optimize((e as AggregateError).errors.length)
        }
      })
      const next3 = rotate(forms)
      bench("neverthrow err(plain objects)", () => {
        const r = neverthrowValidate(next3())
        do_not_optimize(r.isErr() ? r.error.length : r.value)
      })
      const next4 = rotate(forms)
      bench("effect Data.TaggedError values", () => do_not_optimize(effectDataValidate(next4())))
      const next5 = rotate(forms)
      bench("@superbuilders/errors.new + AggregateError", () => {
        try {
          do_not_optimize(sbValidate(next5()))
        } catch (e) {
          do_not_optimize((e as AggregateError).errors.length)
        }
      })
    })
  })
}
