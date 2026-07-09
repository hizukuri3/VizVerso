import { describe, it, expect } from 'vitest'
import {
  normalizeMarkKind,
  getMarkIcon,
  getWorksheetMarkKind,
} from './markVisual'
import type { TableauWorksheet, WorksheetPane } from '../types/tableau'

const emptyEncodings = (): WorksheetPane['encodings'] => ({
  color: [],
  size: [],
  label: [],
  detail: [],
  tooltip: [],
  shape: [],
})

const pane = (markType: string): WorksheetPane => ({
  markType,
  encodings: emptyEncodings(),
})

const ws = (panes: WorksheetPane[]): TableauWorksheet => ({
  name: 'W',
  dependencies: [],
  shelf: {
    rows: [],
    cols: [],
    filters: [],
    panes,
    marks: panes[0],
  },
})

describe('normalizeMarkKind', () => {
  it('大文字始まり・表記ゆれを正準キーへ正規化する', () => {
    expect(normalizeMarkKind('Automatic')).toBe('automatic')
    expect(normalizeMarkKind(undefined)).toBe('automatic')
    expect(normalizeMarkKind('Circle')).toBe('circle')
    expect(normalizeMarkKind('Multipolygon')).toBe('map')
    expect(normalizeMarkKind('Gantt Bar')).toBe('gantt')
    expect(normalizeMarkKind('Line')).toBe('line')
  })
})

describe('getMarkIcon', () => {
  it('種別に対応するアイコンコンポーネントを返す', () => {
    expect(typeof getMarkIcon('bar')).toBe('object') // lucide forwardRef component
    expect(getMarkIcon('Circle')).toBe(getMarkIcon('circle'))
    expect(getMarkIcon('unknown-xyz')).toBe(getMarkIcon('automatic'))
  })
})

describe('getWorksheetMarkKind', () => {
  it('地理レイヤーを含む場合は map を優先する', () => {
    expect(
      getWorksheetMarkKind(ws([pane('Automatic'), pane('Multipolygon')])),
    ).toBe('map')
  })

  it('メインペインのマーク種別を採用する', () => {
    expect(getWorksheetMarkKind(ws([pane('Bar')]))).toBe('bar')
  })

  it('メインが automatic でも明示種別のペインがあれば採用する', () => {
    expect(getWorksheetMarkKind(ws([pane('Automatic'), pane('Line')]))).toBe(
      'line',
    )
  })

  it('shelf が無くてもクラッシュせず automatic を返す', () => {
    expect(getWorksheetMarkKind({ name: 'W', dependencies: [] })).toBe(
      'automatic',
    )
  })
})
