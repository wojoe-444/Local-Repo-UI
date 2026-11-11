import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import UserAvatar from './UserAvatar'

/** `hideSignIn`: the page already shows the sign-in form, so the button would be a no-op. */
export default function AccountMenu({ hideSignIn }: { hideSignIn?: boolean }): JSX.Element | null {
  const { status, signOut } = useAuth()
  const settings = <Link className="btn" to="/settings">Settings</Link>
  if (!status) return settings
  if (!status.signedIn) return <span className="account">{settings}{!hideSignIn && <Link className="btn" to="/">Sign in to GitHub</Link>}</span>
  return (
    <span className="account">
      {settings}
      <UserAvatar user={{ login: status.login ?? '?', avatarUrl: status.avatarUrl }} />
      <strong>{status.login}</strong>
      <button className="btn" onClick={() => signOut()}>Sign out</button>
    </span>
  )
}
