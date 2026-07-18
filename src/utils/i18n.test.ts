import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  t,
  setLanguage,
  getLanguage,
  tMark,
  tAgg,
  detectInitialLanguage,
} from './i18n'

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

describe('detectInitialLanguage - 初期言語の自動判定', () => {
  const stubEnv = (storedLang: string | null, browserLang: string) => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => storedLang },
    })
    vi.stubGlobal('navigator', {
      languages: [browserLang],
      language: browserLang,
    })
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('保存済みの言語選択があればブラウザ言語より優先すること', () => {
    stubEnv('en', 'ja-JP')
    expect(detectInitialLanguage()).toBe('en')
  })

  it('保存がなくブラウザ言語が日本語なら ja になること', () => {
    stubEnv(null, 'ja-JP')
    expect(detectInitialLanguage()).toBe('ja')
  })

  it('保存がなくブラウザ言語が日本語以外なら en になること', () => {
    stubEnv(null, 'fr-FR')
    expect(detectInitialLanguage()).toBe('en')
  })

  it('保存値が不正な場合はブラウザ言語で判定すること', () => {
    stubEnv('de', 'ja')
    expect(detectInitialLanguage()).toBe('ja')
  })

  it('localStorage が使えない環境でもブラウザ言語で判定できること', () => {
    vi.stubGlobal('window', {
      get localStorage(): Storage {
        throw new Error('access denied')
      },
    })
    vi.stubGlobal('navigator', { languages: ['ja'], language: 'ja' })
    expect(detectInitialLanguage()).toBe('ja')
  })
})
