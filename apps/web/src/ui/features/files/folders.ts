/** What a list of files shows of one: where it is, and whatever else the list keeps of it. */
interface Pathed {
  readonly path: string
}

/** A file as it stands in the list: itself, and the name it goes by there — its path, less the folder it is shown in. */
export interface Listed<F extends Pathed> {
  readonly file: F
  readonly name: string
}

/** One row of the list: a file at the book's root, or a folder with the files in it. */
export type Entry<F extends Pathed> = { readonly type: "file"; readonly listed: Listed<F> } | { readonly type: "folder"; readonly name: string; readonly files: readonly Listed<F>[] }

const SEPARATOR = "/"

/** The folder a path is in, as the list shows folders: its first segment, or none for a file at the root. */
export const folderOf = (path: string): string | undefined => (path.includes(SEPARATOR) ? path.slice(0, path.indexOf(SEPARATOR)) : undefined)

/**
 * Files as the list lays them out: those at the book's root each a row,
 * and those in a folder gathered under it, the folder standing where the
 * first of its files stood. A folder is one level — what lies deeper
 * keeps the rest of its path as its name.
 */
export const entriesOf = <F extends Pathed>(files: readonly F[]): readonly Entry<F>[] =>
  files.reduce<readonly Entry<F>[]>((entries, file) => {
    const folder = folderOf(file.path)
    if (folder === undefined) return [...entries, { type: "file", listed: { file, name: file.path } }]
    const listed: Listed<F> = { file, name: file.path.slice(folder.length + SEPARATOR.length) }
    return entries.some((entry) => entry.type === "folder" && entry.name === folder)
      ? entries.map((entry) => (entry.type === "folder" && entry.name === folder ? { ...entry, files: [...entry.files, listed] } : entry))
      : [...entries, { type: "folder", name: folder, files: [listed] }]
  }, [])
