import type { Player } from '@/player/player'
import { usePlayer } from '@/player/provider'

/** Hands the app's Player to the test, from inside PlayerProvider. */
export function CapturePlayer({ into }: { into: { current: Player | null } }) {
  into.current = usePlayer()
  return null
}
