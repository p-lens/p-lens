/**
 * サンプル帳簿, the sample book: three years of made-up play written as a
 * book of its own, for a person to see what a kept book comes to before
 * keeping one. It is scaffolding, to be taken out whole once the app has
 * spread, so the whole of it is here — its own core, its use case, its
 * worker and its screen — and the app reaches it only through this
 * index: the services name its maker (`SampleMaker`), the composition
 * starts it (`createSampleMakerClient`, and its worker by URL), and the
 * screen puts it on the rail (`useSampleBook`).
 */
export type { SampleMaker } from "./port/sample-maker"
export { createSampleMakerClient } from "./client/client"
export { useSampleBook } from "./ui/SampleBook"
