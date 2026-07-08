import type { TableauDocument } from '../types/tableau'
import { normalizeFieldId, BUILTIN_FIELD_NAMES } from './xmlParser'

export interface FieldUsage {
  /** シートまたは使用中フィールド経由で使われているか */
  used: boolean
  /** このフィールドを直接使用しているワークシート名 */
  directSheets: string[]
  /** このフィールドを参照している「使用中の」フィールド（推移的使用の根拠） */
  viaFields: string[]
}

export interface UsageResult {
  /** 正規化フィールドID → 使用状況 */
  usage: Map<string, FieldUsage>
  /** 未使用フィールドのID一覧（組み込み疑似フィールドを除く） */
  unusedFields: string[]
}

const BUILTIN_SET = new Set<string>(BUILTIN_FIELD_NAMES)

/**
 * ワークブック内の全フィールドの使用状況を解析する。
 *
 * 判定基準:
 * - 直接使用: いずれかのワークシートの依存関係（棚・フィルタ等）に含まれる
 * - ダッシュボード使用: パラメータコントロールや動的ゾーン表示から参照されている
 * - 推移的使用: 「使用中の」計算フィールドの計算式から参照されている
 *   （未使用の計算フィールドからの参照だけでは使用扱いにならない）
 *
 * 注意: データソースフィルタや抽出フィルタのみで使われるフィールドは
 * ワークシート依存関係に現れないため未使用と判定される場合がある。
 */
export function analyzeFieldUsage(doc: TableauDocument): UsageResult {
  // 1. 全フィールドの収集（正規化IDで一意化）
  const allFields = new Set<string>()
  // 参照グラフ: 参照先フィールド → そのフィールドを計算式内で参照しているフィールド群
  const referencedBy = new Map<string, Set<string>>()
  // フィールドID → 計算式が参照しているフィールド群（順方向）
  const references = new Map<string, Set<string>>()

  doc.datasources.forEach((ds) => {
    ds.fields.forEach((f) => {
      const id = normalizeFieldId(f.column)
      if (!id) return
      allFields.add(id)
      if (f.formula) {
        const refs = new Set<string>()
        for (const m of f.formula.matchAll(/\[([^\]]+)\]/g)) {
          const refId = normalizeFieldId(m[1])
          if (refId && refId !== id) refs.add(refId)
        }
        references.set(id, refs)
        refs.forEach((refId) => {
          if (!referencedBy.has(refId)) referencedBy.set(refId, new Set())
          referencedBy.get(refId)!.add(id)
        })
      }
    })
  })

  // 2. 直接使用（ワークシート依存関係）
  const directSheetsMap = new Map<string, Set<string>>()
  doc.worksheets.forEach((ws) => {
    ws.dependencies.forEach((dep) => {
      const id = normalizeFieldId(dep)
      if (!id) return
      if (!directSheetsMap.has(id)) directSheetsMap.set(id, new Set())
      directSheetsMap.get(id)!.add(ws.name)
    })
  })

  // 2.5 ダッシュボード・ワークブックレベルの直接使用
  //     （パラメータコントロール・動的ゾーン表示などの参照）
  const dashboardUsed = new Set<string>()
  doc.dashboards.forEach((db) => {
    db.usedFields?.forEach((f) => {
      const id = normalizeFieldId(f)
      if (id) dashboardUsed.add(id)
    })
  })
  doc.usedFields?.forEach((f) => {
    const id = normalizeFieldId(f)
    if (id) dashboardUsed.add(id)
  })

  // 3. 使用集合の固定点計算:
  //    使用中フィールドの計算式が参照するフィールドを順方向に伝播させる
  const used = new Set<string>([...directSheetsMap.keys(), ...dashboardUsed])
  const queue = Array.from(used)
  while (queue.length > 0) {
    const current = queue.pop()!
    const refs = references.get(current)
    if (!refs) continue
    refs.forEach((refId) => {
      if (!used.has(refId)) {
        used.add(refId)
        queue.push(refId)
      }
    })
  }

  // 4. 結果の組み立て
  const usage = new Map<string, FieldUsage>()
  const unusedFields: string[] = []
  allFields.forEach((id) => {
    const directSheets = Array.from(directSheetsMap.get(id) || [])
    const viaFields = Array.from(referencedBy.get(id) || []).filter((p) =>
      used.has(p),
    )
    const isUsed = used.has(id)
    usage.set(id, { used: isUsed, directSheets, viaFields })
    if (!isUsed && !BUILTIN_SET.has(id)) {
      unusedFields.push(id)
    }
  })

  return { usage, unusedFields }
}
