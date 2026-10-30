import { compareHlc } from '@papyrus/shared'

/** This device's copy of Reading Progress per (Profile, File); the reader resumes from it offline. */
export interface LocalProgress {
  cfi: string
  fraction: number
  hlc: string
  deviceId: string
}

const key = (profileId: string, fileId: string) => `papyrus:progress:${profileId}:${fileId}`

export function readLocalProgress(
  profileId: string,
  fileId: string,
  storage: Storage = localStorage,
): LocalProgress | null {
  try {
    const value = JSON.parse(
      storage.getItem(key(profileId, fileId)) ?? 'null',
    ) as LocalProgress | null
    return value?.hlc ? value : null
  } catch {
    return null
  }
}

/** Keeps the newer of the stored and the given progress; returns whether it was stored. */
export function writeLocalProgress(
  profileId: string,
  fileId: string,
  progress: LocalProgress,
  storage: Storage = localStorage,
): boolean {
  const current = readLocalProgress(profileId, fileId, storage)
  if (current && compareHlc(current.hlc, progress.hlc) >= 0) return false
  storage.setItem(key(profileId, fileId), JSON.stringify(progress))
  return true
}
