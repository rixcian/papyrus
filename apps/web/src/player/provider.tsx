import { createContext, type ReactNode, useContext, useState, useSyncExternalStore } from 'react'
import { Player, type PlayerState } from './player'

const PlayerContext = createContext<Player | null>(null)

/** One Player for the app, mounted above the routes so playback survives navigation. */
export function PlayerProvider({ children }: { children: ReactNode }) {
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  if (audio && !player) setPlayer(new Player(audio))
  return (
    <>
      {/* biome-ignore lint/a11y/useMediaCaption: audiobooks have no captions to offer */}
      <audio ref={setAudio} hidden />
      {player && <PlayerContext.Provider value={player}>{children}</PlayerContext.Provider>}
    </>
  )
}

export function usePlayer(): Player {
  const player = useContext(PlayerContext)
  if (!player) throw new Error('usePlayer outside PlayerProvider')
  return player
}

export function usePlayerState(): PlayerState {
  const player = usePlayer()
  return useSyncExternalStore(player.subscribe, player.getState)
}
