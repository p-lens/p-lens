import type { AllotmentDto, LuckyTriggerDto, NextDto, ComponentsDto, SpecDto, ProbabilityDto, ReliefDriveDto } from "@p-lens/contracts/pachinko"
import { SPEC_VERSION } from "@p-lens/contracts/pachinko"

/** What a mode is, as its spec sheet says: which kind component its entity has. */
export type ModeKind =
  | { readonly type: "special-time"; readonly spins: number; readonly chance: ProbabilityDto }
  | { readonly type: "rapid"; readonly spins: number }
  | { readonly type: "leftover-queue"; readonly draws: number }
  | { readonly type: "rushing"; readonly continuationRate: ProbabilityDto }
  | { readonly type: "until-hit" }

/** A mode as a query assembles it from its entity's components. */
export interface ModeView {
  readonly id: string
  readonly label: string
  readonly kind: ModeKind
  readonly allotment: readonly AllotmentDto[]
  readonly onMiss: NextDto
  readonly luckyTrigger: LuckyTriggerDto | undefined
}

/** The regular game as a query assembles it from its entity. */
export interface RegularView {
  readonly entity: string
  readonly chance: ProbabilityDto
  readonly allotment: readonly AllotmentDto[]
  readonly reliefDrive: ReliefDriveDto | undefined
}

/** The entity that is the regular game, by its `regularGame` component. */
const regularEntity = (spec: SpecDto): string | undefined => Object.keys(spec.components.regularGame ?? {}).at(0)

/**
 * The regular game, if the world has one with its allotment. Whether the world
 * is well made is the engine's to say; this only reads what is there.
 */
export const regularOf = (spec: SpecDto): RegularView | undefined => {
  const entity = regularEntity(spec)
  const game = entity === undefined ? undefined : spec.components.regularGame?.[entity]
  const allotment = entity === undefined ? undefined : spec.components.allotment?.[entity]
  return entity === undefined || game === undefined || allotment === undefined
    ? undefined
    : { entity, chance: game.chance, allotment, reliefDrive: spec.components.reliefDrive?.[entity] }
}

const kindOf = (components: ComponentsDto, entity: string): ModeKind | undefined => {
  const special = components.specialTime?.[entity]
  if (special !== undefined) return { type: "special-time", spins: special.spins, chance: special.chance }
  const rapid = components.rapid?.[entity]
  if (rapid !== undefined) return { type: "rapid", spins: rapid.spins }
  const queue = components.leftoverQueue?.[entity]
  if (queue !== undefined) return { type: "leftover-queue", draws: queue.draws }
  const rushing = components.rushing?.[entity]
  if (rushing !== undefined) return { type: "rushing", continuationRate: rushing.continuationRate }
  return components.untilHit?.includes(entity) === true ? { type: "until-hit" } : undefined
}

/** Every mode whose entity has the components a mode needs, in the order the entities were made. */
export const modesOf = (spec: SpecDto): readonly ModeView[] => {
  const components = spec.components
  return spec.entities.flatMap((id): readonly ModeView[] => {
    const kind = kindOf(components, id)
    const allotment = components.allotment?.[id]
    const onMiss = components.onMiss?.[id]
    return kind === undefined || allotment === undefined || onMiss === undefined
      ? []
      : [{ id, label: components.label?.[id] ?? id, kind, allotment, onMiss, luckyTrigger: components.luckyTrigger?.[id] }]
  })
}

/** Each mode's label by its entity, as the person writing the spec named it. */
export const labelsOf = (spec: SpecDto): ReadonlyMap<string, string> => new Map(modesOf(spec).map((mode) => [mode.id, mode.label]))

const record = <T>(pairs: readonly (readonly [string, T])[]): Readonly<Record<string, T>> => Object.fromEntries(pairs)

/** The entity the regular game is made in. */
export const REGULAR_ENTITY = "regular"

/**
 * The world a regular game and its modes make: an entity for the regular game
 * with its components, and one per mode with each component it has.
 */
export const assembleWorld = (
  regular: { readonly chance: ProbabilityDto; readonly allotment: readonly AllotmentDto[]; readonly reliefDrive: ReliefDriveDto | undefined },
  modes: readonly ModeView[],
  payout: SpecDto["resources"]["payout"],
): SpecDto => {
  const specialTimes = modes.flatMap((mode) => (mode.kind.type === "special-time" ? [[mode.id, { spins: mode.kind.spins, chance: mode.kind.chance }] as const] : []))
  const rapids = modes.flatMap((mode) => (mode.kind.type === "rapid" ? [[mode.id, { spins: mode.kind.spins }] as const] : []))
  const queues = modes.flatMap((mode) => (mode.kind.type === "leftover-queue" ? [[mode.id, { draws: mode.kind.draws }] as const] : []))
  const rushings = modes.flatMap((mode) => (mode.kind.type === "rushing" ? [[mode.id, { continuationRate: mode.kind.continuationRate }] as const] : []))
  const triggers = modes.flatMap((mode) => (mode.luckyTrigger === undefined ? [] : [[mode.id, mode.luckyTrigger] as const]))
  return {
    v: SPEC_VERSION,
    entities: [REGULAR_ENTITY, ...modes.map((mode) => mode.id)],
    components: {
      regularGame: record([[REGULAR_ENTITY, { chance: regular.chance }]]),
      label: record(modes.map((mode) => [mode.id, mode.label] as const)),
      allotment: record([[REGULAR_ENTITY, regular.allotment] as const, ...modes.map((mode) => [mode.id, mode.allotment] as const)]),
      ...(specialTimes.length === 0 ? {} : { specialTime: record(specialTimes) }),
      ...(rapids.length === 0 ? {} : { rapid: record(rapids) }),
      ...(queues.length === 0 ? {} : { leftoverQueue: record(queues) }),
      ...(rushings.length === 0 ? {} : { rushing: record(rushings) }),
      ...(modes.some((mode) => mode.kind.type === "until-hit") ? { untilHit: modes.filter((mode) => mode.kind.type === "until-hit").map((mode) => mode.id) } : {}),
      onMiss: record(modes.map((mode) => [mode.id, mode.onMiss] as const)),
      ...(triggers.length === 0 ? {} : { luckyTrigger: record(triggers) }),
      ...(regular.reliefDrive === undefined ? {} : { reliefDrive: record([[REGULAR_ENTITY, regular.reliefDrive]]) }),
    },
    resources: { payout },
  }
}
