import { useEffect, useState } from 'react'
import type { IssueUser } from '@shared/types'
import { Avatar } from './CommitList'

const cache = new Map<string, Promise<string | null>>()

/** GitHub avatar, fetched by the main process (the renderer cannot load remote images); initials as the fallback. */
export default function UserAvatar({ user, size = 20 }: { user: IssueUser; size?: number }): JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  const url = user.avatarUrl
  const inline = !!url && url.startsWith('data:image/')
  useEffect(() => {
    if (!url || inline) return
    let live = true
    let p = cache.get(url)
    if (!p) { p = window.api.githubAvatar(url).catch(() => null); cache.set(url, p) }
    p.then((d) => live && setSrc(d))
    return () => { live = false }
  }, [url, inline])
  if (inline) return <img className="avatar" src={url!} alt="" width={size} height={size} style={{ width: size, height: size }} />
  if (src) return <img className="avatar" src={src} alt="" width={size} height={size} style={{ width: size, height: size }} />
  return <Avatar name={user.login} size={size} />
}
