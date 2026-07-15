/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useSearch } from './useSearch'
import type { TableauDocument } from '../types/tableau'

/**
 * 検索ランキング検証用フィクスチャ。
 * - 「Profit Ratio」というフィールド本体（完全一致）
 * - 名前に「Profit Ratio」を含むワークシート群（部分一致）
 * - 計算式で Profit Ratio を参照する計算フィールド / 使用シート（formula / dependency ヒット）
 */
const doc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      caption: 'メインDS',
      fields: [
        { column: 'Sales', isCalc: false, dataType: 'real' },
        // 「Profit」完全一致対象
        { column: 'Profit', isCalc: false, dataType: 'real' },
        // 「Profit Ratio」完全一致 / 「Profit」前方一致対象のフィールド本体
        {
          column: 'Profit Ratio',
          isCalc: true,
          formula: '[Profit] / [Sales]',
          dataType: 'real',
        },
        // 「Profit」を語中に含む → 部分一致（前方一致ではない）
        {
          column: 'Gross Profit',
          isCalc: true,
          formula: '[Profit] * 2',
          dataType: 'real',
        },
        // 計算式内に「Profit Ratio」を含む → formula ヒット
        {
          column: 'Adjusted Ratio',
          isCalc: true,
          formula: '[Profit Ratio] * 100',
          dataType: 'real',
        },
      ],
    },
  ],
  worksheets: [
    // 名前に「Profit Ratio」を含む部分一致シート（短い方）
    {
      name: 'Profit Ratio Trend',
      dependencies: ['Sales'],
      localFields: [],
    },
    // 名前に「Profit Ratio」を含む部分一致シート（長い方 → 同点タイブレーク用）
    {
      name: 'Profit Ratio Region',
      dependencies: ['Sales'],
      localFields: [],
    },
    // Profit Ratio を使用しているシート（名前は一致しない → dependency ヒット）
    {
      name: 'Ratio Sheet',
      dependencies: ['Profit Ratio'],
      localFields: [],
    },
  ],
  dashboards: [],
}

function search(query: string) {
  const { result } = renderHook(() => useSearch(doc, query))
  return result.current
}

describe('useSearch - ランキング', () => {
  it('完全一致のフィールド本体が部分一致のシートより上位に来ること', () => {
    const results = search('Profit Ratio')
    expect(results.length).toBeGreaterThan(0)
    // 先頭は Profit Ratio フィールド（完全一致・direct）
    const top = results[0]
    expect(top.type).toBe('field')
    expect(top.name).toBe('Profit Ratio')
    expect(top.reason).toBe('direct')

    // 部分一致シートは Profit Ratio フィールドより後
    const fieldIdx = results.findIndex(
      (r) => r.type === 'field' && r.name === 'Profit Ratio',
    )
    const sheetIdx = results.findIndex(
      (r) => r.type === 'worksheet' && r.name === 'Profit Ratio Trend',
    )
    expect(sheetIdx).toBeGreaterThan(fieldIdx)
  })

  it('formula ヒットが dependency ヒットより上位に来ること', () => {
    // 「Profit Ratio」検索で Adjusted Ratio は formula ヒット、Ratio Sheet は dependency ヒット
    const results = search('Profit Ratio')
    const formulaIdx = results.findIndex(
      (r) => r.name === 'Adjusted Ratio' && r.reason === 'formula',
    )
    const depIdx = results.findIndex(
      (r) => r.name === 'Ratio Sheet' && r.reason === 'dependency',
    )
    expect(formulaIdx).toBeGreaterThanOrEqual(0)
    expect(depIdx).toBeGreaterThanOrEqual(0)
    expect(formulaIdx).toBeLessThan(depIdx)
  })

  it('前方一致が語中の部分一致より上位に来ること', () => {
    // 「Profit」検索: 完全一致の Profit が最上位、
    // 前方一致の Profit Ratio が語中一致の Gross Profit より上位
    const results = search('Profit')
    const exactIdx = results.findIndex(
      (r) => r.type === 'field' && r.name === 'Profit',
    )
    expect(exactIdx).toBe(0)

    const prefixIdx = results.findIndex(
      (r) => r.type === 'field' && r.name === 'Profit Ratio',
    )
    const partialIdx = results.findIndex(
      (r) => r.type === 'field' && r.name === 'Gross Profit',
    )
    expect(prefixIdx).toBeGreaterThanOrEqual(0)
    expect(partialIdx).toBeGreaterThanOrEqual(0)
    expect(prefixIdx).toBeLessThan(partialIdx)
  })

  it('同点時は名前の短い順に並ぶこと', () => {
    // 「Profit」の前方一致シート: Profit Ratio Trend(18) < Profit Ratio Region(19)
    const results = search('Profit')
    const trendIdx = results.findIndex((r) => r.name === 'Profit Ratio Trend')
    const regionIdx = results.findIndex((r) => r.name === 'Profit Ratio Region')
    expect(trendIdx).toBeGreaterThanOrEqual(0)
    expect(regionIdx).toBeGreaterThanOrEqual(0)
    expect(trendIdx).toBeLessThan(regionIdx)
  })

  it('空クエリでは結果が空になること', () => {
    expect(search('   ')).toEqual([])
  })
})
