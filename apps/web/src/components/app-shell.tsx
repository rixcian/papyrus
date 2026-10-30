import { Link, Outlet, useNavigate } from 'react-router'
import { usePwa } from '@/lib/pwa'
import { useSession } from '@/lib/session'
import { usePlayerState } from '@/player/provider'
import { MiniPlayer } from './mini-player'
import { ProfileAvatar } from './profile-avatar'
import { Button } from './ui/button'
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from './ui/menu'
import { UploadProvider } from './uploads'

export function AppShell() {
  const { data: profile } = useSession()
  const navigate = useNavigate()
  // Only outside the reader, so an update never interrupts a chapter (ticket 05).
  const { needRefresh, update } = usePwa()
  const { item: playing } = usePlayerState()

  return (
    <UploadProvider>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-border border-b bg-background/90 px-4 backdrop-blur">
          <Link to="/" className="font-semibold tracking-tight">
            Papyrus
          </Link>
          <div className="flex-1" />
          {profile && (
            <Menu>
              <MenuTrigger
                aria-label={`${profile.name}: Profile menu`}
                className="rounded-full"
                render={<button type="button" />}
              >
                <ProfileAvatar name={profile.name} colour={profile.colour} size="sm" />
              </MenuTrigger>
              <MenuPopup align="end" sideOffset={6} className="min-w-44">
                <div className="px-2 py-1.5 font-medium text-sm">{profile.name}</div>
                <MenuSeparator />
                <MenuItem onClick={() => navigate('/settings')}>Settings</MenuItem>
                <MenuItem onClick={() => navigate('/profiles')}>Switch Profile</MenuItem>
              </MenuPopup>
            </Menu>
          )}
        </header>
        {needRefresh && (
          <div
            role="status"
            className="flex items-center justify-center gap-3 border-b bg-muted px-4 py-2 text-sm"
          >
            A new version of Papyrus is ready.
            <Button size="xs" onClick={update}>
              Reload
            </Button>
          </div>
        )}
        <main className={`mx-auto max-w-6xl p-4 sm:p-6 ${playing ? 'pb-24 sm:pb-24' : ''}`}>
          <Outlet />
        </main>
        <MiniPlayer />
      </div>
    </UploadProvider>
  )
}
