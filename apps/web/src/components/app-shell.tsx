import {
  HeadphonesIcon,
  LibraryBigIcon,
  type LucideIcon,
  SearchIcon,
  SettingsIcon,
  UploadIcon,
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { usePwa } from '@/lib/pwa'
import { useSession } from '@/lib/session'
import { cn } from '@/lib/utils'
import { usePlayerState } from '@/player/provider'
import { MiniPlayer } from './mini-player'
import { ProfileAvatar } from './profile-avatar'
import { Button } from './ui/button'
import { Menu, MenuItem, MenuPopup, MenuSeparator, MenuTrigger } from './ui/menu'
import { UploadProvider, useUploads } from './uploads'

/** The library's search field, which the top bar's search button focuses. */
export const LIBRARY_SEARCH_ID = 'library-search'

interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  end?: boolean
}

export function AppShell() {
  const { pathname } = useLocation()
  // Only outside the reader, so an update never interrupts a chapter (ticket 05).
  const { needRefresh, update } = usePwa()
  const { item: playing } = usePlayerState()

  const nav: NavItem[] = [
    { to: '/', label: 'Library', icon: LibraryBigIcon, end: true },
    ...(playing
      ? [{ to: `/listen/${playing.fileId}`, label: 'Listening', icon: HeadphonesIcon }]
      : []),
    { to: '/settings', label: 'Settings', icon: SettingsIcon },
  ]

  return (
    <UploadProvider>
      {/* Bars fixed to the bottom (selection, uploads) sit above the nav and the mini-player. */}
      <div
        className={cn(
          'relative isolate min-h-dvh overflow-x-clip',
          playing
            ? '[--player-offset:calc(9.5rem+env(safe-area-inset-bottom))] sm:[--player-offset:5.5rem]'
            : '[--player-offset:calc(4.75rem+env(safe-area-inset-bottom))] sm:[--player-offset:0px]',
        )}
      >
        <TopBar items={nav} />
        {needRefresh && (
          <div
            role="status"
            className="flex animate-rise items-center justify-center gap-3 bg-muted px-4 py-2 text-sm"
          >
            A new version of Papyrus is ready.
            <Button size="xs" onClick={update}>
              Reload
            </Button>
          </div>
        )}
        <main
          className={cn(
            'mx-auto max-w-6xl px-4 pt-[calc(1rem+env(safe-area-inset-top))] sm:px-6 sm:pt-2',
            playing ? 'pb-44 sm:pb-28' : 'pb-28 sm:pb-10',
          )}
        >
          <div key={pathname} className="animate-page-in">
            <Outlet />
          </div>
        </main>
        <MiniPlayer />
        <BottomNav items={nav} />
      </div>
    </UploadProvider>
  )
}

/**
 * Desktop: the brand on the left, the main places in a glass pill in the middle with a
 * highlight that slides to the current one, search, upload and the profile on the right. It
 * floats over the page and frosts once the page scrolls under it. Phones use BottomNav.
 */
