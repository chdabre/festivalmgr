import { describe, it, expect, vi } from 'vitest'

vi.mock('vue', async () => {
  const actual = await vi.importActual<typeof import('vue')>('vue')
  return { ...actual, onScopeDispose: vi.fn() }
})

import { useDebouncedFn } from '#layers/artists/app/composables/useDebouncedFn'

describe('useDebouncedFn', () => {
  it('delays the underlying call until the wait elapses', async () => {
    vi.useFakeTimers()
    const inner = vi.fn()
    const debounced = useDebouncedFn(inner, 100)
    debounced('a')
    debounced('b')
    debounced('c')
    expect(inner).not.toHaveBeenCalled()
    vi.advanceTimersByTime(100)
    expect(inner).toHaveBeenCalledTimes(1)
    expect(inner).toHaveBeenCalledWith('c')
    vi.useRealTimers()
  })

  it('coalesces multiple calls into one with the latest args', async () => {
    vi.useFakeTimers()
    const inner = vi.fn()
    const debounced = useDebouncedFn(inner, 50)
    debounced(1, 'x')
    vi.advanceTimersByTime(20)
    debounced(2, 'y')
    vi.advanceTimersByTime(50)
    expect(inner).toHaveBeenCalledTimes(1)
    expect(inner).toHaveBeenCalledWith(2, 'y')
    vi.useRealTimers()
  })
})
