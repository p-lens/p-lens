import type { CreatedDto } from "@p-lens/contracts"
import type * as PachislotContract from "@p-lens/contracts/pachislot"

import type { ApiError } from "../../domain/errors"
import { Err, Ok, type Result } from "../../domain/result"
import { type Database, execute, unexpected } from "../../infrastructure/database"
import type { Effects } from "../../infrastructure/effects"
import { type StandingRow, standingOf } from "../formulas"
import type { UserId } from "../users"

export const addDistribution = async (
  database: Database,
  effects: Effects,
  user: UserId,
  machineId: string,
  distribution: PachislotContract.NewSettingDistributionDto,
): Promise<Result<CreatedDto, ApiError>> => {
  const id = effects.newId()
  const inserted = await execute(
    database
      .prepare(
        `INSERT INTO distributions (id, machine_id, label, shares_json, derived_from, content_hash, created_by, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
      )
      .bind(
        id,
        machineId,
        distribution.label,
        JSON.stringify(distribution.shares),
        distribution.derivedFrom ?? null,
        await effects.contentHash({ label: distribution.label, shares: distribution.shares }),
        user,
        effects.now(),
      ),
  )
  return inserted.ok ? Ok({ id }) : Err(unexpected(inserted.error))
}

export interface DistributionRow extends StandingRow {
  readonly id: string
  readonly machine_id: string
  readonly label: string
  readonly shares_json: string
  readonly derived_from: string | null
  readonly content_hash: string
  readonly created_at: string
}

export const distributionOf = (row: DistributionRow): PachislotContract.SettingDistributionDto => ({
  id: row.id,
  machineId: row.machine_id,
  label: row.label,
  shares: JSON.parse(row.shares_json),
  ...(row.derived_from === null ? {} : { derivedFrom: row.derived_from }),
  contentHash: row.content_hash,
  createdAt: row.created_at,
  standing: standingOf(row),
})

export const DISTRIBUTION_STANDING = `
  0 AS verifications,
  0 AS refutations,
  0 AS rejections,
  (SELECT COUNT(*) FROM distribution_adoptions a WHERE a.distribution_id = d.id) AS adoptions,
  (SELECT COUNT(*) FROM distribution_favorites p WHERE p.distribution_id = d.id) AS favorites,
  (SELECT COUNT(*) FROM distribution_uses u WHERE u.distribution_id = d.id) AS uses`
