import type { IsoDate } from "../core/calendar/calendar"
import { huddleInOn, huddleOn, huddlePlayKey, huddleText, readHuddle, type Huddle } from "../core/huddle/huddle"
import type { PlayId } from "../core/play/play"
import type { Preferences } from "../preferences/port/preferences"

/**
 * What the device keeps of the huddle it is in, and changes on its own: a
 * huddle's line, begun or joined, is `crossing`'s, and nothing here reaches
 * a relay, so that it is all there with every relay down.
 */

/** The huddle this device is in on a business day; none where it joined none, left the one it joined, or joined one on a day gone by. */
export const huddleNow = (preferences: Pick<Preferences, "huddle">, businessDay: IsoDate): Huddle | undefined => huddleInOn(readHuddle(preferences.huddle()), businessDay)

/** The huddle this device left on a business day, to be come back to by its code: none where it is still in one, or left none that day. */
export const huddleLeftOn = (preferences: Pick<Preferences, "huddle">, businessDay: IsoDate): Huddle | undefined => ((found) => (found?.left === true ? found : undefined))(huddleOn(readHuddle(preferences.huddle()), businessDay))

/** Go by another name in the huddle this device is in: its plays are shown again under it, so the others see it too. */
export const renameInHuddle = (preferences: Pick<Preferences, "setHuddle">, huddle: Huddle, name: string): Huddle => {
  const renamed = { ...huddle, name }
  preferences.setHuddle(huddleText(renamed))
  return renamed
}

/** Let one of the others' plays go from this device's list: theirs, and the others', stay as they are. */
export const dismissHuddlePlay = (preferences: Pick<Preferences, "setHuddle">, huddle: Huddle, member: string, playId: PlayId): Huddle => {
  const key = huddlePlayKey(member, playId)
  const letGo = huddle.dismissed.includes(key) ? huddle : { ...huddle, dismissed: [...huddle.dismissed, key] }
  preferences.setHuddle(huddleText(letGo))
  return letGo
}

/** Leave the huddle: the device keeps it that day as left, showing and shown nothing more; telling the others is the line's. */
export const markHuddleLeft = (preferences: Pick<Preferences, "setHuddle">, huddle: Huddle): void => {
  preferences.setHuddle(huddleText({ ...huddle, left: true }))
}
