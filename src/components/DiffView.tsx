import { useState, type ReactNode } from 'react'
import { ChevronDown, Plus, Minus, Pencil, Tag, Layers } from 'lucide-react'
import { t, type TKey } from '../utils/i18n'
import { formatFormulaText } from '../utils/formulaFormatter'
import { diffTokens, type DiffSegment } from '../utils/textDiff'
import type {
  ChangedEntry,
  DiffCategory,
  LogicalField,
  PropertyChange,
  WorkbookDiff,
} from '../utils/workbookDiff'
import type {
  TableauDashboard,
  TableauDatasource,
  TableauField,
  TableauWorksheet,
} from '../types/tableau'

interface DiffViewProps {
  diff: WorkbookDiff
  beforeName?: string
  afterName?: string
  /**
   * 計算式のキャプション置換に使うフィールドメタ（column → caption）。
   * CompareView が before/after 両ドキュメントから構築して渡す（表示専用）。
   */
  fieldMeta?: Map<string, { caption?: string }>
}

type CategoryKey = 'datasources' | 'fields' | 'worksheets' | 'dashboards'

const CATEGORY_ORDER: CategoryKey[] = [
  'datasources',
  'fields',
  'worksheets',
  'dashboards',
]

/** 前後のブラケットを外した表示名にする。 */
function stripBrackets(value?: string): string {
  if (!value) return ''
  return value.replace(/^\[/, '').replace(/\]$/, '')
}

/** 物理名が自動生成の計算フィールド名（Calculation_...）か。 */
function isGeneratedName(column: string): boolean {
  return column.includes('Calculation_')
}

/** エンティティの表示ラベルを求める。 */
function labelOfDatasource(ds: TableauDatasource): string {
  return stripBrackets(ds.caption) || ds.name
}
function labelOfWorksheet(ws: TableauWorksheet): string {
  return stripBrackets(ws.caption) || ws.name
}
function labelOfDashboard(db: TableauDashboard): string {
  return db.name
}

/** フィールドの表示名（caption 優先、なければ物理名）。 */
function fieldDisplayName(f: TableauField): string {
  return stripBrackets(f.caption) || stripBrackets(f.column)
}

/**
 * 補助表示する物理名。自動生成名（Calculation_）は決して見せず、
 * それ以外は caption と column が異なる場合のみ返す。
 */
function fieldAuxColumn(f: TableauField): string | undefined {
  if (isGeneratedName(f.column)) return undefined
  const col = stripBrackets(f.column)
  const caption = stripBrackets(f.caption)
  if (!caption || caption === col) return undefined
  return col
}

/** プロパティ名を i18n ラベルに変換する。 */
function propLabel(property: string): string {
  return t(`diff.prop.${property}` as TKey)
}

/** カテゴリの追加/削除/変更が全て空か。 */
function isEmptyCategory<T>(cat: DiffCategory<T>): boolean {
  return (
    cat.added.length === 0 &&
    cat.removed.length === 0 &&
    cat.changed.length === 0
  )
}

/** 追加/削除/変更のサマリーバッジ。 */
function SummaryBadges({
  testId,
  cat,
}: {
  testId?: string
  cat: DiffCategory<unknown>
}) {
  return (
    <div data-testid={testId} className="flex items-center gap-2">
      <span
        data-testid="count-added"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-600"
        title={t('diff.summary_added')}
      >
        <Plus size={11} />
        {cat.added.length}
      </span>
      <span
        data-testid="count-removed"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-red-50 text-red-600"
        title={t('diff.summary_removed')}
      >
        <Minus size={11} />
        {cat.removed.length}
      </span>
      <span
        data-testid="count-changed"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-50 text-amber-600"
        title={t('diff.summary_changed')}
      >
        <Pencil size={11} />
        {cat.changed.length}
      </span>
    </div>
  )
}