function TopBar({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { addFiles } = useUploads()
  const picker = useRef<HTMLInputElement>(null)
  const pill = useRef<HTMLElement>(null)
  const [mark, setMark] = useState<{ left: number; width: number } | null>(null)
  const [scrolled, setScrolled] = useState(false)
  const active = items.findIndex((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  )

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // The highlight follows the current link, and re-measures when the pill changes size.
  useLayoutEffect(() => {
    const nav = pill.current
    if (!nav) return
    const measure = () => {
      const link = nav.querySelectorAll<HTMLElement>('a')[active]
      setMark(link ? { left: link.offsetLeft, width: link.offsetWidth } : null)
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [active])

  return (
    <header
      className={cn(
        // No band across the page: clicks pass through the gaps, and once the page scrolls
        // under it, the brand and the buttons each frost on their own like the pill.
        'pointer-events-none sticky top-0 z-30 hidden grid-cols-[1fr_auto_1fr] items-center gap-4 px-4 py-3 sm:grid *:pointer-events-auto',
      )}
    >
      <Link to="/" className={cn('justify-self-start gap-2.5 py-1 ps-1 pe-3.5', capsule(scrolled))}>
        <img src="/icon.svg" alt="" className="size-8 rounded-lg" />
        <span className="font-semibold text-lg tracking-[-0.015em]">Papyrus</span>
      </Link>

      <nav
        ref={pill}
        aria-label="Main"
        className="relative flex rounded-full border border-white/10 bg-zinc-900/70 p-1 shadow-black/40 shadow-lg backdrop-blur-xl backdrop-saturate-150"
      >
        {mark && (
          <span
            aria-hidden
            className="absolute inset-y-1 rounded-full bg-primary transition-[translate,width] duration-500 ease-spring"
            style={{ width: mark.width, translate: `${mark.left}px 0` }}
          />
        )}
        {items.map((item, i) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={cn(
              'relative flex h-9 items-center gap-2 rounded-full px-4 font-medium text-muted-foreground text-sm transition-colors duration-300 hover:text-foreground',
              i === active && 'text-primary-foreground hover:text-primary-foreground',
            )}
          >
            <item.icon className="size-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className={cn('justify-self-end gap-1 p-1', capsule(scrolled))}>
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Search"
          onClick={() =>
            pathname === '/'
              ? document.getElementById(LIBRARY_SEARCH_ID)?.focus()
              : navigate('/', { state: { focusSearch: true } })
          }
        >
          <SearchIcon />
        </Button>
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addFiles(e.target.files)
            e.target.value = ''
          }}
        />
        <Button
          variant="ghost"
          size="icon"
          className="rounded-full"
          aria-label="Upload books"
          onClick={() => picker.current?.click()}
        >
          <UploadIcon />
        </Button>
        <span className="ms-1 flex">
          <ProfileMenu />
        </span>
      </div>
    </header>
  )
}

/** A group in the top bar: bare at the top of the page, a frosted capsule once scrolled. */
const capsule = (scrolled: boolean) =>
  cn(
    'flex items-center rounded-full border transition-[background-color,border-color,box-shadow,backdrop-filter] duration-300',
    scrolled
      ? 'border-white/10 bg-zinc-900/70 shadow-black/40 shadow-lg backdrop-blur-xl backdrop-saturate-150'
      : 'border-transparent',
  )

/** Phones get the main places as a floating pill at the bottom, in thumb reach. */
function BottomNav({ items }: { items: NavItem[] }) {
  const { pathname } = useLocation()
  const active = items.findIndex((item) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to),
  )
  return (
    <nav
      aria-label="Main"
      className="fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex -translate-x-1/2 rounded-full border border-white/10 bg-zinc-900/75 p-1.5 shadow-black/50 shadow-xl backdrop-blur-xl backdrop-saturate-150 sm:hidden"
    >
      {active >= 0 && (
        <span
          aria-hidden
          className="absolute top-1.5 left-1.5 h-12 w-16 rounded-full bg-primary transition-transform duration-500 ease-spring"
          style={{ transform: `translateX(${active * 100}%)` }}
        />
      )}
      {items.map((item, i) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.end}
          aria-label={item.label}
          className={cn(
            'relative grid h-12 w-16 place-items-center rounded-full text-muted-foreground transition-colors duration-300 active:scale-95',
            i === active && 'text-primary-foreground',
          )}
        >
          <item.icon className="size-5.5" />
        </NavLink>
      ))}
      <span className="relative grid h-12 w-16 place-items-center">
        <ProfileMenu side="top" />
      </span>
    </nav>
  )
}

/** The Active Profile's avatar, opening Settings and Switch Profile. */
function ProfileMenu({ side = 'bottom' }: { side?: 'top' | 'bottom' }) {
  const { data: profile } = useSession()
  const navigate = useNavigate()
  if (!profile) return null
  return (
    <Menu>
      <MenuTrigger
        aria-label={`${profile.name}: Profile menu`}
        className="rounded-full transition-transform active:scale-95"
        render={<button type="button" />}
      >
        <ProfileAvatar name={profile.name} colour={profile.colour} size="sm" />
      </MenuTrigger>
      <MenuPopup side={side} align="end" sideOffset={side === 'top' ? 14 : 6} className="min-w-44">
        <div className="px-2 py-1.5 font-medium text-sm">{profile.name}</div>
        <MenuSeparator />
        <MenuItem onClick={() => navigate('/settings')}>Settings</MenuItem>
        <MenuItem onClick={() => navigate('/profiles')}>Switch Profile</MenuItem>
      </MenuPopup>
    </Menu>
  )
}
