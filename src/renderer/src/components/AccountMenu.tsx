import { Link } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import UserAvatar from './UserAvatar'

export default function AccountMenu(): JSX.Element | null {
  const { status, signOut } = useAuth()
  if (!status) return null
  if (!status.signedIn) return <Link className="btn" to="/">Sign in to GitHub</Link>
  return (
    <span className="account">
      <UserAvatar user={{ login: status.login ?? '?', avatarUrl: status.avatarUrl }} />
      <strong>{status.login}</strong>
      <button className="btn" onClick={() => signOut()}>Sign out</button>
    </span>
  )
}
