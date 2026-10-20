import { deflateSync, inflateSync, strFromU8, strToU8 } from "fflate"

import type { Packer } from "../port/packer"

const binaryOf = (bytes: Uint8Array): string =>
  Array.from({ length: Math.ceil(bytes.length / 0x8000) }, (_, index) => String.fromCharCode(...bytes.subarray(index * 0x8000, (index + 1) * 0x8000))).join("")

/** Packing by DEFLATE, written as base64 so that it is text again. */
export const createDeflatePacker = (): Packer => ({
  pack: (text) => btoa(binaryOf(deflateSync(strToU8(text), { level: 9 }))),
  unpack: (packed) => {
    try {
      return strFromU8(inflateSync(Uint8Array.from(atob(packed), (character) => character.charCodeAt(0))))
    } catch {
      return undefined
    }
  },
})