/** 影響シート（再宣言シート）の件数バッジ。シート名一覧はツールチップで見られる。 */
function AffectedSheets({ sheets }: { sheets: string[] }) {
  if (sheets.length === 0) return null
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 flex-shrink-0"
      title={sheets.join(', ')}
    >
      <Layers size={11} />
      {t('diff.affected_sheets', { count: sheets.length })}
    </span>
  )
}

/** 追加/削除された1エンティティ行（データソース/シート/ダッシュボード用）。 */
function EntityRow({
  label,
  sublabel,
  variant,
}: {
  label: string
  sublabel?: string
  variant: 'added' | 'removed'
}) {
  const styles =
    variant === 'added'
      ? 'bg-emerald-50/60 border-emerald-100'
      : 'bg-red-50/60 border-red-100'
  const icon =
    variant === 'added' ? (
      <Plus size={14} className="text-emerald-500 flex-shrink-0" />
    ) : (
      <Minus size={14} className="text-red-500 flex-shrink-0" />
    )
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${styles}`}
    >
      {icon}
      <span className="text-sm font-bold text-slate-700 truncate">{label}</span>
      {sublabel && (
        <span className="text-[11px] text-slate-500 font-medium truncate">
          {sublabel}
        </span>
      )}
    </div>
  )
}

/** 追加/削除された1フィールド行（表示名 + 補助物理名 + 影響シート）。 */
function FieldEntityRow({
  lf,
  variant,
}: {
  lf: LogicalField
  variant: 'added' | 'removed'
}) {
  const f = lf.field
  const aux = fieldAuxColumn(f)
  const styles =
    variant === 'added'
      ? 'bg-emerald-50/60 border-emerald-100'
      : 'bg-red-50/60 border-red-100'
  const icon =
    variant === 'added' ? (
      <Plus size={14} className="text-emerald-500 flex-shrink-0" />
    ) : (
      <Minus size={14} className="text-red-500 flex-shrink-0" />
    )
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${styles}`}
    >
      {icon}
      <span className="text-sm font-bold text-slate-700 truncate">
        {fieldDisplayName(f)}
      </span>
      {aux && (
        <span className="text-[11px] text-slate-500 font-mono truncate">
          {aux}
        </span>
      )}
      <div className="ml-auto">
        <AffectedSheets sheets={lf.declaredInSheets} />
      </div>
    </div>
  )
}

/** 計算式の変更を、キャプション置換後の表示文字列でトークン単位に強調表示する。 */
function FormulaDiff({
  before,
  after,
  fieldMeta,
}: {
  before?: string
  after?: string
  fieldMeta: Map<string, { caption?: string }>
}) {
  const empty = t('diff.empty')
  // ハイライトは「表示用（キャプション置換後）」文字列同士で計算し、表示と一致させる
  const beforeText = formatFormulaText(before, fieldMeta) ?? empty
  const afterText = formatFormulaText(after, fieldMeta) ?? empty
  const segments = diffTokens(beforeText, afterText)

  const renderBlock = (
    skip: DiffSegment['type'],
    highlight: 'removed' | 'added',
  ) =>
    segments
      .filter((s) => s.type !== skip)
      .map((s, i) =>
        s.type === highlight ? (
          <span
            key={i}
            data-diff-seg={highlight}
            className={
              highlight === 'removed'
                ? 'bg-red-100 text-red-700 rounded-sm line-through decoration-red-400'
                : 'bg-emerald-100 text-emerald-700 rounded-sm'
            }
          >
            {s.text}
          </span>
        ) : (
          <span key={i} className="text-slate-600">
            {s.text}
          </span>
        ),
      )

  return (
    <div className="space-y-2">
      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
        {propLabel('formula')}
      </div>
      <div>
        <div className="text-[11px] font-bold text-red-500 mb-1">
          {t('diff.before')}
        </div>
        <pre className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">
          {renderBlock('added', 'removed')}
        </pre>
      </div>
      <div>
        <div className="text-[11px] font-bold text-emerald-600 mb-1">
          {t('diff.after')}
        </div>
        <pre className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 font-mono text-[13px] leading-relaxed whitespace-pre-wrap break-all">
          {renderBlock('removed', 'added')}
        </pre>
      </div>
    </div>
  )
}

