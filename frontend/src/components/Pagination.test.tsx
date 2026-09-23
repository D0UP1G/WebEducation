import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { Pagination } from './Pagination'

it('navigates pages and respects list boundaries', async () => {
  const onPage = vi.fn()
  const { rerender } = render(<Pagination meta={{ page: 1, page_size: 20, total: 41 }} page={1} onPage={onPage} />)
  expect(screen.getByRole('button', { name: /назад/i }).hasAttribute('disabled')).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: /далее/i }))
  expect(onPage).toHaveBeenCalledWith(2)
  rerender(<Pagination meta={{ page: 3, page_size: 20, total: 41 }} page={3} onPage={onPage} />)
  expect(screen.getByRole('button', { name: /далее/i }).hasAttribute('disabled')).toBe(true)
})
