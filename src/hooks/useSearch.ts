import { useMemo } from 'react'
import type { TableauDocument } from '../types/tableau'
import { useDependencyIndex } from './useDependencyIndex'

export type SearchHitReason =
  | 'direct'      // 名前やキャプションが直接一致
  | 'formula'     // 計算式内に検索語が含まれる
  | 'dependency'  // 依存先がヒットしたことによる連鎖ヒット

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

    const getParentInfo = (parentName: string, parentType: 'datasource' | 'worksheet') => {
      if (parentType === 'datasource') {
        const ds = doc.datasources.find(d => d.name === parentName)
        return { caption: ds?.caption || parentName, type: 'datasource' as const }
      } else {
        const ws = doc.worksheets.find(w => w.name === parentName)
        return { caption: ws?.caption || parentName, type: 'worksheet' as const }
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
          parentType: 'worksheet'
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
          parentType: 'datasource'
        })
      }
    })

    // 3. フィールド (名前および計算式)
    const directFieldHits: string[] = []
    index.fields.forEach((info, name) => {
      const f = info.field
      let reason: SearchHitReason | null = null

      if (
        name.toLowerCase().includes(q) ||
        (f.caption && f.caption.toLowerCase().includes(q))
      ) {
        reason = 'direct'
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
          parentName: info.parentName,
          parentCaption: p.caption,
          parentType: p.type
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
              parentType: p.type
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
              targetField: name // 依存元のフィールドIDを保持
            })
          }
        })
      }
    }

    return Array.from(hitMap.values())
  }, [doc, index, query])

  return results
}
