import type { CatalogDto, MachineDetailDto, RegisterMachineDto } from "@p-lens/contracts"

import type { CatalogTarget, NewFormula, NewMachine } from "../../core/catalog/catalog"
import {
  checks,
  distributionDto,
  entryOf,
  locate,
  machineNamed,
  markable,
  pachinkoFormulaDto,
  pachislotFormulaDto,
  searchDelivered,
} from "../../core/catalog/delivered"
import { quotaOf } from "../../core/catalog/quota"
import type { MachineId } from "../../core/machine/machine"
import type { Mark } from "../../core/formula/standing"
import { Err, Ok, andThen, collect, mapOk, type Result } from "../../core/result/result"
import { CATALOG, CATALOG_OUTBOX, type Connection, completionOf, resultOf } from "../../storage/browser/database"
import type { StorageError } from "../../storage/port/book-storage"
import type { Catalog, CatalogError, Solved } from "../port/catalog"
import type { ApiFailure, CatalogApi, CatalogRequest } from "../port/catalog-api"

/** The delivered catalog as kept: one record, its version and the whole of it. */
interface DeliveredRecord {
  readonly key: "delivered"
  readonly version: string
  readonly deliveredAt: string
  readonly machines: readonly MachineDetailDto[]
}

type Fields = Readonly<Record<string, unknown>>

const isFields = (value: unknown): value is Fields => typeof value === "object" && value !== null && !Array.isArray(value)

const isMachineDetail = (value: unknown): value is MachineDetailDto => isFields(value) && isFields(value["machine"]) && typeof value["machine"]["id"] === "string" && Array.isArray(value["formulas"])

const isDeliveredRecord = (value: unknown): value is DeliveredRecord =>
  isFields(value) &&
  value["key"] === "delivered" &&
  typeof value["version"] === "string" &&
  typeof value["deliveredAt"] === "string" &&
  Array.isArray(value["machines"]) &&
  value["machines"].every(isMachineDetail)

const METHODS: ReadonlySet<unknown> = new Set(["PUT", "DELETE", "POST"])

const isRequest = (value: unknown): value is CatalogRequest =>
  isFields(value) && METHODS.has(value["method"]) && typeof value["path"] === "string" && (value["as"] === undefined || typeof value["as"] === "string")

const isOutboxRecord = (value: unknown): value is OutboxRecord => isFields(value) && typeof value["id"] === "string" && isRequest(value["request"])

/** What a store gave back, as what it must be, or that it does not read. */
const keptAs = <T>(value: unknown, is: (kept: unknown) => kept is T): Result<T, CatalogError> => (is(value) ? Ok(value) : Err({ type: "unreadable-kept" }))

/** A mark or a use waiting to be sent, keyed so they go in the order they were made. */
interface OutboxRecord {
  readonly id: string
  readonly request: CatalogRequest
}

interface Effects {
  readonly newId: () => string
  readonly now: () => string
}

const fromStorageError = (error: StorageError): CatalogError => (error.type === "unreadable" ? { type: "unreadable-kept" } : { type: "storage-unavailable" })

const fromStorage = <T>(result: Result<T, StorageError>): Result<T, CatalogError> => (result.ok ? result : Err(fromStorageError(result.error)))

/** What was being sent, for an answer to be told against: the machine it was for, or the machine being registered and those delivered. */
type Sending =
  | { readonly type: "other" }
  | { readonly type: "to-machine"; readonly machineId: MachineId }
  | { readonly type: "registering"; readonly machine: RegisterMachineDto; readonly machines: readonly MachineDetailDto[] }

const OTHER: Sending = { type: "other" }

/** Whether the shared catalog said a formula's 解析値 were too heavy for it to solve: its word alone, never a bare 503, which says nothing of why. */
const tooHeavy = (failure: Extract<ApiFailure, { type: "answered" }>): boolean =>
  failure.error.type === "basis-rejected" && isJson(failure.error["error"]) && failure.error["error"]["type"] === "too-heavy"

const isJson = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value)

