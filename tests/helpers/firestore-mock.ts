import { ref } from 'vue'
import { vi } from 'vitest'

export function mockUseDocument<T>(initial: T | null = null) {
  const data = ref<T | null>(initial)
  const fn = vi.fn(() => data)
  return { data, fn }
}

export function mockUseCollection<T>(initial: T[] = []) {
  const data = ref<T[]>(initial)
  const fn = vi.fn(() => data)
  return { data, fn }
}