/** 1件のプロパティ変更の before/after 表示（短い値は「旧 → 新」のまま）。 */
function PropertyChangeRow({
  change,
  fieldMeta,
}: {
  change: PropertyChange
  /** 与えられると formula は diff ハイライト表示になる（フィールド用） */
  fieldMeta?: Map<string, { caption?: string }>
}) {
  const empty = t('diff.empty')
  if (change.property === 'formula' && fieldMeta) {
    return (
      <FormulaDiff
        before={change.before}
        after={change.after}
        fieldMeta={fieldMeta}
      />
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[11px] font-bold text-slate-500 min-w-[80px]">
        {propLabel(change.property)}
      </span>
      <span className="px-2 py-0.5 rounded-lg bg-red-50 text-red-600 font-medium line-through decoration-red-300">
        {change.before ?? empty}
      </span>
      <span className="text-slate-400">→</span>
      <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 font-medium">
        {change.after ?? empty}
      </span>
    </div>
  )
}

/** 変更された1エンティティ行（データソース/シート/ダッシュボード用）。 */
function ChangedRow<T>({
  entry,
  label,
}: {
  entry: ChangedEntry<T>
  label: string
}) {
  return (
    <div className="px-3 py-3 rounded-xl border border-amber-100 bg-amber-50/40 space-y-3">
      <div className="flex items-center gap-2">
        <Pencil size={14} className="text-amber-500 flex-shrink-0" />
        <span className="text-sm font-bold text-slate-700 truncate">
          {label}
        </span>
      </div>
      <div className="space-y-2 pl-6">
        {entry.changes.map((change, i) => (
          <PropertyChangeRow key={i} change={change} />
        ))}
      </div>
    </div>
  )
}

/** 変更された1フィールド行（名称変更の見出し格上げ + 計算式ハイライト）。 */
function FieldChangedRow({
  entry,
  fieldMeta,
}: {
  entry: ChangedEntry<LogicalField>
  fieldMeta: Map<string, { caption?: string }>
}) {
  const captionChange = entry.changes.find((c) => c.property === 'caption')
  // caption は見出しに格上げするため詳細リストからは除外して重複を避ける
  const detailChanges = entry.changes.filter((c) => c.property !== 'caption')
  const beforeName = fieldDisplayName(entry.before.field)
  const afterName = fieldDisplayName(entry.after.field)

  return (
    <div className="px-3 py-3 rounded-xl border border-amber-100 bg-amber-50/40 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {captionChange ? (
          <>
            <Tag size={14} className="text-amber-500 flex-shrink-0" />
            <span className="text-sm font-bold text-slate-500 line-through decoration-slate-300 truncate">
              {beforeName}
            </span>
            <span className="text-slate-400">→</span>
            <span className="text-sm font-bold text-slate-700 truncate">
              {afterName}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold bg-amber-100 text-amber-700">
              {t('diff.renamed')}
            </span>
          </>
        ) : (
          <>
            <Pencil size={14} className="text-amber-500 flex-shrink-0" />
            <span className="text-sm font-bold text-slate-700 truncate">
              {afterName}
            </span>
          </>
        )}
        <div className="ml-auto">
          <AffectedSheets sheets={entry.after.declaredInSheets} />
        </div>
      </div>
      {detailChanges.length > 0 && (
        <div className="space-y-2 pl-6">
          {detailChanges.map((change, i) => (
            <PropertyChangeRow key={i} change={change} fieldMeta={fieldMeta} />
          ))}
        </div>
      )}
    </div>
  )
}

