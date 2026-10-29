/**
 * A large file fetched over a signal that may be weak: given up only when
 * nothing of it has arrived for `quietFor` milliseconds — before the answer
 * starts or between its bytes — and never for taking long while it still
 * comes. A cap on the whole download would cut a slow signal off every time
 * and start it over from nothing, so that the file never arrives at all.
 */
export const fetchUnlessStalled = (address: string, quietFor: number): Promise<Response> => {
  const stopping = new AbortController()
  const watch: { timer: ReturnType<typeof setTimeout> | undefined } = { timer: undefined }
  const over = (): void => clearTimeout(watch.timer)
  const heard = (): void => {
    over()
    watch.timer = setTimeout(() => stopping.abort(new DOMException(`nothing arrived for ${quietFor} ms`, "TimeoutError")), quietFor)
  }
  const passing = (): TransformStream<Uint8Array, Uint8Array> =>
    new TransformStream({
      transform: (chunk, onward) => {
        heard()
        onward.enqueue(chunk)
      },
      flush: over,
    })
  const watched = (response: Response): Response => {
    heard()
    if (response.body === null) {
      over()
      return response
    }
    return new Response(response.body.pipeThrough(passing()), { status: response.status, statusText: response.statusText, headers: response.headers })
  }
  const failed = (cause: unknown): Promise<never> => {
    over()
    return Promise.reject(cause instanceof Error ? cause : new Error(String(cause)))
  }
  heard()
  return fetch(address, { signal: stopping.signal }).then(watched, failed)
}
