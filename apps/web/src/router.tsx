import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { AppShell } from './components/app-shell'
import { useProfiles, useSession } from './lib/session'
import { BookPage } from './pages/book'
import { LibraryPage } from './pages/library'
import { ListenPage } from './pages/listen'
import { ProfilesPage } from './pages/profiles'
import { ReaderPage } from './pages/reader'
import { SettingsPage } from './pages/settings'
import { WelcomePage } from './pages/welcome'
import { PlayerProvider } from './player/provider'
import { useSync } from './sync'

function FullPageMessage({ children }: { children: string }) {
  return <div className="grid min-h-dvh place-items-center text-muted-foreground">{children}</div>
}

/** Sends the device to first run or the picker until it has an Active Profile. */
function RequireProfile() {
  const profiles = useProfiles()
  const session = useSession()
  useSync(session.data?.id)
  if (profiles.isPending || session.isPending) return <FullPageMessage>Loading…</FullPageMessage>
  if (profiles.isError || session.isError)
    return <FullPageMessage>Can't reach the Papyrus server.</FullPageMessage>
  if (profiles.data.length === 0) return <Navigate to="/welcome" replace />
  if (!session.data) {
    // A stale "no Active Profile" may be refetching; don't bounce to the picker on it.
    if (session.isFetching) return <FullPageMessage>Loading…</FullPageMessage>
    return <Navigate to="/profiles" replace />
  }
  return (
    <PlayerProvider>
      <Outlet />
    </PlayerProvider>
  )
}

export const router = createBrowserRouter([
  { path: '/welcome', element: <WelcomePage /> },
  { path: '/profiles', element: <ProfilesPage /> },
  {
    element: <RequireProfile />,
    children: [
      { path: 'read/:fileId', element: <ReaderPage /> },
      { path: 'listen/:fileId', element: <ListenPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <LibraryPage /> },
          { path: 'books/:bookId', element: <BookPage /> },
          { path: 'settings', element: <SettingsPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <Navigate to="/" replace /> },
])
