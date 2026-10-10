import type { CatalogDto, CatalogVersionDto, CreatedDto, GameKindDto, QuotaDto } from "@p-lens/contracts"

import { all, decentName, id, isBody, keywords, machineName, object, oneOf, optionalHitChance, optionalModelName, releaseDay, type Body } from "../domain/body"
import type { ApiError } from "../domain/errors"
import * as Pachinko from "../domain/pachinko/formula"
import * as Pachislot from "../domain/pachislot/formula"
import { type Quotas, type RegistrationKind, standingOf } from "../domain/quota"
import { Err, Ok, type Result } from "../domain/result"
import { GAME_KINDS, type PreparedOfGame, storedOf } from "../domain/stored-formula"
import { TARGET_TYPES } from "../domain/tagging"
import type { Authenticate } from "../infrastructure/auth"
import type { Database } from "../infrastructure/database"
import type { Effects } from "../infrastructure/effects"
import type * as PachinkoEngine from "../infrastructure/pachinko/engine"
import type * as PachislotEngine from "../infrastructure/pachislot/engine"
import { addDistribution } from "../repositories/pachislot/distributions"
import { addFormula, type Mark, type MarkTarget, recordUse, setMark } from "../repositories/formulas"
import { catalogVersion, favoriteMachine, gameOfMachine, type MachineDescription, readCatalog, readMachine, registerMachine, searchMachines } from "../repositories/machines"
import { recordRegistration, registeredLately } from "../repositories/registrations"
import { createTag, createTagging, deleteTagging, tagExists, targetExists } from "../repositories/tags"
import { knownUser, type UserId, userFor } from "../repositories/users"
import type { Route } from "./router"

/** Everything a handler works with: the request, and the ports to the outside. */
export interface Context {
  readonly request: Request
  readonly url: URL
  readonly params: Readonly<Record<string, string>>
  readonly database: Database
  readonly effects: Effects
  /** The pachinko engine, started only by the handlers that publish a simulated formula. */
  readonly pachinkoEngine: () => PachinkoEngine.Engine
  /** The pachislot engine, started only by the handlers that publish a pachislot formula. */
  readonly pachislotEngine: () => PachislotEngine.Engine
  readonly authenticate: Authenticate
  /** The address the request came from, where the deployment is told it. */
  readonly address: string | undefined
  /** How much one device, and one address, may register in a day; none, and registering is not counted. */
  readonly quotas: Quotas | undefined
}

export interface Reply {
  readonly status: number
  readonly body: unknown
}

export type Handler = (context: Context) => Promise<Result<Reply, ApiError>>

const MARKS: readonly Mark[] = ["adoption", "rejection", "verification", "refutation", "favorite"]

export const ok = (body: unknown): Result<Reply, ApiError> => Ok({ status: 200, body })

const created = (body: unknown): Result<Reply, ApiError> => Ok({ status: 201, body })

export const noContent = (result: Result<void, ApiError>): Result<Reply, ApiError> => (result.ok ? Ok({ status: 204, body: undefined }) : result)

export const param = (context: Context, name: string): string => context.params[name] ?? ""

/** A request's JSON body. One that sends none — a mark set, a tagging removed — has an empty one. */
export const readBody = async (request: Request): Promise<Result<Body, ApiError>> => {
  try {
    const sent = await request.text()
    const parsed: unknown = sent.trim() === "" ? {} : JSON.parse(sent)
    return isBody(parsed) ? Ok(parsed) : Err({ type: "invalid-body", field: "", reason: "not-json" })
  } catch {
    return Err({ type: "invalid-body", field: "", reason: "not-json" })
  }
}

/** A write: which device is asking, and what it sent, before anything else. */
const writing =
  (work: (context: Context, user: UserId, body: Body) => Promise<Result<Reply, ApiError>>): Handler =>
  async (context) => {
    const identity = context.authenticate(context.request)
    if (!identity.ok) return identity
    const user = await userFor(context.database, context.effects, identity.value)
    if (!user.ok) return user
    const body = await readBody(context.request)
    return body.ok ? work(context, user.value, body.value) : body
  }

