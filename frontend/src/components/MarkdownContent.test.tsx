import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MarkdownContent } from './MarkdownContent'

it('renders common theory Markdown and excludes raw HTML', () => {
  const source = '# Заголовок\n\n**Важное правило**\n\n```python\nprint(2 + 2)\n```\n\n![Схема](https://example.org/schema.png)\n\n![Небезопасная](http://example.org/schema.png)\n\n<script>alert(1)</script>'
  const { container } = render(<MarkdownContent source={source} />)

  expect(screen.getByRole('heading', { name: 'Заголовок' })).toBeTruthy()
  expect(screen.getByText('Важное правило').tagName).toBe('STRONG')
  expect(container.querySelector('pre code')?.textContent).toContain('print(2 + 2)')
  expect(screen.getByRole('img', { name: 'Схема' }).getAttribute('src')).toBe('https://example.org/schema.png')
  expect(screen.queryByRole('img', { name: 'Небезопасная' })).toBeNull()
  expect(container.querySelector('script')).toBeNull()
})
