/**
 * @vitest-environment jsdom
 */
import { renderHook } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { useDependencyIndex } from './useDependencyIndex'
import type { TableauDocument } from '../types/tableau'

// テスト用の最小 TableauDocument フィクスチャ
// - datasource 由来のフィールド（class 解決チェーンを含む）
// - worksheet ローカルフィールド（datasource と重複するものを含む）
// - 循環参照する class チェーン
const doc: TableauDocument = {
  datasources: [
    {
      name: 'ds1',
      caption: 'データソース1',
      fields: [
        {
          column: 'Base',
          caption: '基本フィールド',
          dataType: 'integer',
          formula: '[Raw] + 1',
          isCalc: true,
        },
        // class で Base を参照し、caption/formula/dataType をすべて継承する
        { column: 'Alias', class: '[Base]', isCalc: false },
        // 自分の caption は保持しつつ、formula/dataType だけ Base から継承する
        {
          column: 'Partial',
          caption: '自前キャプション',
          class: '[Base]',
          isCalc: false,
        },
        // 相互に class 参照する循環ペア
        { column: 'CycleA', class: '[CycleB]', isCalc: false },
        { column: 'CycleB', class: '[CycleA]', isCalc: false },
        // 自分自身を class 参照する
        { column: 'SelfRef', class: '[SelfRef]', isCalc: false },
        // 存在しないフィールドを class 参照する
        { column: 'Dangling', class: '[Nonexistent]', isCalc: false },
      ],
    },
    {
      // caption なし → parentCaption は name にフォールバック
      name: 'ds2',
      fields: [{ column: 'Extra', dataType: 'string', isCalc: false }],
    },
  ],
  worksheets: [
    {
      name: 'ws1',
      caption: 'シート1',
      dependencies: ['Base'],
      localFields: [
        // ワークシート固有の計算フィールド
        {
          column: 'LocalCalc',
          formula: '[Base] * 2',
          dataType: 'real',
          isCalc: true,
        },
        // datasource 側と同名 → 上書きされないこと
        { column: 'Base', caption: 'ローカル重複', isCalc: false },
      ],
    },
    {
      // caption なし・localFields なし（オプショナルチェーンの分岐）
      name: 'ws2',
      dependencies: [],
    },
  ],
  dashboards: [],
}

describe('useDependencyIndex', () => {
  it('doc が null の場合は null を返すこと', () => {
    const { result } = renderHook(() => useDependencyIndex(null))
    expect(result.current).toBeNull()
  })

  it('ワークシートの localFields からフィールドが収集されること', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const info = result.current!.getFieldInfo('LocalCalc')
    expect(info).not.toBeNull()
    expect(info!.parentType).toBe('worksheet')
    expect(info!.parentName).toBe('ws1')
    expect(info!.parentCaption).toBe('シート1')
    expect(info!.resolvedFormula).toBe('[Base] * 2')
    expect(info!.isCalculated).toBe(true)
  })

  it('datasource と同名の localField は上書きされないこと', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const info = result.current!.getFieldInfo('Base')
    // datasource 側の定義が優先される
    expect(info!.parentType).toBe('datasource')
    expect(info!.resolvedCaption).toBe('基本フィールド')
  })

  it('caption のない datasource は name が parentCaption になること', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const info = result.current!.getFieldInfo('Extra')
    expect(info!.parentCaption).toBe('ds2')
    expect(info!.isCalculated).toBe(false)
  })

  it('class チェーンから caption/formula/dataType を継承すること', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const info = result.current!.getFieldInfo('Alias')
    expect(info!.resolvedCaption).toBe('基本フィールド')
    expect(info!.resolvedFormula).toBe('[Raw] + 1')
    expect(info!.resolvedDataType).toBe('integer')
    expect(info!.isCalculated).toBe(true)
  })

  it('自前の caption がある場合は class 先の caption で上書きされないこと', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const info = result.current!.getFieldInfo('Partial')
    expect(info!.resolvedCaption).toBe('自前キャプション')
    // formula/dataType は class 先から補完される
    expect(info!.resolvedFormula).toBe('[Raw] + 1')
    expect(info!.resolvedDataType).toBe('integer')
  })

  it('循環参照する class チェーンでも無限ループしないこと', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const info = result.current!.getFieldInfo('CycleA')
    expect(info).not.toBeNull()
    // どちらにも caption がないためフィールド名にフォールバック
    expect(info!.resolvedCaption).toBe('CycleA')
    expect(info!.isCalculated).toBe(false)
  })

  it('自分自身を class 参照するフィールドでも無限ループしないこと', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const info = result.current!.getFieldInfo('SelfRef')
    expect(info).not.toBeNull()
    expect(info!.resolvedCaption).toBe('SelfRef')
  })

  it('存在しないフィールドを class 参照しても安全に打ち切ること', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const info = result.current!.getFieldInfo('Dangling')
    expect(info).not.toBeNull()
    expect(info!.resolvedFormula).toBeUndefined()
  })

  it('getFieldInfo は見つからない場合 null を返すこと', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    expect(result.current!.getFieldInfo('Unknown Field')).toBeNull()
    expect(result.current!.getFieldInfo('')).toBeNull()
  })

  it('ブラケット付きの名前でもフィールドを解決できること', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const info = result.current!.getFieldInfo('[Base]')
    expect(info).not.toBeNull()
    expect(info!.resolvedCaption).toBe('基本フィールド')
  })

  it('計算式から下流参照（fieldToParents）が構築されること', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const parents = result.current!.fieldToParents.get('Base')
    expect(parents).toBeDefined()
    expect(parents!.has('LocalCalc')).toBe(true)
  })

  it('ワークシートの依存関係から fieldToSheets が構築されること', () => {
    const { result } = renderHook(() => useDependencyIndex(doc))
    const sheets = result.current!.fieldToSheets.get('Base')
    expect(sheets).toBeDefined()
    expect(sheets!.has('ws1')).toBe(true)
  })
})
