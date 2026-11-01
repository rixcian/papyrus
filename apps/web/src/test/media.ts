import { vi } from 'vitest'

/** Answers media queries as a screen `width` pixels wide would; `standalone` for installed. */
export function setViewport(width: number, { standalone = false } = {}) {
  vi.spyOn(window, 'matchMedia').mockImplementation((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    const max = /max-width:\s*(\d+)px/.exec(query)
    const matches = query.includes('display-mode: standalone')
      ? standalone
      : (!min || width >= Number(min[1])) && (!max || width <= Number(max[1]))
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    } as MediaQueryList
  })
}
