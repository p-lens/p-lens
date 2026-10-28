/**
 * IndexedDB held in memory, as much of it as the app's adapters use: stores
 * with a key path and indexes, versioned upgrades, and transactions that
 * write all or nothing — each works on its own copy of its stores, put back
 * only as it completes, and completes once a turn passes with nothing more
 * asked of it.
 */

type Key = IDBValidKey

interface StoreData {
  readonly keyPath: string | readonly string[]
  readonly autoIncrement: boolean
  readonly indexes: Map<string, string>
  records: Map<string, { readonly key: Key; readonly value: unknown }>
  next: number
}

const keyText = (key: Key): string => JSON.stringify(key)

const keyOf = (value: unknown, keyPath: string | readonly string[]): Key => {
  const fields = value as Record<string, Key>
  return typeof keyPath === "string" ? fields[keyPath]! : keyPath.map((part) => fields[part]!)
}

const namesOf = (names: readonly string[]): DOMStringList =>
  Object.assign([...names], { contains: (name: string) => names.includes(name), item: (index: number) => names[index] ?? null }) as unknown as DOMStringList

const sorted = (records: Map<string, { readonly key: Key; readonly value: unknown }>) => [...records.entries()].toSorted(([one], [other]) => one.localeCompare(other)).map(([, record]) => record)

const copied = (data: StoreData): StoreData => ({ ...data, indexes: new Map(data.indexes), records: new Map(data.records) })

export const memoryIndexedDb = (): IDBFactory => {
  const databases = new Map<string, { version: number; stores: Map<string, StoreData> }>()

  const transactionOn = (held: { stores: Map<string, StoreData> }, scope: readonly string[], mode: IDBTransactionMode, connection: IDBDatabase): IDBTransaction => {
    const working = new Map(scope.map((name) => [name, copied(held.stores.get(name)!)]))
    const state: { pending: number; finished: boolean; checking: boolean } = { pending: 0, finished: false, checking: false }
    const transaction = {
      mode,
      error: null as DOMException | null,
      db: connection,
      oncomplete: null as (() => void) | null,
      onerror: null as (() => void) | null,
      onabort: null as (() => void) | null,
      objectStoreNames: namesOf(scope),
      abort: () => {
        if (state.finished) return
        state.finished = true
        queueMicrotask(() => transaction.onabort?.())
      },
      objectStore: (name: string) => storeOn(name),
    }
    const finishIfIdle = () => {
      if (state.checking) return
      state.checking = true
      setTimeout(() => {
        state.checking = false
        if (state.finished || state.pending > 0) return
        state.finished = true
        if (mode === "readwrite") working.forEach((data, name) => held.stores.set(name, data))
        transaction.oncomplete?.()
      }, 0)
    }
    const request = <T>(work: () => T): IDBRequest<T> => {
      const asked = { result: undefined as T | undefined, error: null as DOMException | null, onsuccess: null as (() => void) | null, onerror: null as (() => void) | null, transaction }
      state.pending += 1
      setTimeout(() => {
        state.pending -= 1
        if (state.finished) return
        try {
          asked.result = work()
          asked.onsuccess?.()
        } catch (cause) {
          asked.error = cause as DOMException
          asked.onerror?.()
          transaction.error = asked.error
          transaction.onerror?.()
          transaction.abort()
        }
        finishIfIdle()
      }, 0)
      return asked as unknown as IDBRequest<T>
    }
    const storeOn = (name: string): IDBObjectStore => {
      const data = () => working.get(name)!
      const write = (value: unknown, adding: boolean): Key => {
        const store = data()
        const key = store.autoIncrement ? (store.next += 1) : keyOf(value, store.keyPath)
        if (adding && store.records.has(keyText(key))) throw new DOMException("exists", "ConstraintError")
        store.records.set(keyText(key), { key, value: structuredClone(value) })
        return key
      }
      const inIndex = (index: string, key: Key) => sorted(data().records).filter((record) => keyText(keyOf(record.value, data().indexes.get(index)!)) === keyText(key))
      return {
        name,
        get: (key: Key) => request(() => structuredClone(data().records.get(keyText(key))?.value)),
        getKey: (key: Key) => request(() => data().records.get(keyText(key))?.key),
        getAll: () => request(() => sorted(data().records).map((record) => structuredClone(record.value))),
        put: (value: unknown) => request(() => write(value, false)),
        add: (value: unknown) => request(() => write(value, true)),
        delete: (key: Key) => request(() => void data().records.delete(keyText(key))),
        clear: () => request(() => void data().records.clear()),
        createIndex: (index: string, keyPath: string) => data().indexes.set(index, keyPath),
        index: (index: string) => ({
          getAll: (key: Key) => request(() => inIndex(index, key).map((record) => structuredClone(record.value))),
          getAllKeys: (key: Key) => request(() => inIndex(index, key).map((record) => record.key)),
        }),
        openCursor: () => {
          const records = sorted(data().records)
          const cursor = { result: null as unknown, onsuccess: null as (() => void) | null }
          const at = (place: number) =>
            setTimeout(() => {
              const record = records[place]
              cursor.result = record === undefined ? null : { value: record.value, continue: () => at(place + 1) }
              cursor.onsuccess?.()
            }, 0)
          at(0)
          return cursor
        },
      } as unknown as IDBObjectStore
    }
    return transaction as unknown as IDBTransaction
  }

  const connectionTo = (held: { version: number; stores: Map<string, StoreData> }): IDBDatabase => {
    const connection = {
      get objectStoreNames() {
        return namesOf([...held.stores.keys()].toSorted())
      },
      transaction: (scope: string | readonly string[], mode: IDBTransactionMode = "readonly") => transactionOn(held, typeof scope === "string" ? [scope] : scope, mode, connection as unknown as IDBDatabase),
      createObjectStore: (name: string, options: { readonly keyPath?: string | readonly string[]; readonly autoIncrement?: boolean }) => {
        held.stores.set(name, { keyPath: options.keyPath ?? "", autoIncrement: options.autoIncrement === true, indexes: new Map(), records: new Map(), next: 0 })
        return { createIndex: (index: string, keyPath: string) => held.stores.get(name)!.indexes.set(index, keyPath) }
      },
      deleteObjectStore: (name: string) => held.stores.delete(name),
    }
    return connection as unknown as IDBDatabase
  }

  const open = (name: string, version: number): IDBOpenDBRequest => {
    const opening = { result: undefined as IDBDatabase | undefined, transaction: null as IDBTransaction | null, error: null, onupgradeneeded: null as ((event: { oldVersion: number }) => void) | null, onsuccess: null as (() => void) | null, onerror: null, onblocked: null }
    setTimeout(() => {
      const held = databases.get(name) ?? { version: 0, stores: new Map<string, StoreData>() }
      databases.set(name, held)
      const connection = connectionTo(held)
      opening.result = connection
      if (held.version < version) {
        const upgrading = { stores: held.stores }
        opening.transaction = { objectStore: (store: string) => transactionOn(upgrading, [store], "versionchange", connection).objectStore(store) } as unknown as IDBTransaction
        opening.onupgradeneeded?.({ oldVersion: held.version })
        held.version = version
      }
      setTimeout(() => opening.onsuccess?.(), 5)
    }, 0)
    return opening as unknown as IDBOpenDBRequest
  }

  return { open } as unknown as IDBFactory
}
