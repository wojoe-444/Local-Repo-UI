import type { RepoApi, RepoEvents } from '@shared/api'
import type { JSX as ReactJSX } from 'react'

declare global {
  // @types/react no longer exposes a global JSX namespace.
  namespace JSX {
    type Element = ReactJSX.Element
  }
  interface Window { api: RepoApi & RepoEvents }
}
