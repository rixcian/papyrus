import { act, renderHook, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import type { Player } from '@/player/player'
import { PlayerProvider, usePlayer } from '@/player/provider'
import { playerItem } from '@/test/audio'
import { CapturePlayer } from '@/test/player'
import { renderPage } from '@/test/render'
import { MiniPlayer } from './mini-player'

function setup() {
  const player: { current: Player | null } = { current: null }
  const page = renderPage(
    <PlayerProvider>
      <CapturePlayer into={player} />
      <MiniPlayer />
    </PlayerProvider>,
  )
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue()
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  return { ...page, player: player.current as Player }
}

describe('MiniPlayer', () => {
  it('shows nothing until something is playing', () => {
    setup()
    expect(screen.queryByRole('region', { name: 'Now playing' })).toBeNull()
  })

  it('shows the Chapter, controls playback and links to the full player', async () => {
    const { player, user } = setup()
    act(() => player.load(playerItem(), 120))
    expect(screen.getByRole('link', { name: /Quiet Shore/ }).getAttribute('href')).toBe(
      '/listen/a1',
    )
    expect(screen.getByText('Lighthouse')).toBeTruthy()

    await user.click(screen.getByRole('button', { name: 'Play' }))
    expect(player.getState().playing).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Pause' }))
    await user.click(screen.getByRole('button', { name: 'Back 15 seconds' }))
    expect(player.getState().time).toBe(105)
    await user.click(screen.getByRole('button', { name: 'Close player' }))
    expect(screen.queryByRole('region', { name: 'Now playing' })).toBeNull()
  })

  it('shows the authors without Chapters, and errors over both', () => {
    const { player } = setup()
    act(() => player.load(playerItem({ chapters: [], duration: 0 }), 0))
    expect(screen.getByText('Ann Author')).toBeTruthy()
    act(
      () =>
        player.getState() &&
        (player as unknown as { set(p: object): void }).set({ error: 'Broken' }),
    )
    expect(screen.getByText('Broken')).toBeTruthy()
  })
})

describe('PlayerProvider', () => {
  it('usePlayer must be inside it', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => renderHook(() => usePlayer())).toThrow('usePlayer outside PlayerProvider')
    vi.restoreAllMocks()
  })

  it('stops playback when it unmounts', () => {
    const { player, unmount } = setup()
    act(() => player.load(playerItem(), 0))
    unmount()
    expect(player.getState().item).toBeNull()
  })
})
