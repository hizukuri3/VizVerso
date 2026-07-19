import type {
  DashboardZone,
  TableauDashboard,
  TableauDatasource,
  TableauDocument,
  TableauField,
  TableauWorksheet,
  WorksheetPane,
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

/**
 * 論理フィールド1件。
 * 同定キーは `${所属データソース名}::${column}`（データソース定義とワークシート再宣言を統合）。
 * どのデータソースにも属さない column はシート固有とし、キーは `ws:${sheet}::${column}`。
 */
export interface LogicalField {
  /** canonical な定義（データソース定義があれば優先、なければ最初の宣言） */
  field: TableauField
  /** この論理フィールドを再宣言しているワークシート名の集合 */
  declaredInSheets: string[]
}

export interface WorkbookDiff {
  datasources: DiffCategory<TableauDatasource>
  fields: DiffCategory<LogicalField>
  worksheets: DiffCategory<TableauWorksheet>
  dashboards: DiffCategory<TableauDashboard>
}

/** 計算式の空白差を無視するための正規化（連続空白→1つ、trim）。 */
function normalizeFormula(formula?: string): string {
  // \s+ はリテラル正規表現のため security/detect-non-literal-regexp の対象外
  return (formula ?? '').replace(/\s+/g, ' ').trim()
}

/** 前後のブラケット（[ ]）を外した文字列にする。 */
function stripBrackets(value?: string): string {
  if (!value) return ''
  // ^\[ / \]$ はリテラル正規表現のため security/detect-non-literal-regexp の対象外
  return value.replace(/^\[/, '').replace(/\]$/, '')
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

// ── 論理フィールド収集 ──────────────────────────────────────────

/** 収集中の内部アキュムレータ（canonical がデータソース由来かを記録）。 */
interface LogicalFieldAcc {
  field: TableauField
  /** canonical がデータソース定義由来か（true なら以降の再宣言で上書きしない） */
  fromDatasource: boolean
  declaredInSheets: string[]
}

/**
 * ドキュメントを「論理フィールド」単位で収集する。
 * - データソース定義フィールドは `${ds.name}::${column}` をキーとし canonical を優先確保する。
 * - ワークシートの localFields は元データソース名（TableauField.datasourceName）を保持しているため、
 *   それが既知のデータソースを指す場合は同じ論理フィールドの再宣言として統合し、
 *   宣言元シート名を declaredInSheets に集約する。
 * - datasourceName が未知（どのデータソースにも属さない）場合のみ、シート固有フィールドとして
 *   `ws:${sheet}::${column}` キーで残す（従来挙動を維持）。
 */
function collectLogicalFields(
  document: TableauDocument,
): Map<string, LogicalField> {
  const acc = new Map<string, LogicalFieldAcc>()
  const knownDatasources = new Set(document.datasources.map((d) => d.name))

  // 1. データソース定義（canonical を優先確保）
  for (const ds of document.datasources) {
    for (const f of ds.fields) {
      const key = `${ds.name}::${f.column}`
      const existing = acc.get(key)
      // 同一データソース内で重複定義があっても最初のものを canonical とする
      if (existing?.fromDatasource) continue
      acc.set(key, {
        field: { ...f, datasourceName: f.datasourceName ?? ds.name },
        fromDatasource: true,
        declaredInSheets: existing?.declaredInSheets ?? [],
      })
    }
  }

  // 2. ワークシートの再宣言（datasourceName で紐付け）
  for (const ws of document.worksheets) {
    for (const f of ws.localFields ?? []) {
      const origin = f.datasourceName
      const isKnown = !!origin && knownDatasources.has(origin)
      const key = isKnown
        ? `${origin}::${f.column}`
        : `ws:${ws.name}::${f.column}`
      const existing = acc.get(key)
      if (existing) {
        if (!existing.declaredInSheets.includes(ws.name)) {
          existing.declaredInSheets.push(ws.name)
        }
        // canonical は保持（データソース定義優先／なければ最初の宣言）
      } else {
        acc.set(key, {
          field: { ...f, datasourceName: isKnown ? origin : `ws:${ws.name}` },
          fromDatasource: false,
          declaredInSheets: [ws.name],
        })
      }
    }
  }

  const result = new Map<string, LogicalField>()
  for (const [key, v] of acc) {
    result.set(key, { field: v.field, declaredInSheets: v.declaredInSheets })
  }
  return result
}

/** 変更点を property 単位で重複排除する（先勝ち）。 */
function dedupeByProperty(changes: PropertyChange[]): PropertyChange[] {
  const seen = new Set<string>()
  const out: PropertyChange[] = []
  for (const c of changes) {
    if (seen.has(c.property)) continue
    seen.add(c.property)
    out.push(c)
  }
  return out
}

/** パラメータの現在値を文字列化する（undefined は ''）。 */
function serializeParamValue(value?: string | number): string {
  return value === undefined ? '' : String(value)
}

/** パラメータの許容範囲を `min..max` (+ ` step X`) に直列化する（全て undefined なら ''）。 */
function serializeParamRange(range?: TableauField['paramRange']): string {
  if (!range) return ''
  const { min, max, step } = range
  if (min === undefined && max === undefined && step === undefined) return ''
  const base = `${min ?? ''}..${max ?? ''}`
  return step !== undefined ? `${base} step ${step}` : base
}

/** パラメータの値リストをメンバー毎に `value` または `value (alias)` へ直列化する。 */
function serializeParamMembers(
  members?: TableauField['paramMembers'],
): string[] {
  return (members ?? []).map((m) =>
    m.alias !== undefined ? `${m.value} (${m.alias})` : `${m.value}`,
  )
}

/** フィールドの変更点（formula/caption/dataType/role/isCalc/型/パラメータ系）を列挙する。 */
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
  // 連続/不連続（type: quantitative/nominal/ordinal）の変化
  pushIfChanged(changes, 'fieldType', before.type, after.type)
  // パラメータの現在値
  pushIfChanged(
    changes,
    'paramValue',
    serializeParamValue(before.value),
    serializeParamValue(after.value),
  )
  // パラメータの許容値の種類（list / range / any）
  pushIfChanged(
    changes,
    'paramDomain',
    before.paramDomainType,
    after.paramDomainType,
  )
  // パラメータの許容範囲
  pushIfChanged(
    changes,
    'paramRange',
    serializeParamRange(before.paramRange),
    serializeParamRange(after.paramRange),
  )
  // パラメータの値リスト（メンバー増減）
  pushListChanges(
    changes,
    'paramMembers',
    serializeParamMembers(before.paramMembers),
    serializeParamMembers(after.paramMembers),
  )
  return changes
}

function diffFields(
  before: TableauDocument,
  after: TableauDocument,
): DiffCategory<LogicalField> {
  const beforeMap = collectLogicalFields(before)
  const afterMap = collectLogicalFields(after)

  const added: LogicalField[] = []
  const removed: LogicalField[] = []
  const changed: ChangedEntry<LogicalField>[] = []
  let unchangedCount = 0

  for (const [key, afterLf] of afterMap) {
    const beforeLf = beforeMap.get(key)
    if (beforeLf === undefined) {
      added.push(afterLf)
      continue
    }
    // 変更検出は canonical 定義同士で行い、property 単位で重複排除する
    const changes = dedupeByProperty(
      detectFieldChanges(beforeLf.field, afterLf.field),
    )
    if (changes.length > 0) {
      changed.push({ key, before: beforeLf, after: afterLf, changes })
    } else {
      unchangedCount++
    }
  }

  for (const [key, beforeLf] of beforeMap) {
    if (!afterMap.has(key)) removed.push(beforeLf)
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

/** マークカードのエンコーディング棚（color/size/label/...）のフィールド名リストを取り出す。 */
function encodingNames(
  pane: WorksheetPane | undefined,
  key: keyof WorksheetPane['encodings'],
): string[] {
  // key は encodings のキーのリテラル union のため安全
  // eslint-disable-next-line security/detect-object-injection
  return (pane?.encodings?.[key] ?? []).map((s) => s.name)
}

/** エンコーディング棚と対応する property 名の一覧。 */
const ENCODING_PROPS: [keyof WorksheetPane['encodings'], string][] = [
  ['color', 'encodingColor'],
  ['size', 'encodingSize'],
  ['label', 'encodingLabel'],
  ['detail', 'encodingDetail'],
  ['tooltip', 'encodingTooltip'],
  ['shape', 'encodingShape'],
]

function detectWorksheetChanges(
  before: TableauWorksheet,
  after: TableauWorksheet,
): PropertyChange[] {
  const changes: PropertyChange[] = []
  // キャプションの変化
  pushIfChanged(changes, 'caption', before.caption, after.caption)
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
  // マークカードのエンコーディング（色/サイズ/ラベル/詳細/ツールヒント/形状）の増減
  for (const [enc, prop] of ENCODING_PROPS) {
    pushListChanges(
      changes,
      prop,
      encodingNames(before.shelf?.marks, enc),
      encodingNames(after.shelf?.marks, enc),
    )
  }
  return changes
}

// ── ダッシュボードの変更検出 ──────────────────────────────────────

/** ダッシュボードのサイズを `width×height` に直列化する（両方 undefined なら ''）。 */
function serializeDashboardSize(width?: number, height?: number): string {
  if (width === undefined && height === undefined) return ''
  return `${width ?? ''}×${height ?? ''}`
}

/** ゾーンの表示ラベル（name > title > param、ブラケット除去。無ければ (unnamed)）。 */
function zoneLabel(zone: DashboardZone): string {
  const label = stripBrackets(zone.name ?? zone.title ?? zone.param)
  return label || '(unnamed)'
}

/** ゾーンの説明文字列 `ラベル [kind]`。 */
function zoneDesc(zone: DashboardZone): string {
  return `${zoneLabel(zone)} [${zone.kind}]`
}

/** ゾーンのマッチングキー（kind + ラベル）。 */
function zoneMatchKey(zone: DashboardZone): string {
  return `${zone.kind}::${stripBrackets(zone.name ?? zone.title ?? zone.param ?? '')}`
}

/**
 * ゾーン列を「出現順で一意化したキー → ゾーン」の Map にする。
 * kind='other'（レイアウトコンテナ等）は対象外。
 * 同一キーが複数ある場合は 2 件目以降に `#2` のような出現インデックスを付与する。
 */
function indexZones(zones: DashboardZone[]): Map<string, DashboardZone> {
  const counts = new Map<string, number>()
  const map = new Map<string, DashboardZone>()
  for (const zone of zones) {
    if (zone.kind === 'other') continue
    const base = zoneMatchKey(zone)
    const n = (counts.get(base) ?? 0) + 1
    counts.set(base, n)
    map.set(n === 1 ? base : `${base}#${n}`, zone)
  }
  return map
}

/**
 * ゾーンのレイアウトを人間可読な文字列に直列化する。
 * ダッシュボードの width/height（px）が両方ある版は正規化座標(100000基準)を px 換算し
 * `x,y w×hpx`、無い版は % 換算（小数1桁）で `x%,y% w%×h%`。
 */
function zoneLayoutStr(
  zone: DashboardZone,
  dashWidth?: number,
  dashHeight?: number,
): string {
  if (dashWidth !== undefined && dashHeight !== undefined) {
    const px = (v: number, total: number): number =>
      Math.round((v / 100000) * total)
    return `${px(zone.x, dashWidth)},${px(zone.y, dashHeight)} ${px(zone.w, dashWidth)}×${px(zone.h, dashHeight)}px`
  }
  const pct = (v: number): string => ((v / 100000) * 100).toFixed(1)
  return `${pct(zone.x)}%,${pct(zone.y)}% ${pct(zone.w)}%×${pct(zone.h)}%`
}

/** ゾーンの x/y/w/h が変わったか（floating / zOrder は無視）。 */
function zoneLayoutChanged(a: DashboardZone, b: DashboardZone): boolean {
  return a.x !== b.x || a.y !== b.y || a.w !== b.w || a.h !== b.h
}

/** ダッシュボードの変更点（caption/size/worksheets/usedFields/zones）を列挙する。 */
function detectDashboardChanges(
  before: TableauDashboard,
  after: TableauDashboard,
): PropertyChange[] {
  const changes: PropertyChange[] = []
  // キャプションの変化
  pushIfChanged(changes, 'caption', before.caption, after.caption)
  // サイズの変化
  pushIfChanged(
    changes,
    'size',
    serializeDashboardSize(before.width, before.height),
    serializeDashboardSize(after.width, after.height),
  )
  // 配置シート構成の増減
  pushListChanges(
    changes,
    'worksheets',
    before.worksheets ?? [],
    after.worksheets ?? [],
  )
  // 参照フィールド（パラメータコントロール / 動的ゾーン表示）の増減
  pushListChanges(
    changes,
    'usedFields',
    before.usedFields ?? [],
    after.usedFields ?? [],
  )
  // ゾーン（オブジェクト）の追加/削除/移動
  const beforeZones = indexZones(before.zones ?? [])
  const afterZones = indexZones(after.zones ?? [])
  for (const [key, afterZone] of afterZones) {
    const beforeZone = beforeZones.get(key)
    if (beforeZone === undefined) {
      changes.push({ property: 'zones', after: zoneDesc(afterZone) })
      continue
    }
    if (zoneLayoutChanged(beforeZone, afterZone)) {
      changes.push({
        property: 'zoneLayout',
        before: `${zoneDesc(beforeZone)}: ${zoneLayoutStr(beforeZone, before.width, before.height)}`,
        after: `${zoneDesc(afterZone)}: ${zoneLayoutStr(afterZone, after.width, after.height)}`,
      })
    }
  }
  for (const [key, beforeZone] of beforeZones) {
    if (!afterZones.has(key)) {
      changes.push({ property: 'zones', before: zoneDesc(beforeZone) })
    }
  }
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
      detectDashboardChanges,
    ),
  }
}
