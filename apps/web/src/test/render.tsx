import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, renderHook } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactElement, ReactNode } from 'react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router'

export function testQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { retry: false } },
  })
}

/** Shows the current path, so tests can see where a page navigated to. */
export function LocationProbe() {
  const location = useLocation()
  return <output data-testid="location">{location.pathname + location.search}</output>
}

/**
 * Renders `ui` at `path` (a route pattern such as `/books/:bookId`) opened at `url`, inside
 * a fresh QueryClient. Every other path renders the location probe.
 */
export function renderPage(
  ui: ReactElement,
  {
    path = '/',
    url = path,
    queryClient = testQueryClient(),
  }: { path?: string; url?: string; queryClient?: QueryClient } = {},
) {
  const router = createMemoryRouter(
    [
      {
        path,
        element: (
          <>
            {ui}
            <LocationProbe />
          </>
        ),
      },
      { path: '*', element: <LocationProbe /> },
    ],
    { initialEntries: [url] },
  )
  const user = userEvent.setup()
  const result = render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  )
  return { ...result, user, router, queryClient }
}

export function renderQueryHook<T>(hook: () => T, queryClient = testQueryClient()) {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
  return { ...renderHook(hook, { wrapper }), queryClient }
}
