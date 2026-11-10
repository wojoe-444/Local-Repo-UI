import { Navigate, Route, Routes } from 'react-router-dom'
import { RepoProvider } from './RepoContext'
import Welcome from './pages/Welcome'
import RepoLayout from './pages/RepoLayout'
import TreePage from './pages/TreePage'
import BlobPage from './pages/BlobPage'
import CommitsPage from './pages/CommitsPage'
import CommitPage from './pages/CommitPage'
import BranchesPage from './pages/BranchesPage'
import ComparePage from './pages/ComparePage'

export default function App(): JSX.Element {
  return (
    <RepoProvider>
      <Routes>
        <Route path="/" element={<Welcome />} />
        <Route path="/repo" element={<RepoLayout />}>
          <Route index element={<Navigate to="tree" replace />} />
          <Route path="tree" element={<TreePage />} />
          <Route path="blob" element={<BlobPage />} />
          <Route path="commits" element={<CommitsPage />} />
          <Route path="commit/:sha" element={<CommitPage />} />
          <Route path="branches" element={<BranchesPage />} />
          <Route path="compare" element={<ComparePage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </RepoProvider>
  )
}
