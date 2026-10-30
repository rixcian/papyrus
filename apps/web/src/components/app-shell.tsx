import { Link, Outlet, useNavigate } from 'react-router'
import { useSession } from '@/lib/session'
import { ProfileAvatar } from './profile-avatar'
import { Menu, MenuItem } from './ui/menu'
import { UploadProvider } from './uploads'

export function AppShell() {
  const { data: profile } = useSession()
  const navigate = useNavigate()

  return (
    <UploadProvider>
      <div className="min-h-dvh">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-4 border-border border-b bg-background/90 px-4 backdrop-blur">
          <Link to="/" className="font-semibold tracking-tight">
            Papyrus
          </Link>
          <div className="flex-1" />
          {profile && (
            <Menu
              trigger={
                <button
                  type="button"
                  aria-label={`${profile.name}: Profile menu`}
                  className="rounded-full"
                >
                  <ProfileAvatar name={profile.name} colour={profile.colour} size="sm" />
                </button>
              }
            >
              <div className="px-3 py-2 font-medium text-sm">{profile.name}</div>
              <MenuItem onClick={() => navigate('/settings')}>Settings</MenuItem>
              <MenuItem onClick={() => navigate('/profiles')}>Switch Profile</MenuItem>
            </Menu>
          )}
        </header>
        <main className="mx-auto max-w-6xl p-4 sm:p-6">
          <Outlet />
        </main>
      </div>
    </UploadProvider>
  )
}
