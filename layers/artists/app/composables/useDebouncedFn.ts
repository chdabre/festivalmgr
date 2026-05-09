import { onScopeDispose } from 'vue'

/**
 * Trailing-edge debounce. Calls the wrapped function once after `ms`
 * milliseconds of inactivity, with the most recent arguments. Cleans
 * up the pending timer when the surrounding effect scope disposes.
 */
export function useDebouncedFn<Args extends unknown[]>(
  fn: (...args: Args) => unknown,
  ms: number,
) {
  let timer: ReturnType<typeof setTimeout> | null = null
  onScopeDispose(() => { if (timer) clearTimeout(timer) })
  return (...args: Args) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => { fn(...args) }, ms)
  }
}
