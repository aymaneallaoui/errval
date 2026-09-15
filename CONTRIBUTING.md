# Contributing

Thanks for looking. errnil is small on purpose, so most contributions are bug
fixes, type-level fixes, docs, and benchmarks. Bigger ideas are welcome too,
but open an issue first so we can talk about whether they fit before you spend
an evening on them.

## Setup

You need [bun](https://bun.sh) (the package manager and script runner here)
and Node 20 or newer (tests and examples run on both).

```sh
git clone https://github.com/aymaneallaoui/errnil
cd errnil
bun install
bun run check      # lint, typecheck, tests, type tests, build
```

Useful scripts:

| Script | What it does |
| --- | --- |
| `bun run test` | runtime tests plus type tests (vitest) |
| `bun run test:types` | only the `test/types/*.test-d.ts` files |
| `bun run typecheck` | `tsc` on everything, then on `src` with `isolatedDeclarations` |
| `bun run typecheck:next` | same check under the latest TypeScript 7 |
| `bun run lint:fix` | biome, with safe fixes applied |
| `bun run bench` | the mitata suite, writes `bench/results/<runtime>.json` |

## What a good change looks like

- One behaviour per pull request. Keep refactors out of bug fixes.
- Tests for anything user-visible. Type behaviour gets a type test
  (`expectTypeOf`, `@ts-expect-error`), runtime behaviour gets a normal test.
- Run the benchmarks if you touched `src/`. Paste the before and after for
  the groups that moved into the PR description. A change that makes
  `new TaggedError` or `attempt` slower needs a reason.
- No new dependencies. Zero is a feature of this package.
- Comments only where the code cannot say it: an invariant, a workaround,
  a reason. Prefer a better name.

## Style

Biome formats and lints; run `bun run lint:fix` before pushing. Double quotes,
no semicolons, 100 columns. Commit messages are one lowercase sentence in
conventional-commits form (`fix: keep cause enumerable on wrap`).

## Reporting bugs

Open an issue with the smallest snippet that shows the problem and the
TypeScript version you saw it on. Type-level bugs are the interesting ones;
a playground link is worth a lot.

## Release process

Maintainers only. Bump `version` in `package.json`, update `CHANGELOG.md`,
commit, tag `vX.Y.Z`, push the tag. The `release` workflow runs the full check
and publishes with npm trusted publishing (no tokens stored anywhere).
