import { useMemo } from 'react'
import type { TableauDocument } from '../types/tableau'
import { useDependencyIndex } from './useDependencyIndex'

export type SearchHitReason =
  | 'direct' // 名前やキャプションが直接一致
  | 'formula' // 計算式内に検索語が含まれる
  | 'dependency' // 依存先がヒットしたことによる連鎖ヒット

export interface SearchResult {
  id: string
  name: string
  caption?: string
  type: 'worksheet' | 'datasource' | 'field'
  reason: SearchHitReason
  subReason?: string // 具体的なヒット理由の表示名（例: 「[売上]」）
  parentName: string // 定義元の物理名（データソース名 or ワークシート名）
  parentCaption?: string // 定義元の表示名
  parentType: 'datasource' | 'worksheet' // 定義元の種類
  targetField?: string // ヒットのきっかけとなったフィールドID（あれば）
  score?: number // 表示順スコア（大きいほど上位。降順ソート用）
}

// ヒット理由の優先度（direct > formula > dependency）
const REASON_RANK: Record<SearchHitReason, number> = {
  direct: 3,
  formula: 2,
  dependency: 1,
}

/**
 * name / caption と検索語のマッチ品質を評価する。
 * 完全一致(3) > 前方一致(2) > 部分一致(1) > 一致なし(0)。
 * 検索語は既に trim / toLowerCase 済みであることを前提とする。
 */
function matchQuality(
  name: string,
  caption: string | undefined,
  q: string,
): number {
  let best = 0
  for (const raw of [name, caption]) {
    if (!raw) continue
    const s = raw.toLowerCase()
    if (s === q) best = Math.max(best, 3)
    else if (s.startsWith(q)) best = Math.max(best, 2)
    else if (s.includes(q)) best = Math.max(best, 1)
  }
  return best
}

/**
 * 検索語に対する最終スコアを算出する。
 * マッチ品質を主軸（×10）、ヒット理由を従（+）として合成し、
 * マッチ品質 > ヒット理由 の優先順位を単一の数値で表現する。
 */
function computeScore(res: SearchResult, q: string): number {
  return matchQuality(res.name, res.caption, q) * 10 + REASON_RANK[res.reason]
}