/** The address a registration is counted against, as its hash: the ledger never holds an address itself. */
const addressHashOf = async (context: Context): Promise<string | undefined> => (context.address === undefined ? undefined : context.effects.contentHash({ address: context.address }))

/**
 * Registering something new: refused before anything is read of it where
 * the device, or its address, has reached the quota of its kind, and
 * entered in the ledger once it is registered. What is refused for any
 * other reason counts against nothing.
 */
const registering = (kind: RegistrationKind, work: (context: Context, user: UserId, body: Body) => Promise<Result<Reply, ApiError>>): Handler =>
  writing(async (context, user, body) => {
    const quota = context.quotas?.[kind]
    if (quota === undefined) return work(context, user, body)
    const addressHash = await addressHashOf(context)
    const lately = await registeredLately(context.database, kind, user, addressHash, context.effects.now())
    if (!lately.ok) return lately
    const standing = standingOf(quota, lately.value.mine, lately.value.fromAddress, context.effects.now())
    if (standing.nextAt !== undefined) return Err({ type: "quota-reached", kind, nextAt: standing.nextAt })
    const reply = await work(context, user, body)
    if (!reply.ok) return reply
    const recorded = await recordRegistration(context.database, context.effects, kind, user, addressHash)
    return recorded.ok ? reply : recorded
  })

/** Where the device asking stands against each kind's quota, before it sets about registering anything. A device not seen yet stands as its address does. */
const getQuota: Handler = async (context) => {
  const quotas = context.quotas
  if (quotas === undefined) return ok({ type: "unlimited" } satisfies QuotaDto)
  const identity = context.authenticate(context.request)
  if (!identity.ok) return identity
  const user = await knownUser(context.database, identity.value)
  if (!user.ok) return user
  const addressHash = await addressHashOf(context)
  const now = context.effects.now()
  const standing = async (kind: RegistrationKind) => {
    const lately = await registeredLately(context.database, kind, user.value, addressHash, now)
    return lately.ok ? Ok(standingOf(quotas[kind], lately.value.mine, lately.value.fromAddress, now)) : lately
  }
  const machine = await standing("machine")
  if (!machine.ok) return machine
  const addition = await standing("addition")
  if (!addition.ok) return addition
  const tag = await standing("tag")
  return tag.ok ? ok({ type: "limited", machine: machine.value, addition: addition.value, tag: tag.value } satisfies QuotaDto) : tag
}

const requireFound = async (exists: Promise<Result<boolean, ApiError>>, missing: ApiError): Promise<Result<void, ApiError>> => {
  const found = await exists
  if (!found.ok) return found
  return found.value ? Ok(undefined) : Err(missing)
}

const getCatalogVersion: Handler = async (context) => {
  const version = await catalogVersion(context.database, context.effects)
  return version.ok ? ok({ version: version.value } satisfies CatalogVersionDto) : version
}

/** The whole catalog with the version it is: the version read first, so it is never newer than what it is sent with. */
const getCatalog: Handler = async (context) => {
  const version = await catalogVersion(context.database, context.effects)
  if (!version.ok) return version
  const machines = await readCatalog(context.database)
  return machines.ok ? ok({ version: version.value, machines: machines.value } satisfies CatalogDto) : machines
}

/** The game a search is narrowed to, if one is named: `?game=pachislot`. */
const gameAsked = (context: Context): Result<GameKindDto | undefined, ApiError> => {
  const asked = context.url.searchParams.get("game")
  return asked === null ? Ok(undefined) : oneOf({ game: asked }, "game", GAME_KINDS)
}

const getMachines: Handler = async (context) => {
  const game = gameAsked(context)
  if (!game.ok) return game
  const found = await searchMachines(context.database, context.url.searchParams.get("q") ?? "", game.value)
  return found.ok ? ok(found.value) : found
}

const getMachine: Handler = async (context) => {
  const found = await readMachine(context.database, param(context, "id"))
  return found.ok ? ok(found.value) : found
}

