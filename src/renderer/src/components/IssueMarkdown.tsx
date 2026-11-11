import type { ComponentProps } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'

function ExternalLink({ href = '', children }: ComponentProps<'a'>): JSX.Element {
  return (
    <a
      href={href}
      title={href}
      onClick={(e) => {
        e.preventDefault()
        // Only https links leave the app, and they open in the system browser (the main process re-checks this).
        if (/^https:\/\//i.test(href)) window.api.openExternal(href).catch(() => undefined)
      }}
    >
      {children}
    </a>
  )
}

/**
 * Markdown for issue text. Raw HTML is not rendered and images are never fetched: the renderer has no network access,
 * so an image shows as a placeholder naming it.
 */
export default function IssueMarkdown({ source }: { source: string }): JSX.Element {
  if (!source.trim()) return <p className="muted"><em>No description provided.</em></p>
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[[rehypeHighlight, { detect: false, ignoreMissing: true }]]}
        components={{
          a: ExternalLink,
          img: ({ alt, src }) => <span className="muted" title={typeof src === 'string' ? src : ''}>[image: {alt || 'attachment'}]</span>
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  )
}
