import { describe, it, expect, beforeEach } from 'vitest'
import { t, setLanguage, getLanguage, tMark, tAgg } from './i18n'

describe('i18n utility', () => {
  beforeEach(() => {
    setLanguage('ja')
  })

  it('デフォルト言語が日本語であること', () => {
    expect(getLanguage()).toBe('ja')
  })

  it('言語を切り替えられること', () => {
    setLanguage('en')
    expect(getLanguage()).toBe('en')
    setLanguage('ja')
  })

  it('ネストされたキーの翻訳ができること', () => {
    expect(t('app.title')).toBe('VizVerso')
  })

  it('パラメータ置換ができること', () => {
    expect(t('header.sheet_count', { count: 5 })).toBe('5 シート')
  })

  it('存在しないキーの場合はキー自体を返すこと', () => {
    // @ts-expect-error testing invalid key
    expect(t('non.existent.key')).toBe('non.existent.key')
  })

  it('翻訳値が文字列でない場合もキー自体を返すこと', () => {
    expect(t('app')).toBe('app')
  })

  it('tMarkが正しく動作すること', () => {
    expect(tMark('circle')).toBe('円')
    expect(tMark('unknown-mark')).toBe('unknown-mark')
    expect(tMark(undefined)).toBe('自動')
  })

  it('tAggが正しく動作すること', () => {
    expect(tAgg('sum')).toBe('合計')
    expect(tAgg('avg')).toBe('平均')
    expect(tAgg('UNKNOWN')).toBe('UNKNOWN')
  })
})
