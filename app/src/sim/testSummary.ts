/**
 * Test helper: the validation numbers shown in the app live in
 * validationSummary.json. Tests compare what the engine produces now against
 * it; run `UPDATE_VALIDATION=1 npm test` to accept a deliberate change.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { expect } from 'vitest'

const FILE = new URL('./validationSummary.json', import.meta.url)

export function checkSummary(key: string, value: unknown) {
  const stored = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, unknown>
  if (process.env.UPDATE_VALIDATION === '1') {
    stored[key] = value
    writeFileSync(FILE, JSON.stringify(stored, null, 2) + '\n')
    return
  }
  expect(stored[key], `validationSummary.json "${key}" is stale — run UPDATE_VALIDATION=1 npm test`).toEqual(value)
}