/**
 * A formula sent for a machine of a game, read for shape and made ready by
 * that game's engine: what is stored is derived from its basis, never taken
 * on trust.
 */
const preparedFor = (context: Context, gameKind: GameKindDto, body: Body): Result<PreparedOfGame, ApiError> => {
  if (gameKind === "pachinko") {
    const sent = Pachinko.readFormula(body)
    if (!sent.ok) return sent
    const prepared = Pachinko.prepareFormula(sent.value, context.pachinkoEngine())
    return prepared.ok ? Ok({ gameKind, formula: prepared.value }) : prepared
  }
  const sent = Pachislot.readFormula(body)
  if (!sent.ok) return sent
  const prepared = Pachislot.prepareFormula(sent.value, context.pachislotEngine())
  return prepared.ok ? Ok({ gameKind, formula: prepared.value }) : prepared
}

/** A machine with its first formula, both or neither, in the game it says it is. A machine is registered with its model name, and a pachinko machine with its 大当り確率: an administrator may still describe one without. */
/** How a machine is described, read from a body: its name, and its model name, 大当り確率 and keywords where given. */
export const descriptionOf = (body: Body): Result<MachineDescription, ApiError> =>
  all({
    name: machineName(body, "name"),
    modelName: optionalModelName(body, "modelName"),
    keywords: keywords(body, "keywords"),
    hitChance: optionalHitChance(body, "hitChance"),
  })

const postMachine = registering("machine", async (context, user, body) => {
  const fields = all({
    gameKind: oneOf(body, "gameKind", GAME_KINDS),
    description: descriptionOf(body),
    releasedOn: releaseDay(body, "releasedOn", context.effects.now().slice(0, 10)),
    formula: object(body, "formula"),
  })
  if (!fields.ok) return fields
  if (fields.value.description.modelName === undefined) return Err({ type: "invalid-body", field: "modelName", reason: "missing" })
  if (fields.value.gameKind === "pachinko" && fields.value.description.hitChance === undefined) return Err({ type: "invalid-body", field: "hitChance", reason: "missing" })
  if (fields.value.gameKind !== "pachinko" && fields.value.description.hitChance !== undefined) return Err({ type: "invalid-body", field: "hitChance", reason: "unknown-value" })
  const prepared = preparedFor(context, fields.value.gameKind, fields.value.formula)
  if (!prepared.ok) return prepared
  const machine = { ...fields.value.description, gameKind: fields.value.gameKind, releasedOn: fields.value.releasedOn }
  const registered = await registerMachine(context.database, context.effects, user, machine, storedOf(prepared.value))
  return registered.ok ? created(registered.value) : registered
})

/** The game of the machine a route names, or not found. */
const machineGame = async (context: Context): Promise<Result<GameKindDto, ApiError>> => {
  const found = await gameOfMachine(context.database, param(context, "id"))
  if (!found.ok) return found
  return found.value === undefined ? Err({ type: "not-found", what: "machine" }) : Ok(found.value)
}

const postFormula = registering("addition", async (context, user, body) => {
  const game = await machineGame(context)
  if (!game.ok) return game
  const prepared = preparedFor(context, game.value, body)
  if (!prepared.ok) return prepared
  const added = await addFormula(context.database, context.effects, user, param(context, "id"), storedOf(prepared.value))
  return added.ok ? created(added.value) : added
})

/** A 設定配分 for a pachislot machine: a pachinko machine has no setting levels to spread. */
const postDistribution = registering("addition", async (context, user, body) => {
  const game = await machineGame(context)
  if (!game.ok) return game
  if (game.value !== "pachislot") return Err({ type: "not-for-game", what: "distribution" })
  const sent = Pachislot.readDistribution(body)
  if (!sent.ok) return sent
  const added = await addDistribution(context.database, context.effects, user, param(context, "id"), sent.value)
  return added.ok ? created(added.value) : added
})

const markOf = (context: Context): Result<Mark, ApiError> => oneOf({ mark: param(context, "mark") }, "mark", MARKS)

