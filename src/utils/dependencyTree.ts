import type { TableauDocument, TableauField } from '../types/tableau'
import { normalizeFieldId } from './xmlParser'
import { classifyFormula, type CalcType } from './calcClassifier'

/**
 * フィールドの上流依存を再帰展開したツリーの1ノード。
 * SideDrawer の「依存ツリー」表示や依存解析の基礎データとして利用する。
 */
export interface DependencyTreeNode {
  fieldId: string // 正規化済みフィールドID
  caption: string // 表示名（未解決時は参照名そのもの）
  isCalc: boolean
  calcType: CalcType | null // calcClassifier の分類結果
  isCircular: boolean // 祖先に同じフィールドがある（この場合 children は空）
  isUnresolved: boolean // ドキュメント内に定義が見つからない参照
  children: DependencyTreeNode[]
}

// 計算式内のフィールド参照 [Field] / [Datasource].[Field] を抽出する正規表現。
// 各繰り返しはリテラル "].[" 区切りを要求し文字クラスが ] を除外するため
// バックトラッキング爆発は発生しない（xmlParser の parseShelfList と同方針）。
// eslint-disable-next-line security/detect-unsafe-regex
const FIELD_REF_RE = /\[[^\]]+\](?:\.\[[^\]]+\])*/g

/**
 * データソースおよびワークシート固有フィールドから、
 * 正規化フィールドID → フィールド定義のマップを構築する。
 * useDependencyIndex と同じくデータソースを優先し、
 * ワークシートのローカルフィールドは未登録の場合のみ補完する。
 */
function buildFieldMap(doc: TableauDocument): Map<string, TableauField> {
  const map = new Map<string, TableauField>()
  doc.datasources.forEach((ds) => {
    ds.fields.forEach((f) => {
      const id = normalizeFieldId(f.column)
      if (id) map.set(id, f)
    })
  })
  doc.worksheets.forEach((ws) => {
    ws.localFields?.forEach((f) => {
      const id = normalizeFieldId(f.column)
      if (id && !map.has(id)) map.set(id, f)
    })
  })
  return map
}

/**
 * 計算式から参照フィールドID（正規化済み）を重複なく抽出する。
 * 自己参照は除外する（呼び出し側で循環として扱われるため）。
 */
function extractRefs(formula: string, selfId: string): string[] {
  const matches = formula.match(FIELD_REF_RE) || []
  const seen = new Set<string>()
  const refs: string[] = []
  for (const m of matches) {
    const id = normalizeFieldId(m)
    if (!id || id === selfId || seen.has(id)) continue
    seen.add(id)
    refs.push(id)
  }
  return refs
}

/**
 * 指定フィールドの上流依存ツリーを構築する。
 * 計算式内のフィールド参照を再帰的に展開し、循環参照・最大深度で打ち切る。
 * @param doc 解析済みドキュメント
 * @param rootFieldName ルートフィールド名（正規化前でも可）
 * @param maxDepth 展開する最大深度（既定 10）
 * @returns ツリーのルートノード。ルートが解決できない場合は null
 */
export function buildUpstreamTree(
  doc: TableauDocument,
  rootFieldName: string,
  maxDepth = 10,
): DependencyTreeNode | null {
  const map = buildFieldMap(doc)
  const rootId = normalizeFieldId(rootFieldName)
  if (!rootId || !map.has(rootId)) return null

  const build = (
    fieldId: string,
    ancestors: Set<string>,
    depth: number,
  ): DependencyTreeNode => {
    const field = map.get(fieldId)
    const isUnresolved = !field
    const isCircular = ancestors.has(fieldId)
    const isCalc = !!(field?.isCalc && field.formula)
    const calcType = isCalc ? classifyFormula(field!.formula) : null

    const node: DependencyTreeNode = {
      fieldId,
      caption: field?.caption || fieldId,
      isCalc,
      calcType,
      isCircular,
      isUnresolved,
      children: [],
    }

    // 葉で打ち切るケース: 未解決 / 循環 / 非計算 / 最大深度到達
    if (isUnresolved || isCircular || !isCalc || depth >= maxDepth) {
      return node
    }

    const nextAncestors = new Set(ancestors)
    nextAncestors.add(fieldId)
    const refs = extractRefs(field!.formula!, fieldId)
    node.children = refs.map((ref) => build(ref, nextAncestors, depth + 1))
    return node
  }

  return build(rootId, new Set(), 0)
}
