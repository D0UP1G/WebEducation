import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Status } from './Feedback'

it('uses one accepted badge for manual and automatic checks and labels their source separately', () => {
  const { container } = render(<>
    <Status value="accepted" source="manual" />
    <Status value="accepted" source="automatic" />
  </>)

  expect(screen.getAllByText('Зачтено')).toHaveLength(2)
  expect(screen.getByText('проверил куратор')).toBeTruthy()
  expect(screen.getByText('проверено тестами')).toBeTruthy()
  expect(container.querySelectorAll('.status-accepted svg[aria-hidden="true"]')).toHaveLength(2)
})

it('names review, return, failed tests and environment errors distinctly', () => {
  const { container } = render(<>
    <Status value="pending_review" />
    <Status value="returned" />
    <Status value="incorrect" />
    <Status value="error" />
  </>)
  expect(screen.getByText('На проверке')).toBeTruthy()
  expect(screen.getByText('Возвращено')).toBeTruthy()
  expect(screen.getByText('Не прошло тесты')).toBeTruthy()
  expect(screen.getByText('Ошибка среды')).toBeTruthy()
  expect(container.querySelectorAll('.status svg')).toHaveLength(4)
})
