import type {
  TableauDashboard,
  TableauDatasource,
  TableauDocument,
  TableauField,
  TableauWorksheet,
  WorksheetShelf,
} from '../types/tableau'

/**
 * 2つのワークブック間の diff を表す型定義。
 * v1 スコープ: データソース / フィールド / ワークシート / ダッシュボードの
 * 追加・削除・変更を検出する（純粋関数）。
 */

/** 変更されたプロパティ1件分の記述。before/after のいずれかのみのこともある（追加/削除要素）。 */
export interface PropertyChange {
  property: string
  before?: string
  after?: string
}

/** 両バージョンに存在し内容が変わったエンティティ1件。 */
export interface ChangedEntry<T> {
  /** 同定キー（データソース名 / フィールドキー / シート名 / ダッシュボード名） */
  key: string
  before: T
  after: T
  changes: PropertyChange[]
}

/** 1カテゴリ分の diff 結果。 */
export interface DiffCategory<T> {
  added: T[]
  removed: T[]
  changed: ChangedEntry<T>[]
  /** 両バージョンに存在し変更がなかった件数 */
  unchangedCount: number
}

export interface WorkbookDiff {
  datasources: DiffCategory<TableauDatasource>
  fields: DiffCategory<TableauField>
  worksheets: DiffCategory<TableauWorksheet>
  dashboards: DiffCategory<TableauDashboard>
}

/** 計算式の空白差を無視するための正規化（連続空白→1つ、trim）。 */
function normalizeFormula(formula?: string): string {
  // \s+ はリテラル正規表現のため security/detect-non-literal-regexp の対象外
  return (formula ?? '').replace(/\s+/g, ' ').trim()
}

/**
 * 名前をキーとする単純なエンティティ集合の diff を計算する汎用ヘルパー。
 * @param keyOf 同定キーを返す関数
 * @param detectChanges 両バージョンの変更点を列挙する関数
 */
function diffEntities<T>(
  before: T[],
  after: T[],
  keyOf: (entity: T) => string,
  detectChanges: (before: T, after: T) => PropertyChange[],
): DiffCategory<T> {
  const beforeMap = new Map<string, T>()
  for (const entity of before) beforeMap.set(keyOf(entity), entity)
  const afterMap = new Map<string, T>()
  for (const entity of after) afterMap.set(keyOf(entity), entity)

  const added: T[] = []
  const removed: T[] = []
  const changed: ChangedEntry<T>[] = []
  let unchangedCount = 0

  for (const [key, afterEntity] of afterMap) {
    const beforeEntity = beforeMap.get(key)
    if (beforeEntity === undefined) {
      added.push(afterEntity)
      continue
    }
    const changes = detectChanges(beforeEntity, afterEntity)
    if (changes.length > 0) {
      changed.push({ key, before: beforeEntity, after: afterEntity, changes })
    } else {
      unchangedCount++
    }
  }

  for (const [key, beforeEntity] of beforeMap) {
    if (!afterMap.has(key)) removed.push(beforeEntity)
  }

  return { added, removed, changed, unchangedCount }
}

/** 文字列リストの追加/削除差分を求める（重複は除去）。 */
function diffList(
  before: string[],
  after: string[],
): { added: string[]; removed: string[] } {
  const beforeSet = new Set(before)
  const afterSet = new Set(after)
  const added = [...new Set(after.filter((x) => !beforeSet.has(x)))]
  const removed = [...new Set(before.filter((x) => !afterSet.has(x)))]
  return { added, removed }
}

/** 文字列プロパティが変わっていれば変更エントリを push する。 */
function pushIfChanged(
  changes: PropertyChange[],
  property: string,
  before?: string,
  after?: string,
): void {
  const b = before ?? ''
  const a = after ?? ''
  if (b !== a) changes.push({ property, before, after })
}

/** リスト差分を property 単位の変更エントリ列に変換する。 */
function pushListChanges(
  changes: PropertyChange[],
  property: string,
  before: string[],
  after: string[],
): void {
  const { added, removed } = diffList(before, after)
  for (const value of added) changes.push({ property, after: value })
  for (const value of removed) changes.push({ property, before: value })
}

// ── フィールド収集 ──────────────────────────────────────────────

/** フィールド同定キー: データソースフィールドは `${ds}::${column}`、ローカルは `ws:${sheet}::${column}`。 */
function collectFields(document: TableauDocument): Map<string, TableauField> {
  const map = new Map<string, TableauField>()
  for (const ds of document.datasources) {
    for (const f of ds.fields) {
      const key = `${ds.name}::${f.column}`
      // 表示のため所属情報を担保したコピーを保持
      map.set(key, { ...f, datasourceName: f.datasourceName ?? ds.name })
    }
  }
  for (const ws of document.worksheets) {
    for (const f of ws.localFields ?? []) {
      const key = `ws:${ws.name}::${f.column}`
      map.set(key, { ...f, datasourceName: `ws:${ws.name}` })
    }
  }
  return map
}

