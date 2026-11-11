import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './AuthContext'
import { RepoProvider, useRepo } from './RepoContext'
import Welcome from './pages/Welcome'
import RepoLayout from './pages/RepoLayout'
import TreePage from './pages/TreePage'
import BlobPage from './pages/BlobPage'
import CommitsPage from './pages/CommitsPage'
import CommitPage from './pages/CommitPage'
import BranchesPage from './pages/BranchesPage'
import ComparePage from './pages/ComparePage'
import IssuesPage from './pages/IssuesPage'
import IssuePage from './pages/IssuePage'
import NewIssuePage from './pages/NewIssuePage'
import ClonePage from './pages/ClonePage'
import SettingsPage from './pages/SettingsPage'

/** Code-browsing routes need a local checkout; GitHub-only repos are sent to the clone-linking page. */
function RequireLocal({ children }: { children: JSX.Element }): JSX.Element {
  const { repo } = useRepo()
  return repo ? children : <Navigate to="/repo/clone" replace />
}

function RepoIndex(): JSX.Element {
  const { repo } = useRepo()
  return <Navigate to={repo ? 'tree' : 'issues'} replace />
}

export default function App(): JSX.Element {
  return (
    <AuthProvider>
      <RepoProvider>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/repo" element={<RepoLayout />}>
            <Route index element={<RepoIndex />} />
            <Route path="tree" element={<RequireLocal><TreePage /></RequireLocal>} />
            <Route path="blob" element={<RequireLocal><BlobPage /></RequireLocal>} />
            <Route path="commits" element={<RequireLocal><CommitsPage /></RequireLocal>} />
            <Route path="commit/:sha" element={<RequireLocal><CommitPage /></RequireLocal>} />
            <Route path="branches" element={<RequireLocal><BranchesPage /></RequireLocal>} />
            <Route path="compare" element={<RequireLocal><ComparePage /></RequireLocal>} />
            <Route path="issues" element={<IssuesPage />} />
            <Route path="issues/new" element={<NewIssuePage />} />
            <Route path="issues/:number" element={<IssuePage />} />
            <Route path="clone" element={<ClonePage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </RepoProvider>
    </AuthProvider>
  )
}
