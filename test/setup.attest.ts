import { setup, teardown } from "@ark/attest"

export default (): (() => void) => {
  setup({})
  return teardown
}
