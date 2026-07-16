import { describe, it, expect } from 'vitest'
import { diffTokens } from './textDiff'

/** セグメント列を型別テキストに畳み込むテスト用ヘルパー。 */
function joinByType(
  segments: { type: 'same' | 'removed' | 'added'; text: string }[],
) {
  const same = segments
    .filter((s) => s.type === 'same')
    .map((s) => s.text)
    .join('')
  const removed = segments
    .filter((s) => s.type === 'removed')
    .map((s) => s.text)
    .join('')
  const added = segments
    .filter((s) => s.type === 'added')
    .map((s) => s.text)
    .join('')
  return { same, removed, added }
}

describe('diffTokens - トークン単位の差分', () => {
  it('変更なしの場合はすべて same セグメントになること', () => {
    const segments = diffTokens('[Sales] + [Cost]', '[Sales] + [Cost]')
    expect(segments.every((s) => s.type === 'same')).toBe(true)
    // 元テキストが復元できること
    expect(segments.map((s) => s.text).join('')).toBe('[Sales] + [Cost]')
  })

  it('末尾への追加のみを added として検出すること', () => {
    const segments = diffTokens('[Sales]', '[Sales] + [Cost]')
    const { removed, added } = joinByType(segments)
    expect(removed).toBe('')
    expect(added).toContain('[Cost]')
    // same 部分に元の [Sales] が残る
    expect(
      segments.some((s) => s.type === 'same' && s.text === '[Sales]'),
    ).toBe(true)
  })

  it('末尾の削除のみを removed として検出すること', () => {
    const segments = diffTokens('[Sales] + [Cost]', '[Sales]')
    const { removed, added } = joinByType(segments)
    expect(added).toBe('')
    expect(removed).toContain('[Cost]')
  })

  it('中間の置換を removed + added として検出すること', () => {
    const segments = diffTokens('[A] + [B]', '[A] - [B]')
    const { same, removed, added } = joinByType(segments)
    // [A] と [B] は共通、演算子だけ入れ替わる
    expect(same).toContain('[A]')
    expect(same).toContain('[B]')
    expect(removed).toContain('+')
    expect(added).toContain('-')
  })

  it('完全に異なる文字列は全置換になること', () => {
    const segments = diffTokens('[A]', '[B]')
    const { removed, added } = joinByType(segments)
    expect(removed).toContain('[A]')
    expect(added).toContain('[B]')
    // same の実テキストは空
    expect(
      segments
        .filter((s) => s.type === 'same')
        .map((s) => s.text)
        .join(''),
    ).toBe('')
  })

  it('before/after ともに元テキストを復元できること（順序保存）', () => {
    const before = 'IF [売上] > 100 THEN "高" END'
    const after = 'IF [売上] >= 100 THEN "高" ELSE "低" END'
    const segments = diffTokens(before, after)
    const beforeText = segments
      .filter((s) => s.type !== 'added')
      .map((s) => s.text)
      .join('')
    const afterText = segments
      .filter((s) => s.type !== 'removed')
      .map((s) => s.text)
      .join('')
    expect(beforeText).toBe(before)
    expect(afterText).toBe(after)
  })
})
