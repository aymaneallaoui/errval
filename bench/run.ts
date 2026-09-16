import { mkdirSync, writeFileSync } from "node:fs"
import { run } from "mitata"

// Usage: bun run bench/run.ts [filter]   or   node bench/run.ts [filter]
// Writes bench/results/<runtime>.json next to the console report.

await import("./creation.bench.ts")
await import("./handler.bench.ts")
await import("./propagation.bench.ts")
await import("./async.bench.ts")
await import("./validation.bench.ts")

const bun = (globalThis as { Bun?: { version: string } }).Bun
const runtime = bun ? `bun-${bun.version}` : `node-${process.versions.node}`

const trial = process.argv[2]
  ? await run({ filter: new RegExp(process.argv[2]), format: "mitata" })
  : await run({ format: "mitata" })

mkdirSync("bench/results", { recursive: true })
writeFileSync(
  `bench/results/${runtime}.json`,
  JSON.stringify({ runtime, date: new Date().toISOString(), trial }, null, 2),
)
