import type { QuotaDto } from "@p-lens/contracts"

/** What the app registers: a machine with its first formula, or an addition — a formula or a 設定配分 — to a machine there already. */
export type RegistrationKind = "machine" | "addition"

/** Where this device stands against one kind's quota: how many more it may register today, and from when the next, where that is not now. */
export interface QuotaStanding {
  readonly remaining: number
  readonly nextAt: string | undefined
}

/** Where this device stands against the shared catalog's quotas, or that the catalog counts none. */
export type Quota = { readonly type: "unlimited" } | ({ readonly type: "limited" } & Readonly<Record<RegistrationKind, QuotaStanding>>)

const standingOf = (dto: { readonly remaining: number; readonly nextAt?: string }): QuotaStanding => ({ remaining: dto.remaining, nextAt: dto.nextAt })

/** The quotas as the shared catalog told them. */
export const quotaOf = (dto: QuotaDto): Quota => (dto.type === "unlimited" ? dto : { type: "limited", machine: standingOf(dto.machine), addition: standingOf(dto.addition) })

/** Where the device stands for one kind; none where nothing is counted. */
export const standingFor = (quota: Quota, kind: RegistrationKind): QuotaStanding | undefined => (quota.type === "unlimited" ? undefined : quota[kind])
