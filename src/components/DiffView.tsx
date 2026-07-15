import { useState } from 'react'
import { ChevronDown, Plus, Minus, Pencil } from 'lucide-react'
import { t, type TKey } from '../utils/i18n'
import { FormulaHighlighter } from './FormulaHighlighter'
import type {
  ChangedEntry,
  DiffCategory,
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

/** エンティティの表示ラベルを求める。 */
function labelOfDatasource(ds: TableauDatasource): string {
  return stripBrackets(ds.caption) || ds.name
}
function labelOfField(f: TableauField): string {
  return stripBrackets(f.caption) || f.column
}
function labelOfWorksheet(ws: TableauWorksheet): string {
  return stripBrackets(ws.caption) || ws.name
}
function labelOfDashboard(db: TableauDashboard): string {
  return db.name
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

/** 追加/削除された1エンティティ行。 */
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
        <span className="text-[11px] text-slate-400 font-medium truncate">
          {sublabel}
        </span>
      )}
    </div>
  )
}

/** 1件のプロパティ変更の before/after 表示。 */
function PropertyChangeRow({ change }: { change: PropertyChange }) {
  const empty = t('diff.empty')
  // 計算式は FormulaHighlighter で上下に表示
  if (change.property === 'formula') {
    return (
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
          {propLabel('formula')}
        </div>
        <div>
          <div className="text-[10px] font-bold text-red-500 mb-1">
            {t('diff.before')}
          </div>
          <FormulaHighlighter formula={change.before ?? empty} />
        </div>
        <div>
          <div className="text-[10px] font-bold text-emerald-600 mb-1">
            {t('diff.after')}
          </div>
          <FormulaHighlighter formula={change.after ?? empty} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <span className="text-[11px] font-bold text-slate-400 min-w-[80px]">
        {propLabel(change.property)}
      </span>
      <span className="px-2 py-0.5 rounded-lg bg-red-50 text-red-600 font-medium line-through decoration-red-300">
        {change.before ?? empty}
      </span>
      <span className="text-slate-300">→</span>
      <span className="px-2 py-0.5 rounded-lg bg-emerald-50 text-emerald-600 font-medium">
        {change.after ?? empty}
      </span>
    </div>
  )
}

/** 変更された1エンティティ行。 */
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

/** 1カテゴリのセクション（展開可能）。 */
function CategorySection<T>({
  categoryKey,
  cat,
  labelOf,
  sublabelOf,
}: {
  categoryKey: CategoryKey
  cat: DiffCategory<T>
  labelOf: (entity: T) => string
  sublabelOf?: (entity: T) => string | undefined
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
          <SummaryBadges cat={cat as DiffCategory<unknown>} />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-400 font-medium">
            {t('diff.unchanged_count', { count: cat.unchangedCount })}
          </span>
          <ChevronDown
            size={18}
            className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </div>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {empty ? (
            <p className="text-sm text-slate-400 font-medium py-4 text-center">
              {t('diff.no_changes')}
            </p>
          ) : (
            <>
              {cat.added.map((entity, i) => (
                <EntityRow
                  key={`a-${i}`}
                  label={labelOf(entity)}
                  sublabel={sublabelOf?.(entity)}
                  variant="added"
                />
              ))}
              {cat.removed.map((entity, i) => (
                <EntityRow
                  key={`r-${i}`}
                  label={labelOf(entity)}
                  sublabel={sublabelOf?.(entity)}
                  variant="removed"
                />
              ))}
              {cat.changed.map((entry, i) => (
                <ChangedRow
                  key={`c-${i}`}
                  entry={entry}
                  label={labelOf(entry.after)}
                />
              ))}
            </>
          )}
        </div>
      )}
    </section>
  )
}

/** フィールドの所属（データソース / シート）を副ラベルにする。 */
function fieldSublabel(f: TableauField): string | undefined {
  const ds = f.datasourceName
  if (!ds) return undefined
  return ds.startsWith('ws:') ? ds.slice(3) : ds
}

export function DiffView({ diff, beforeName, afterName }: DiffViewProps) {
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
            <span className="text-slate-300">→</span>
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
      <CategorySection
        categoryKey="fields"
        cat={diff.fields}
        labelOf={labelOfField}
        sublabelOf={fieldSublabel}
      />
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
