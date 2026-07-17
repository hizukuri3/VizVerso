/**
 * 2つの文字列のトークン単位 diff（LCS ベース）。
 * 計算式の「どこがどう変わったか」を可視化するための純粋関数。
 * 新規ランタイム依存は追加しない。
 */

export type DiffSegmentType = 'same' | 'removed' | 'added'

export interface DiffSegment {
  type: DiffSegmentType
  text: string
}

/**
 * 計算式向けのトークン分割。粒度は
 *   フィールド参照（[〜] / [ds].[field]） / 単語・数値 / 空白 / その他記号1文字
 * とし、空白も独立トークンとして残すことで元テキストを完全復元できる。
 */
function tokenize(text: string): string[] {
  // リテラル正規表現のため security/detect-non-literal-regexp の対象外。
  // 各文字クラスはブラケットを除外しており量指定子の重なりが無いため線形時間で、
  // 破滅的バックトラックは起きない（detect-unsafe-regex の誤検知）。
  // eslint-disable-next-line security/detect-unsafe-regex
  const re = /\[(?:[^[\]]*\]\.\[)?[^[\]]*\]|[\p{L}\p{N}_]+|\s+|[^\s]/gu
  return text.match(re) ?? []
}

/** 同じ type の連続セグメントを1つに畳み込む。 */
function mergeSegments(segments: DiffSegment[]): DiffSegment[] {
  const merged: DiffSegment[] = []
  for (const seg of segments) {
    const last = merged[merged.length - 1]
    if (last && last.type === seg.type) {
      last.text += seg.text
    } else {
      merged.push({ ...seg })
    }
  }
  return merged
}

/**
 * before → after のトークン単位差分をセグメント列で返す。
 * - same:    両方に存在（共通部分）
 * - removed: before 側のみ（削除）
 * - added:   after 側のみ（追加）
 * before の復元 = same + removed、after の復元 = same + added。
 */
export function diffTokens(before: string, after: string): DiffSegment[] {
  const a = tokenize(before)
  const b = tokenize(after)
  const m = a.length
  const n = b.length

  // LCS の長さ表（末尾からの後ろ向き DP）。
  const dp: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  )
  /* eslint-disable security/detect-object-injection -- 添字は数値ループ変数のみで外部入力ではない */
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const raw: DiffSegment[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      raw.push({ type: 'same', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      raw.push({ type: 'removed', text: a[i] })
      i++
    } else {
      raw.push({ type: 'added', text: b[j] })
      j++
    }
  }
  while (i < m) {
    raw.push({ type: 'removed', text: a[i] })
    i++
  }
  while (j < n) {
    raw.push({ type: 'added', text: b[j] })
    j++
  }
  /* eslint-enable security/detect-object-injection */

  return mergeSegments(raw)
}
