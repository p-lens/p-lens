/**
 * Copy the built hledger module into the app.
 *
 *   bun run sync-hledger      after  ../../wasm/scripts/build.sh
 *
 * The wasm is served as a plain asset and precached; the glue is a module the
 * worker imports. Both are committed, because rebuilding them needs the
 * ghc-wasm toolchain, and land in the same commit as the wasm/ source they
 * were built from.
 */
import { copyFile } from "node:fs/promises"

const OUT = "../../wasm/out"

const copies = [
  [`${OUT}/hledger-bindings.wasm`, "public/hledger.wasm"],
  [`${OUT}/hledger-bindings.jsffi.mjs`, "src/hledger/worker/ghc-jsffi.mjs"],
] as const

const copied = await Promise.allSettled(copies.map(([from, to]) => copyFile(from, to).then(() => `${from} -> ${to}`)))

copied.forEach((outcome, index) =>
  outcome.status === "fulfilled"
    ? console.log(outcome.value)
    : console.error(`missing ${copies[index]?.[0]}; run ../../wasm/scripts/build.sh first`),
)

process.exitCode = copied.every((outcome) => outcome.status === "fulfilled") ? 0 : 1
