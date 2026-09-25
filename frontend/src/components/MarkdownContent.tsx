import type { ComponentPropsWithoutRef } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

function MarkdownImage({ src, ...attributes }: ComponentPropsWithoutRef<'img'>) {
  if (!src || !/^https:\/\//i.test(src)) return null
  return <img {...attributes} src={src} loading="lazy" referrerPolicy="no-referrer" />
}

export function MarkdownContent({ source }: { source: string }) {
  return <div className="markdown-content">
    <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml components={{ img: MarkdownImage }}>{source}</ReactMarkdown>
  </div>
}
