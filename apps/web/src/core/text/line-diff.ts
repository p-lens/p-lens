/** Lines of one side that take the place of the base's lines from `start` up to `end`; none taken when the two are equal. */
export interface Hunk {
  readonly start: number
  readonly end: number
  readonly lines: readonly string[]
}


/** Lines as the text they are. */
export const textOf = (lines: readonly string[]): string => lines.join("\n")

/** A text as its lines; an empty text has none, so what is added to one is added, not put in place of a blank. */
export const linesOf = (text: string): readonly string[] => (text === "" ? [] : text.split("\n"))

const sharedStart = (left: readonly string[], right: readonly string[]): number => {
  const limit = Math.min(left.length, right.length)
  const differing = Array.from({ length: limit }, (_, index) => index).find((index) => left[index] !== right[index])
  return differing ?? limit
}

const sharedEnd = (left: readonly string[], right: readonly string[], from: number): number => {
  const limit = Math.min(left.length, right.length) - from
  const differing = Array.from({ length: limit }, (_, index) => index).find((index) => left[left.length - 1 - index] !== right[right.length - 1 - index])
  return differing ?? limit
}

/**
 * The longest run of lines two texts share in order, as pairs of positions.
 * Worked out over what is left once the lines they start and end with alike
 * are set aside, which for a journal appended to is nearly nothing.
 */
const matchesBetween = (base: readonly string[], side: readonly string[]): readonly (readonly [number, number])[] => {
  const head = sharedStart(base, side)
  const tail = sharedEnd(base, side, head)
  const rows = base.length - head - tail
  const columns = side.length - head - tail
  const lengths = Array.from({ length: rows + 1 }, () => new Uint32Array(columns + 1))
  for (let row = rows - 1; row >= 0; row -= 1) {
    for (let column = columns - 1; column >= 0; column -= 1) {
      const below = lengths[row + 1]?.[column] ?? 0
      const right = lengths[row]?.[column + 1] ?? 0
      const diagonal = lengths[row + 1]?.[column + 1] ?? 0
      const cell = base[head + row] === side[head + column] ? diagonal + 1 : Math.max(below, right)
      lengths[row]?.set([cell], column)
    }
  }
  const middle: (readonly [number, number])[] = []
  const at = { row: 0, column: 0 }
  while (at.row < rows && at.column < columns) {
    if (base[head + at.row] === side[head + at.column]) {
      middle.push([head + at.row, head + at.column])
      at.row += 1
      at.column += 1
    } else if ((lengths[at.row + 1]?.[at.column] ?? 0) >= (lengths[at.row]?.[at.column + 1] ?? 0)) at.row += 1
    else at.column += 1
  }
  const starting = Array.from({ length: head }, (_, index) => [index, index] as const)
  const ending = Array.from({ length: tail }, (_, index) => [base.length - tail + index, side.length - tail + index] as const)
  return [...starting, ...middle, ...ending]
}

/** What one side did to the base, as the stretches it replaced, in order. */
export const hunksOf = (base: readonly string[], side: readonly string[]): readonly Hunk[] => {
  const matches = [...matchesBetween(base, side), [base.length, side.length] as const]
  const found = matches.reduce<{ readonly hunks: readonly Hunk[]; readonly base: number; readonly side: number }>(
    (walked, [baseAt, sideAt]) => ({
      hunks:
        baseAt === walked.base && sideAt === walked.side
          ? walked.hunks
          : [...walked.hunks, { start: walked.base, end: baseAt, lines: side.slice(walked.side, sideAt) }],
      base: baseAt + 1,
      side: sideAt + 1,
    }),
    { hunks: [], base: 0, side: 0 },
  )
  return found.hunks
}
