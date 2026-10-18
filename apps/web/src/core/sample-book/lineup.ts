import type { IsoDate } from "../calendar/calendar"
import { weighted, type Draws, type Drawn } from "./draws"
import { daysBetween } from "./schedule"

/** A machine a sample book may play, from the day it went on sale, with what its play is drawn from. */
export interface OnSale<S> {
  readonly id: string
  /** The name it goes into a book under. */
  readonly name: string
  readonly releasedOn: IsoDate
  readonly seat: S
}

/** How quickly a machine's draw fades as it ages: by about two thirds in four months. */
const FADING_DAYS = 120

/** How long a machine is new (新台), and how much likelier it is chosen then. */
const NEW_DAYS = 7

const NEW_PULL = 4

/** How likely a machine is chosen on a day, against the others: the newer, the likelier, and newest of all in its first week. */
const pullOn =
  (day: IsoDate) =>
  (machine: OnSale<unknown>): number => {
    const age = daysBetween(machine.releasedOn, day)
    return Math.exp(-age / FADING_DAYS) * (age < NEW_DAYS ? NEW_PULL : 1)
  }

/** The machines on sale on a day: none before it was released. */
export const onSaleOn = <S>(lineup: readonly OnSale<S>[], day: IsoDate): readonly OnSale<S>[] => lineup.filter((machine) => machine.releasedOn <= day)

/**
 * A machine to sit down at on a day, among those on sale and not left
 * already that day: the newest likeliest, as a person who plays what has
 * just come out plays. None where every one has been left, or none is out.
 */
export const machineOn = <S>(lineup: readonly OnSale<S>[], day: IsoDate, left: readonly string[], draws: Draws): Drawn<OnSale<S> | undefined> =>
  weighted(
    draws,
    onSaleOn(lineup, day).filter((machine) => !left.includes(machine.id)),
    pullOn(day),
  )
