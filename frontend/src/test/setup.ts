import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

// CodeMirror measures text ranges in a real browser; jsdom does not implement
// these geometry APIs, so return empty geometry for component tests.
if (!Range.prototype.getClientRects) {
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
}
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () => new DOMRect(0, 0, 0, 0)
}

afterEach(() => cleanup())