export function useSearch(doc: TableauDocument | null, query: string) {
  const index = useDependencyIndex(doc)

  // 2. 検索実行 (query 変更時に実行)
  const results = useMemo(() => {
    if (!doc || !index || !query.trim()) return []

    const q = query.toLowerCase()
    const hitMap = new Map<string, SearchResult>()

    const getFieldCaption = (fieldName: string) => {
      const info = index.fields.get(fieldName)
      return info?.field.caption || fieldName
    }

    const getParentInfo = (
      parentName: string,
      parentType: 'datasource' | 'worksheet',
    ) => {
      if (parentType === 'datasource') {
        const ds = doc.datasources.find((d) => d.name === parentName)
        return {
          caption: ds?.caption || parentName,
          type: 'datasource' as const,
        }
      } else {
        const ws = doc.worksheets.find((w) => w.name === parentName)
        return {
          caption: ws?.caption || parentName,
          type: 'worksheet' as const,
        }
      }
    }

    const addResult = (res: SearchResult) => {
      const key = `${res.type}-${res.id}`
      if (!hitMap.has(key)) {
        hitMap.set(key, res)
      } else {
        // 重複時は理由を優先（直接一致 > 計算式 > 依存）
        const existing = hitMap.get(key)!
        const priority = { direct: 3, formula: 2, dependency: 1 }
        if (priority[res.reason] > priority[existing.reason]) {
          hitMap.set(key, res)
        }
      }
    }

    // ── 直接一致の探索 ──

    // 1. シート
    doc.worksheets.forEach((ws) => {
      if (
        ws.name.toLowerCase().includes(q) ||
        (ws.caption && ws.caption.toLowerCase().includes(q))
      ) {
        addResult({
          id: ws.name,
          name: ws.name,
          caption: ws.caption,
          type: 'worksheet',
          reason: 'direct',
          parentName: ws.name,
          parentCaption: ws.caption,
          parentType: 'worksheet',
        })
      }
    })

    // 2. データソース
    doc.datasources.forEach((ds) => {
      if (
        ds.name.toLowerCase().includes(q) ||
        (ds.caption && ds.caption.toLowerCase().includes(q))
      ) {
        addResult({
          id: ds.name,
          name: ds.name,
          caption: ds.caption,
          type: 'datasource',
          reason: 'direct',
          parentName: ds.name,
          parentCaption: ds.caption,
          parentType: 'datasource',
        })
      }
    })

    // 3. フィールド (名前および計算式)
    const directFieldHits: string[] = []
    index.fields.forEach((info, name) => {
      const f = info.field
      let reason: SearchHitReason | null = null
      let subReason: string | undefined

      const nameMatch = name.toLowerCase().includes(q)
      const captionMatch = !!f.caption && f.caption.toLowerCase().includes(q)
      if (nameMatch || captionMatch) {
        reason = 'direct'
        // 表示名には一致せず内部名にのみ一致した場合、根拠が見えないため内部名を補足する
        if (!captionMatch && f.caption) {
          subReason = name
        }
      } else if (f.formula && f.formula.toLowerCase().includes(q)) {
        reason = 'formula'
      }

      if (reason) {
        const p = getParentInfo(info.parentName, info.parentType)
        addResult({
          id: name,
          name,
          caption: f.caption,
          type: 'field',
          reason,
          subReason,
          parentName: info.parentName,
          parentCaption: p.caption,
          parentType: p.type,
        })
        directFieldHits.push(name)
      }
    })

    // ── 依存関係の芋づる式探索 ──

    const visited = new Set<string>()
    const queue = directFieldHits.map((name) => ({ name, depth: 0 }))

    while (queue.length > 0) {
      const { name, depth } = queue.shift()!
      if (visited.has(name) || depth > 5) continue // 無限ループ防止 & 深さ制限
      visited.add(name)

      const hitFieldCaption = getFieldCaption(name)

      // a. このフィールドを計算式で使っている親フィールドをヒットさせる
      const parents = index.fieldToParents.get(name)
      if (parents) {
        parents.forEach((parentName) => {
          const info = index.fields.get(parentName)
          if (info) {
            const p = getParentInfo(info.parentName, info.parentType)
            addResult({
              id: parentName,
              name: parentName,
              caption: info.field.caption,
              type: 'field',
              reason: 'dependency',
              subReason: hitFieldCaption,
              parentName: info.parentName,
              parentCaption: p.caption,
              parentType: p.type,
            })
            queue.push({ name: parentName, depth: depth + 1 })
          }
        })
      }

      // b. このフィールドを使っているシートをヒットさせる
      const sheets = index.fieldToSheets.get(name)
      if (sheets) {
        sheets.forEach((wsName) => {
          const ws = doc.worksheets.find((w) => w.name === wsName)
          if (ws) {
            addResult({
              id: wsName,
              name: wsName,
              caption: ws.caption,
              type: 'worksheet',
              reason: 'dependency',
              subReason: hitFieldCaption,
              parentName: ws.name,
              parentCaption: ws.caption,
              parentType: 'worksheet',
              targetField: name, // 依存元のフィールドIDを保持
            })
          }
        })
      }
    }

    // スコアを付与してソート（マッチ品質→ヒット理由→名前の短い順→ロケール順）
    const scored = Array.from(hitMap.values()).map((res) => ({
      ...res,
      score: computeScore(res, q),
    }))

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      // 同点: 名前が短い順
      if (a.name.length !== b.name.length) return a.name.length - b.name.length
      // さらに同点: ロケール順
      return a.name.localeCompare(b.name)
    })

    return scored
  }, [doc, index, query])

  return results
}
