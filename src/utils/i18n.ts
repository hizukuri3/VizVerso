import ja from '../locales/ja.json'
import en from '../locales/en.json'

export const translations = { ja, en }

export type Language = keyof typeof translations
export type TranslationKeys = typeof ja

// ネストされたキーに対応するための型定義（簡易版）
type Join<K, P> = K extends string | number
  ? P extends string | number
    ? `${K}${'' extends P ? '' : '.'}${P}`
    : never
  : never

type Paths<T, D extends number = 10> = [D] extends [never]
  ? never
  : T extends object
    ? {
        [K in keyof T]-?: K extends string | number
          ? `${K}` | Join<K, Paths<T[K], Prev[D]>>
          : never
      }[keyof T]
    : ''

type Prev = [never, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export type TKey = Paths<TranslationKeys>

let currentLang: Language = 'ja'

/**
 * 翻訳キーから文字列を取得する
 * @param key 翻訳キー（例: 'app.title'）
 * @param params 置換パラメータ（例: { count: 5 }）
 */
export const t = (
  key: TKey,
  params?: Record<string, string | number>,
): string => {
  const keys = key.split('.')
  let value: unknown = translations[currentLang]

  for (const k of keys) {
    if (value && typeof value === 'object' && k in (value as object)) {
      // eslint-disable-next-line security/detect-object-injection
      value = (value as Record<string, unknown>)[k]
    } else {
      return key
    }
  }

  if (typeof value !== 'string') return key

  if (params) {
    let result = value
    for (const [pKey, pValue] of Object.entries(params)) {
      // 特殊文字をエスケープしてRegExpを生成
      const escapedKey = pKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

      result = result.replace(
        new RegExp(`{{${escapedKey}}}`, 'g'),
        String(pValue),
      )
    }
    return result
  }

  return value
}

export const setLanguage = (lang: Language) => {
  currentLang = lang
}

export const getLanguage = () => currentLang

/** マークタイプ（XML内部キー）を表示名に変換 */
export const tMark = (rawMarkClass: string | undefined): string => {
  const markClass = (rawMarkClass || 'automatic').toLowerCase()
  const key = `mark.${markClass}` as TKey
  const result = t(key)
  // キーが見つからない場合は元の値を返す（t関数がキーをそのまま返す性質を利用）
  return result === key ? markClass : result
}

/** 集計関数名を表示名に変換 */
export const tAgg = (agg: string): string => {
  const key = `agg.${agg.toLowerCase()}` as TKey
  const result = t(key)
  return result === key ? agg : result
}
