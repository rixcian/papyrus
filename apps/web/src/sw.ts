/// <reference lib="webworker" />
import {
  cleanupOutdatedCaches,
  createHandlerBoundToURL,
  precacheAndRoute,
} from 'workbox-precaching'
import { createPartialResponse } from 'workbox-range-requests'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { OFFLINE_CACHE } from './offline/caches'

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{ url: string; revision: string | null }>
}

// The app shell, so the app opens with no connection (ticket 05).
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
registerRoute(
  new NavigationRoute(createHandlerBoundToURL('/index.html'), { denylist: [/^\/api\//] }),
)

/**
 * Offline Books: the app puts their Files and covers in OFFLINE_CACHE itself. Anything
 * there is served from it; everything else goes to the network untouched and is never
 * added, so the cache holds exactly the Offline Books.
 */
const OFFLINE_PATHS = [
  /^\/api\/files\/[^/]+$/,
  /^\/api\/files\/[^/]+\/tracks\/\d+$/,
  /^\/api\/books\/[^/]+\/cover$/,
]
registerRoute(
  ({ url, request, sameOrigin }) =>
    sameOrigin &&
    request.method === 'GET' &&
    OFFLINE_PATHS.some((re) => re.test(url.pathname)) &&
    // A download asks for an attachment, which the cached copy isn't.
    !url.searchParams.has('download'),
  async ({ request, url }) => {
    const cache = await caches.open(OFFLINE_CACHE)
    const hit = await cache.match(url.pathname + url.search)
    if (!hit) return fetch(request)
    // Audio seeks with range requests; the cache holds whole recordings (spec: Offline).
    return request.headers.has('range') ? createPartialResponse(request, hit) : hit
  },
)

// Prompt-for-update: the page asks the waiting worker to take over (ticket 05).
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') void self.skipWaiting()
})