/** The handlers marking, and counting the uses of, one kind of target. */
const marksOn = (target: MarkTarget) => ({
  put: writing(async (context, user) => {
    const mark = markOf(context)
    return mark.ok ? noContent(await setMark(context.database, context.effects, user, target, param(context, "id"), mark.value, true)) : mark
  }),
  remove: writing(async (context, user) => {
    const mark = markOf(context)
    return mark.ok ? noContent(await setMark(context.database, context.effects, user, target, param(context, "id"), mark.value, false)) : mark
  }),
  use: writing(async (context, user) => noContent(await recordUse(context.database, context.effects, user, target, param(context, "id")))),
})

const FORMULA_MARKS = marksOn("formula")
const DISTRIBUTION_MARKS = marksOn("distribution")

const putFavorite = writing(async (context, user) => {
  const game = await machineGame(context)
  return game.ok ? noContent(await favoriteMachine(context.database, context.effects, user, param(context, "id"), true)) : game
})

const deleteFavorite = writing(async (context, user) => noContent(await favoriteMachine(context.database, context.effects, user, param(context, "id"), false)))

const postTag = registering("tag", async (context, user, body) => {
  const name = decentName(body, "name")
  if (!name.ok) return name
  const made = await createTag(context.database, context.effects, user, name.value)
  return made.ok ? created({ id: made.value } satisfies CreatedDto) : made
})

const postTagging = registering("tag", async (context, user, body) => {
  const fields = all({ tagId: id(body, "tagId"), targetType: oneOf(body, "targetType", TARGET_TYPES), targetId: id(body, "targetId") })
  if (!fields.ok) return fields
  const tag = await requireFound(tagExists(context.database, fields.value.tagId), { type: "not-found", what: "tag" })
  if (!tag.ok) return tag
  const target = await requireFound(targetExists(context.database, fields.value.targetType, fields.value.targetId), { type: "not-found", what: "target" })
  if (!target.ok) return target
  const made = await createTagging(context.database, context.effects, user, fields.value)
  return made.ok ? created({ id: made.value } satisfies CreatedDto) : made
})

const removeTagging = writing(async (context, user) => noContent(await deleteTagging(context.database, user, param(context, "id"))))

/** Every route the API has. Reads are open; writes name their device. None calculates. */
export const ROUTES: readonly Route<Handler>[] = [
  { method: "GET", path: "/catalog", handler: getCatalog },
  { method: "GET", path: "/catalog/version", handler: getCatalogVersion },
  { method: "GET", path: "/quota", handler: getQuota },
  { method: "GET", path: "/machines", handler: getMachines },
  { method: "POST", path: "/machines", handler: postMachine },
  { method: "GET", path: "/machines/:id", handler: getMachine },
  { method: "POST", path: "/machines/:id/formulas", handler: postFormula },
  { method: "POST", path: "/machines/:id/distributions", handler: postDistribution },
  { method: "PUT", path: "/machines/:id/favorite", handler: putFavorite },
  { method: "DELETE", path: "/machines/:id/favorite", handler: deleteFavorite },
  { method: "PUT", path: "/formulas/:id/marks/:mark", handler: FORMULA_MARKS.put },
  { method: "DELETE", path: "/formulas/:id/marks/:mark", handler: FORMULA_MARKS.remove },
  { method: "POST", path: "/formulas/:id/uses", handler: FORMULA_MARKS.use },
  { method: "PUT", path: "/distributions/:id/marks/:mark", handler: DISTRIBUTION_MARKS.put },
  { method: "DELETE", path: "/distributions/:id/marks/:mark", handler: DISTRIBUTION_MARKS.remove },
  { method: "POST", path: "/distributions/:id/uses", handler: DISTRIBUTION_MARKS.use },
  { method: "POST", path: "/tags", handler: postTag },
  { method: "POST", path: "/taggings", handler: postTagging },
  { method: "DELETE", path: "/taggings/:id", handler: removeTagging },
]