/**
 * What the shared catalog's answer means here. A name already taken is told
 * with the machine that has it, if it has been delivered.
 */
const fromApi = (failure: ApiFailure, sending: Sending): CatalogError => {
  switch (failure.type) {
    case "absent":
      return { type: "no-catalog" }
    case "unreachable":
      return { type: "unavailable", detail: failure.detail }
    case "timed-out":
      return sending.type === "other" ? { type: "unavailable", detail: "timed out" } : { type: "unanswered" }
    case "unreadable-answer":
      return { type: "unreadable-answer" }
    case "answered": {
      const { error } = failure
      if (error.type === "conflict" && error["what"] === "model-name" && sending.type === "registering") return { type: "model-name-taken", modelName: sending.machine.modelName ?? "" }
      if (error.type === "conflict" && sending.type === "registering")
        return { type: "name-taken", name: sending.machine.name, existing: machineNamed(sending.machines, sending.machine.name, sending.machine.gameKind) }
      if (error.type === "not-found" && sending.type === "to-machine") return { type: "machine-missing", id: sending.machineId }
      if (error.type === "not-verifiable") return { type: "not-verifiable" }
      if (sending.type !== "other" && tooHeavy(failure)) return { type: "too-heavy" }
      if (sending.type !== "other" && failure.status === 503 && failure.error.type === "unexpected") return { type: "gave-up" }
      if (error.type === "check-stands") return { type: "check-stands" }
      if (error.type === "quota-reached" && typeof error["nextAt"] === "string" && (error["kind"] === "machine" || error["kind"] === "addition"))
        return { type: "quota-reached", kind: error["kind"], nextAt: error["nextAt"] }
      return { type: "refused", reason: error.type }
    }
  }
}

/**
 * Whether a failure to send is for good — the shared catalog answered and
 * would answer the same again — or only for now, as when it is unreachable,
 * this device has written too much for the moment (429), or something not
 * the catalog answered in its place: a 4xx with no error of the catalog's.
 */
const forGood = (failure: ApiFailure): boolean => failure.type === "answered" && failure.status >= 400 && failure.status < 500 && failure.status !== 429 && failure.error.type !== "unexpected"

/** The formula or 設定配分 a request waiting to be sent puts a mark on, by its id: none for a use. */
const markedIn = (request: CatalogRequest): readonly string[] => {
  const found = /^\/(?:formulas|distributions)\/([^/]+)\/marks\//.exec(request.path)?.[1]
  return found === undefined ? [] : [decodeURIComponent(found)]
}

const pathOf = (target: CatalogTarget): string => `/${target.type === "formula" ? "formulas" : "distributions"}/${encodeURIComponent(target.id)}`

const newFormulaDto = (formula: NewFormula, solved: Solved) =>
  formula.gameKind === "pachinko" ? pachinkoFormulaDto(formula.formula) : pachislotFormulaDto(formula.formula, solved === "on-device")

/** A new machine's description as it is sent: what was left out is left out, never sent empty. */
const describedAs = (machine: NewMachine) => ({
  name: machine.name,
  ...(machine.modelName === undefined ? {} : { modelName: machine.modelName }),
  ...(machine.keywords.length === 0 ? {} : { keywords: machine.keywords }),
  ...(machine.hitChance === undefined ? {} : { hitChance: machine.hitChance }),
  releasedOn: machine.releasedOn,
})

const registration = (machine: NewMachine, formula: NewFormula, solved: Solved): RegisterMachineDto =>
  formula.gameKind === "pachinko"
    ? { ...describedAs(machine), gameKind: "pachinko", formula: pachinkoFormulaDto(formula.formula) }
    : { ...describedAs(machine), gameKind: "pachislot", formula: pachislotFormulaDto(formula.formula, solved === "on-device") }

