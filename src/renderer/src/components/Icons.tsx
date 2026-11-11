import type { ReactNode } from 'react'
const I = ({ children, size = 16 }: { children: ReactNode; size?: number }): JSX.Element => (
  <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
)
export const FolderIcon = (): JSX.Element => <I><path d="M1.75 3.5h4l1.5 1.75h7v7.5h-12.5z" fill="currentColor" fillOpacity=".25" /></I>
export const FileIcon = (): JSX.Element => <I><path d="M3.5 1.75h6l3 3v9.5h-9z" /><path d="M9.5 1.75v3h3" /></I>
export const SubmoduleIcon = (): JSX.Element => <I><path d="M1.75 3.5h4l1.5 1.75h7v7.5h-12.5z" /><path d="M6 9h4" /></I>
export const BranchIcon = (): JSX.Element => <I><circle cx="4.5" cy="3.5" r="1.5" /><circle cx="4.5" cy="12.5" r="1.5" /><circle cx="11.5" cy="5.5" r="1.5" /><path d="M4.5 5v6M11.5 7c0 3-7 2-7 4" /></I>
export const TagIcon = (): JSX.Element => <I><path d="M1.75 2.75v5l6.5 6.5 5-5-6.5-6.5z" /><circle cx="5" cy="5.5" r=".8" fill="currentColor" /></I>
export const CommitIcon = (): JSX.Element => <I><circle cx="8" cy="8" r="2.5" /><path d="M1 8h4.5M10.5 8H15" /></I>
export const CodeIcon = (): JSX.Element => <I><path d="M5 4L1.5 8L5 12M11 4l3.5 4L11 12" /></I>
export const HistoryIcon = (): JSX.Element => <I><path d="M2 8a6 6 0 1 0 2-4.5M2 2v3h3M8 4.5V8l2.5 1.5" /></I>
export const CopyIcon = (): JSX.Element => <I><rect x="5.5" y="5.5" width="8" height="8" rx="1.2" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></I>
export const RepoIcon = (): JSX.Element => <I><path d="M3 2.5h9.5v11H4.5a1.5 1.5 0 0 1-1.5-1.5z" /><path d="M3 12a1.5 1.5 0 0 1 1.5-1.5h8" /></I>
export const CompareIcon = (): JSX.Element => <I><circle cx="4" cy="3.5" r="1.5" /><circle cx="12" cy="12.5" r="1.5" /><path d="M4 5v7.5h3.5M12 11V6.5H8.5M10 8.5l-2-2 2-2" /></I>
export const ChevronDown = (): JSX.Element => <I size={12}><path d="M3 5.5l5 5 5-5" /></I>
export const IssueOpenIcon = (): JSX.Element => <I><circle cx="8" cy="8" r="6.25" /><circle cx="8" cy="8" r="1.2" fill="currentColor" /></I>
export const IssueClosedIcon = (): JSX.Element => <I><circle cx="8" cy="8" r="6.25" /><path d="M5.2 8.2l2 2 3.6-4" /></I>
export const IssueSkippedIcon = (): JSX.Element => <I><circle cx="8" cy="8" r="6.25" /><path d="M5.5 10.5l5-5" /></I>
export const CommentIcon = (): JSX.Element => <I><path d="M2 3h12v8H8.5L5 13.5V11H2z" /></I>
export const LockIcon = (): JSX.Element => <I><rect x="3" y="7" width="10" height="6.5" rx="1.2" /><path d="M5 7V5a3 3 0 0 1 6 0v2" /></I>
export const IssuesNavIcon = IssueOpenIcon
export const GithubIcon = (): JSX.Element => <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
export const PlusIcon = (): JSX.Element => <I><path d="M8 3v10M3 8h10" /></I>
export const PencilIcon = (): JSX.Element => <I><path d="M2.5 13.5l.7-3L10.5 3.2l2.3 2.3L5.5 12.8z" /></I>