/** フィールドの変更点（formula/caption/dataType/role/isCalc）を列挙する。 */
function detectFieldChanges(
  before: TableauField,
  after: TableauField,
): PropertyChange[] {
  const changes: PropertyChange[] = []
  // formula は空白正規化して比較するが、表示は元の式を保持する
  if (normalizeFormula(before.formula) !== normalizeFormula(after.formula)) {
    changes.push({
      property: 'formula',
      before: before.formula,
      after: after.formula,
    })
  }
  pushIfChanged(changes, 'caption', before.caption, after.caption)
  pushIfChanged(changes, 'dataType', before.dataType, after.dataType)
  pushIfChanged(changes, 'role', before.role, after.role)
  // isCalc は真偽値の実効値で比較（undefined と false を同一視）
  const beforeCalc = String(!!before.isCalc)
  const afterCalc = String(!!after.isCalc)
  if (beforeCalc !== afterCalc) {
    changes.push({ property: 'isCalc', before: beforeCalc, after: afterCalc })
  }
  return changes
}

function diffFields(
  before: TableauDocument,
  after: TableauDocument,
): DiffCategory<TableauField> {
  const beforeMap = collectFields(before)
  const afterMap = collectFields(after)

  const added: TableauField[] = []
  const removed: TableauField[] = []
  const changed: ChangedEntry<TableauField>[] = []
  let unchangedCount = 0

  for (const [key, afterField] of afterMap) {
    const beforeField = beforeMap.get(key)
    if (beforeField === undefined) {
      added.push(afterField)
      continue
    }
    const changes = detectFieldChanges(beforeField, afterField)
    if (changes.length > 0) {
      changed.push({ key, before: beforeField, after: afterField, changes })
    } else {
      unchangedCount++
    }
  }

  for (const [key, beforeField] of beforeMap) {
    if (!afterMap.has(key)) removed.push(beforeField)
  }

  return { added, removed, changed, unchangedCount }
}

// ── ワークシートの変更検出 ──────────────────────────────────────

/** 棚（rows/cols/filters）のフィールド名リストを取り出す。 */
function shelfNames(
  shelf: WorksheetShelf | undefined,
  key: 'rows' | 'cols' | 'filters',
): string[] {
  // key は 'rows' | 'cols' | 'filters' のリテラル union のため安全
  // eslint-disable-next-line security/detect-object-injection
  return (shelf?.[key] ?? []).map((s) => s.name)
}

function detectWorksheetChanges(
  before: TableauWorksheet,
  after: TableauWorksheet,
): PropertyChange[] {
  const changes: PropertyChange[] = []
  // 依存フィールドの増減
  pushListChanges(
    changes,
    'dependencies',
    before.dependencies ?? [],
    after.dependencies ?? [],
  )
  // 棚（rows / cols / filters）の増減
  for (const key of ['rows', 'cols', 'filters'] as const) {
    pushListChanges(
      changes,
      key,
      shelfNames(before.shelf, key),
      shelfNames(after.shelf, key),
    )
  }
  // マークタイプの変化
  pushIfChanged(
    changes,
    'markType',
    before.shelf?.marks?.markType,
    after.shelf?.marks?.markType,
  )
  return changes
}

// ── エントリポイント ────────────────────────────────────────────

/**
 * 2つのワークブック（変更前 / 変更後）を比較し、カテゴリ別の diff を返す。
 * @param before 基準（変更前）ドキュメント
 * @param after 比較対象（変更後）ドキュメント
 */
export function diffWorkbooks(
  before: TableauDocument,
  after: TableauDocument,
): WorkbookDiff {
  return {
    // データソースは caption 変更のみ（フィールドは fields カテゴリで扱う）
    datasources: diffEntities(
      before.datasources,
      after.datasources,
      (ds) => ds.name,
      (b, a) => {
        const changes: PropertyChange[] = []
        pushIfChanged(changes, 'caption', b.caption, a.caption)
        return changes
      },
    ),
    fields: diffFields(before, after),
    worksheets: diffEntities(
      before.worksheets,
      after.worksheets,
      (ws) => ws.name,
      detectWorksheetChanges,
    ),
    dashboards: diffEntities(
      before.dashboards,
      after.dashboards,
      (db) => db.name,
      (b, a) => {
        const changes: PropertyChange[] = []
        pushListChanges(
          changes,
          'worksheets',
          b.worksheets ?? [],
          a.worksheets ?? [],
        )
        return changes
      },
    ),
  }
}