/**
 * The shared catalog as this device holds it, in IndexedDB: delivered whole,
 * read without asking anyone, so a play needs no network at all. What is
 * registered goes to the shared catalog at once and comes back with a
 * delivery; marks and uses are kept here at once and wait in the outbox,
 * sent in order whenever the catalog is refreshed. One refresh runs at a
 * time; asking again while one runs refreshes once more after it, so what
 * was kept in between is sent too.
 */
export const createDeliveredCatalog = (database: Connection, api: CatalogApi, effects: Effects): Catalog => {
  const held: { delivered: DeliveredRecord | undefined; refreshing: Promise<Result<{ readonly changed: boolean }, CatalogError>> | undefined } = {
    delivered: undefined,
    refreshing: undefined,
  }

  const opened = async (): Promise<Result<IDBDatabase, CatalogError>> => fromStorage(await database())

  const deliveredRecord = async (): Promise<Result<DeliveredRecord | undefined, CatalogError>> => {
    if (held.delivered !== undefined) return Ok(held.delivered)
    const db = await opened()
    if (!db.ok) return db
    const read = andThen(fromStorage(await resultOf<unknown>(db.value.transaction(CATALOG).objectStore(CATALOG).get("delivered"))), (kept) => (kept === undefined ? Ok(undefined) : keptAs(kept, isDeliveredRecord)))
    if (read.ok) held.delivered = read.value
    return read
  }

  const machines = async (): Promise<Result<readonly MachineDetailDto[], CatalogError>> => mapOk(await deliveredRecord(), (record) => record?.machines ?? [])

  const search: Catalog["search"] = async (query, gameKind) => mapOk(await machines(), (delivered) => searchDelivered(delivered, query, gameKind))

  const read: Catalog["read"] = async (machineId) => {
    const delivered = await machines()
    if (!delivered.ok) return delivered
    const detail = delivered.value.find((each) => each.machine.id === machineId)
    if (detail === undefined) return Err({ type: "machine-missing", id: machineId })
    return Ok(entryOf(detail))
  }

  const register: Catalog["register"] = async (machine, formula, solved = "by-catalog") => {
    const dto = registration(machine, formula, solved)
    const sent = await api.register(dto)
    if (sent.ok) return Ok({ machineId: sent.value.machineId as MachineId, id: sent.value.formulaId })
    const delivered = await machines()
    return Err(fromApi(sent.error, { type: "registering", machine: dto, machines: delivered.ok ? delivered.value : [] }))
  }

  const addFormula: Catalog["addFormula"] = async (machineId, formula, solved = "by-catalog") => {
    const sent = await api.addFormula(machineId, newFormulaDto(formula, solved))
    return sent.ok ? Ok({ machineId, id: sent.value.id }) : Err(fromApi(sent.error, { type: "to-machine", machineId }))
  }

  const addDistribution: Catalog["addDistribution"] = async (machineId, distribution) => {
    const sent = await api.addDistribution(machineId, distributionDto(distribution))
    return sent.ok ? Ok({ machineId, id: sent.value.id }) : Err(fromApi(sent.error, { type: "to-machine", machineId }))
  }

  const quota: Catalog["quota"] = async () => {
    const asked = await api.quota()
    return asked.ok ? Ok(quotaOf(asked.value)) : Err(fromApi(asked.error, OTHER))
  }

  const missing = (target: CatalogTarget): CatalogError =>
    target.type === "formula" ? { type: "formula-missing", id: target.id } : { type: "distribution-missing", id: target.id }

  const queued = (transaction: IDBTransaction, request: CatalogRequest): void => {
    transaction.objectStore(CATALOG_OUTBOX).put({ id: effects.newId(), request } satisfies OutboxRecord)
  }

  const mark: Catalog["mark"] = async (target, kind: Mark, on, voter) => {
    if (!markable(target, kind)) return Err({ type: "not-markable", mark: kind })
    const delivered = await machines()
    if (!delivered.ok) return delivered
    const located = locate(delivered.value, target)
    if (located === undefined) return Err(missing(target))
    if (checks(kind) && !on) return Err({ type: "check-stands" })
    if (checks(kind) && !located.checkable) return Err({ type: "not-verifiable" })
    const db = await opened()
    if (!db.ok) return db
    const transaction = db.value.transaction(CATALOG_OUTBOX, "readwrite")
    queued(transaction, { method: on ? "PUT" : "DELETE", path: `${pathOf(target)}/marks/${kind}`, as: voter })
    return fromStorage(await completionOf(transaction))
  }

  const recordUse: Catalog["recordUse"] = async (target) => {
    const db = await opened()
    if (!db.ok) return db
    const transaction = db.value.transaction(CATALOG_OUTBOX, "readwrite")
    queued(transaction, { method: "POST", path: `${pathOf(target)}/uses` })
    return fromStorage(await completionOf(transaction))
  }

  /** The waiting from the first on, sent in order until one cannot be sent for now; one the shared catalog refuses for good is let go. */
  const sentFrom = async (db: IDBDatabase, waiting: readonly OutboxRecord[]): Promise<Result<void, CatalogError>> => {
    const [record, ...rest] = waiting
    if (record === undefined) return Ok(undefined)
    const sent = await api.send(record.request)
    if (!sent.ok && !forGood(sent.error)) return Err(fromApi(sent.error, OTHER))
    const transaction = db.transaction(CATALOG_OUTBOX, "readwrite")
    transaction.objectStore(CATALOG_OUTBOX).delete(record.id)
    const removed = fromStorage(await completionOf(transaction))
    return removed.ok ? sentFrom(db, rest) : removed
  }

  const waitingIn = async (db: IDBDatabase): Promise<Result<readonly OutboxRecord[], CatalogError>> =>
    andThen(fromStorage(await resultOf<unknown[]>(db.transaction(CATALOG_OUTBOX).objectStore(CATALOG_OUTBOX).getAll())), (kept) => collect((kept ?? []).map((each) => keptAs(each, isOutboxRecord))))

  const flush = async (): Promise<Result<void, CatalogError>> => {
    const db = await opened()
    if (!db.ok) return db
    const waiting = await waitingIn(db.value)
    return waiting.ok ? sentFrom(db.value, waiting.value) : waiting
  }

  const unsentMarks: Catalog["unsentMarks"] = async () => {
    const db = await opened()
    if (!db.ok) return db
    return mapOk(await waitingIn(db.value), (waiting) => new Set(waiting.flatMap((record) => markedIn(record.request))))
  }

  const deliver = async (catalog: CatalogDto): Promise<Result<void, CatalogError>> => {
    const db = await opened()
    if (!db.ok) return db
    const record: DeliveredRecord = { key: "delivered", version: catalog.version, deliveredAt: effects.now(), machines: catalog.machines }
    const transaction = db.value.transaction(CATALOG, "readwrite")
    transaction.objectStore(CATALOG).put(record)
    const kept = fromStorage(await completionOf(transaction))
    if (kept.ok) held.delivered = record
    return kept
  }

  const refreshed = async (): Promise<Result<{ readonly changed: boolean }, CatalogError>> => {
    const sent = await flush()
    if (!sent.ok && sent.error.type === "no-catalog") return Ok({ changed: false })
    const current = await deliveredRecord()
    if (!current.ok) return current
    const version = await api.version()
    if (!version.ok) return Err(fromApi(version.error, OTHER))
    if (version.value === current.value?.version) return sent.ok ? Ok({ changed: false }) : sent
    const catalog = await api.catalog()
    if (!catalog.ok) return Err(fromApi(catalog.error, OTHER))
    return mapOk(await deliver(catalog.value), () => ({ changed: true }))
  }

  const refresh: Catalog["refresh"] = () => {
    const before = held.refreshing
    const running: Promise<Result<{ readonly changed: boolean }, CatalogError>> = (before === undefined ? refreshed() : before.then(refreshed)).finally(() => {
      if (held.refreshing === running) held.refreshing = undefined
    })
    held.refreshing = running
    return running
  }

  return { search, read, register, addFormula, addDistribution, quota, mark, recordUse, refresh, unsentMarks }
}
