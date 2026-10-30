/**
 * The last position per (Profile, File) on this device. Slice 10 adds syncing through the
 * outbox; this local copy is what the reader resumes from offline.
 */
export interface LocalProgress {
  cfi: string
  fraction: number
  at: number
}

const key = (profileId: string, fileId: string) => `papyrus:progress:${profileId}:${fileId}`

export function readLocalProgress(profileId: string, fileId: string): LocalProgress | null {
  try {
    return JSON.parse(
      localStorage.getItem(key(profileId, fileId)) ?? 'null',
    ) as LocalProgress | null
  } catch {
    return null
  }
}

export function writeLocalProgress(
  profileId: string,
  fileId: string,
  progress: Omit<LocalProgress, 'at'>,
): void {
  localStorage.setItem(key(profileId, fileId), JSON.stringify({ ...progress, at: Date.now() }))
}
