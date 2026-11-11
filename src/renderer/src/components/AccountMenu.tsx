import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import UserAvatar from './UserAvatar'

/** `hideSignIn`: the page already shows the sign-in form, so the button would be a no-op. */
export default function AccountMenu({ hideSignIn }: { hideSignIn?: boolean }): JSX.Element | null {
  const { status, signOut } = useAuth()
  if (!status) return null
  if (!status.signedIn) return hideSignIn ? null : <Link className="btn" to="/">Sign in to GitHub</Link>
  return (
    <span className="account">
      <UserAvatar user={{ login: status.login ?? '?', avatarUrl: status.avatarUrl }} />
      <strong>{status.login}</strong>
      <button className="btn" onClick={() => signOut()}>Sign out</button>
    </span>
  )
}