/** 折りたたみ可能なセクションの外枠（ヘッダー + 本文コンテナ）。 */
function SectionShell({
  categoryKey,
  cat,
  children,
}: {
  categoryKey: CategoryKey
  cat: DiffCategory<unknown>
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  const empty = isEmptyCategory(cat)

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50/60 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-black text-slate-800">
            {t(`diff.category.${categoryKey}` as TKey)}
          </span>
          <SummaryBadges cat={cat} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-500 font-medium">
            {t('diff.unchanged_count', { count: cat.unchangedCount })}
          </span>
          <ChevronDown
            size={18}
            className={`text-slate-500 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {empty ? (
            <p className="text-sm text-slate-500 font-medium py-4 text-center">
              {t('diff.no_changes')}
            </p>
          ) : (
            children
          )}
        </div>
      )}
    </section>
  )
}

/** 汎用カテゴリのセクション（データソース/シート/ダッシュボード）。 */
function CategorySection<T>({
  categoryKey,
  cat,
  labelOf,
}: {
  categoryKey: CategoryKey
  cat: DiffCategory<T>
  labelOf: (entity: T) => string
}) {
  return (
    <SectionShell categoryKey={categoryKey} cat={cat as DiffCategory<unknown>}>
      {cat.added.map((entity, i) => (
        <EntityRow key={`a-${i}`} label={labelOf(entity)} variant="added" />
      ))}
      {cat.removed.map((entity, i) => (
        <EntityRow key={`r-${i}`} label={labelOf(entity)} variant="removed" />
      ))}
      {cat.changed.map((entry, i) => (
        <ChangedRow key={`c-${i}`} entry={entry} label={labelOf(entry.after)} />
      ))}
    </SectionShell>
  )
}

/** フィールド専用セクション（論理フィールド集約 + キャプション統一表示）。 */
function FieldsSection({
  cat,
  fieldMeta,
}: {
  cat: DiffCategory<LogicalField>
  fieldMeta: Map<string, { caption?: string }>
}) {
  return (
    <SectionShell categoryKey="fields" cat={cat as DiffCategory<unknown>}>
      {cat.added.map((lf, i) => (
        <FieldEntityRow key={`a-${i}`} lf={lf} variant="added" />
      ))}
      {cat.removed.map((lf, i) => (
        <FieldEntityRow key={`r-${i}`} lf={lf} variant="removed" />
      ))}
      {cat.changed.map((entry, i) => (
        <FieldChangedRow key={`c-${i}`} entry={entry} fieldMeta={fieldMeta} />
      ))}
    </SectionShell>
  )
}

export function DiffView({
  diff,
  beforeName,
  afterName,
  fieldMeta,
}: DiffViewProps) {
  const meta = fieldMeta ?? new Map<string, { caption?: string }>()
  return (
    <div className="max-w-4xl mx-auto w-full space-y-5">
      {/* サマリーヘッダー */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
        <h2 className="text-lg font-black text-slate-800 mb-1">
          {t('diff.title')}
        </h2>
        {(beforeName || afterName) && (
          <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 mb-4">
            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
              {beforeName ?? t('diff.before_label')}
            </span>
            <span className="text-slate-400">→</span>
            <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600">
              {afterName ?? t('diff.after_label')}
            </span>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CATEGORY_ORDER.map((key) => (
            <div
              key={key}
              className="flex items-center justify-between px-4 py-3 rounded-2xl bg-slate-50 border border-slate-100"
            >
              <span className="text-sm font-bold text-slate-700">
                {t(`diff.category.${key}` as TKey)}
              </span>
              <SummaryBadges
                testId={`diff-summary-${key}`}
                // key は CategoryKey のリテラル union のため安全
                // eslint-disable-next-line security/detect-object-injection
                cat={diff[key] as DiffCategory<unknown>}
              />
            </div>
          ))}
        </div>
      </div>

      {/* カテゴリ別セクション */}
      <CategorySection
        categoryKey="datasources"
        cat={diff.datasources}
        labelOf={labelOfDatasource}
      />
      <FieldsSection cat={diff.fields} fieldMeta={meta} />
      <CategorySection
        categoryKey="worksheets"
        cat={diff.worksheets}
        labelOf={labelOfWorksheet}
      />
      <CategorySection
        categoryKey="dashboards"
        cat={diff.dashboards}
        labelOf={labelOfDashboard}
      />
    </div>
  )
}
