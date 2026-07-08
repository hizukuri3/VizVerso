/**
 * 計算式の種別分類。
 * Tableauエンジニアがワークブックを理解する際の最初の整理軸である
 * 「LOD表現 / 表計算 / 通常計算」を計算式テキストから判定する。
 */
export type CalcType = 'lod' | 'tableCalc' | 'regular'

// 表計算関数（呼び出し形式で判定する）
const TABLE_CALC_FNS = [
  'WINDOW_[A-Z_]+',
  'RUNNING_[A-Z_]+',
  'RANK(?:_DENSE|_MODIFIED|_PERCENTILE|_UNIQUE)?',
  'INDEX',
  'FIRST',
  'LAST',
  'SIZE',
  'LOOKUP',
  'PREVIOUS_VALUE',
  'TOTAL',
  'SCRIPT_(?:REAL|INT|STR|BOOL)',
]

// モジュール内の定数配列のみから構築するため外部入力は混入しない
// eslint-disable-next-line security/detect-non-literal-regexp
const TABLE_CALC_RE = new RegExp(
  `\\b(?:${TABLE_CALC_FNS.join('|')})\\s*\\(`,
  'i',
)

const LOD_RE = /\{\s*(?:FIXED|INCLUDE|EXCLUDE)\b/i

/**
 * 判定前に文字列リテラル・コメント・フィールド参照を除去する。
 * "FIXED" のような文字列や [INDEX] のようなフィールド名での誤判定を防ぐ。
 */
function stripNoise(formula: string): string {
  return (
    formula
      // ブロックコメント /* ... */
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // 行コメント // ...
      .replace(/\/\/[^\n]*/g, ' ')
      // 文字列リテラル（ダブル/シングルクォート）
      .replace(/"[^"]*"/g, ' ')
      .replace(/'[^']*'/g, ' ')
      // フィールド参照 [ ... ]
      .replace(/\[[^\]]*\]/g, ' ')
  )
}

/**
 * 計算式を LOD表現 / 表計算 / 通常 に分類する。
 * 表計算関数を含むフィールドは（LODが混在していても）表計算として
 * 動作するため、表計算の判定を優先する。
 */
export function classifyFormula(
  formula: string | undefined | null,
): CalcType | null {
  if (!formula) return null
  const clean = stripNoise(formula)
  if (TABLE_CALC_RE.test(clean)) return 'tableCalc'
  if (LOD_RE.test(clean)) return 'lod'
  return 'regular'
}
