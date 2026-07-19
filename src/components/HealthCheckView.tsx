import { useMemo, useState, type ReactNode } from 'react'
import {
  HeartPulse,
  ChevronDown,
  AlertTriangle,
  Info,
  CheckCircle2,
} from 'lucide-react'
import { t, type TKey } from '../utils/i18n'
import {
  lintWorkbook,
  RULE_ORDER,
  type LintCategory,
  type LintFinding,
  type LintRuleId,
  type LintSeverity,
} from '../utils/calcLinter'
import type { TableauDocument } from '../types/tableau'

interface HealthCheckViewProps {
  doc: TableauDocument
  /**
   * 指摘行クリック時にフィールド詳細ドロワーを開くためのコールバック。
   * SideDrawer は normalizeFieldId(column) でフィールドを解決するため、
   * DetailView.onOpenDrawer と同様に「フィールドの物理名相当」を渡す必要がある。
   * finding.fieldId は normalizeFieldId 済みの column なのでそのまま渡す。
   */
  onOpenField?: (fieldName: string) => void
}

// カテゴリの表示順（パフォーマンス → 複雑度 → クリーンアップ）
const CATEGORY_ORDER: readonly LintCategory[] = [
  'performance',
  'complexity',
  'cleanup',
]

// ルールIDの表示順（RULE_ORDER の並びを踏襲）
const RULE_ID_ORDER: readonly LintRuleId[] = RULE_ORDER.map((r) => r.ruleId)

/** スコアに応じた色クラス（80以上=emerald / 50〜79=amber / 49以下=red）。 */
function scoreColorClass(score: number): string {
  if (score >= 80) return 'text-emerald-500'
  if (score >= 50) return 'text-amber-500'
  return 'text-red-500'
}

/** severity バッジ（警告=amber / 情報=sky）。 */
function SeverityBadge({ severity }: { severity: LintSeverity }) {
  const isWarning = severity === 'warning'
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-bold ${
        isWarning ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'
      }`}
    >
      {isWarning ? <AlertTriangle size={11} /> : <Info size={11} />}
      {t(`health.severity.${severity}` as TKey)}
    </span>
  )
}

/** ヘッダーの severity 別件数チップ。 */
function SeverityCountChip({
  severity,
  count,
}: {
  severity: LintSeverity
  count: number
}) {
  const isWarning = severity === 'warning'
  return (
    <span
      data-testid={`health-count-${severity}`}
      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold ${
        isWarning ? 'bg-amber-50 text-amber-600' : 'bg-sky-50 text-sky-600'
      }`}
    >
      {isWarning ? <AlertTriangle size={13} /> : <Info size={13} />}
      {t(`health.severity.${severity}` as TKey)}
      <span className="font-black">{count}</span>
    </span>
  )
}

/** 指摘1件の行（クリックでフィールド詳細ドロワーへ誘導）。 */
function FindingRow({
  finding,
  onOpenField,
}: {
  finding: LintFinding
  onOpenField?: (fieldName: string) => void
}) {
  // ルール固有詳細（params があるルールのみ detail キーを持つ契約）
  const detail = finding.params
    ? t(`health.rule.${finding.ruleId}.detail` as TKey, finding.params)
    : undefined

  return (
    <button
      type="button"
      onClick={() => onOpenField?.(finding.fieldId)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-slate-100 bg-white hover:border-blue-300 hover:shadow-sm transition group text-left"
    >
      <span
        className="text-sm font-bold text-slate-700 truncate"
        title={finding.caption}
      >
        {finding.caption}
      </span>
      {finding.datasourceName && (
        <span className="text-[11px] text-slate-500 font-medium truncate shrink-0">
          {finding.datasourceName}
        </span>
      )}
      {detail && (
        <span className="ml-auto text-[11px] font-medium text-slate-500 bg-slate-50 border border-slate-100 rounded-lg px-2 py-0.5 shrink-0">
          {detail}
        </span>
      )}
    </button>
  )
}

/** ルール1件分の折りたたみ可能なカード（DiffView の SectionShell 風）。 */
function RuleCard({
  ruleId,
  findings,
  onOpenField,
}: {
  ruleId: LintRuleId
  findings: LintFinding[]
  onOpenField?: (fieldName: string) => void
}) {
  const [open, setOpen] = useState(true)
  // 同一ルール内の severity は共通なので先頭要素から取得する
  const severity = findings[0].severity

  return (
    <section className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 hover:bg-slate-50/60 transition-colors text-left"
      >
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-black text-slate-800">
              {t(`health.rule.${ruleId}.title` as TKey)}
            </span>
            <SeverityBadge severity={severity} />
            <span className="inline-flex items-center px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-100 text-slate-500">
              {t('health.findings_count', { count: findings.length })}
            </span>
          </div>
          <p className="text-[11px] text-slate-500 font-medium leading-relaxed">
            {t(`health.rule.${ruleId}.desc` as TKey)}
          </p>
        </div>
        <ChevronDown
          size={18}
          className={`text-slate-500 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 space-y-2 animate-in fade-in slide-in-from-top-1 duration-200">
          {findings.map((finding) => (
            <FindingRow
              key={finding.fieldId}
              finding={finding}
              onOpenField={onOpenField}
            />
          ))}
        </div>
      )}
    </section>
  )
}

/** カテゴリ別セクション（見出し + そのカテゴリのルールカード群）。 */
function CategorySection({
  category,
  children,
}: {
  category: LintCategory
  children: ReactNode
}) {
  return (
    <div className="space-y-3">
      <h3 className="px-1 text-xs font-bold text-slate-500 uppercase tracking-widest">
        {t(`health.category.${category}` as TKey)}
      </h3>
      {children}
    </div>
  )
}

export function HealthCheckView({ doc, onOpenField }: HealthCheckViewProps) {
  const result = useMemo(() => lintWorkbook(doc), [doc])

  // 指摘をルールID単位に集約（RULE_ORDER の並びで安定化）
  const findingsByRule = useMemo(() => {
    const map = new Map<LintRuleId, LintFinding[]>()
    for (const finding of result.findings) {
      const list = map.get(finding.ruleId)
      if (list) {
        list.push(finding)
      } else {
        map.set(finding.ruleId, [finding])
      }
    }
    return map
  }, [result.findings])

  // severity 別の総件数
  const warningCount = result.findings.filter(
    (f) => f.severity === 'warning',
  ).length
  const infoCount = result.findings.filter((f) => f.severity === 'info').length

  const hasFindings = result.findings.length > 0

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-4xl mx-auto w-full px-6 sm:px-10 py-8 space-y-5">
        {/* ヘッダーカード */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6">
            <div className="flex-1 min-w-0">
              <h2 className="flex items-center gap-2 text-lg font-black text-slate-800 mb-1">
                <span className="p-1.5 bg-rose-50 text-rose-500 rounded-xl">
                  <HeartPulse size={18} />
                </span>
                {t('health.title')}
              </h2>
              <p className="text-sm text-slate-500 font-medium leading-relaxed">
                {t('health.subtitle')}
              </p>
              <p className="mt-3 text-xs font-bold text-slate-500">
                {t('health.calc_fields', { count: result.calcFieldCount })}
              </p>
            </div>

            {/* ヘルススコア */}
            <div className="flex flex-col items-center justify-center px-6 py-4 rounded-2xl bg-slate-50 border border-slate-100 shrink-0">
              <span
                data-testid="health-score"
                className={`text-5xl font-black leading-none tracking-tight ${scoreColorClass(result.score)}`}
              >
                {result.score}
              </span>
              <span className="mt-2 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                {t('health.score_label')}
              </span>
            </div>
          </div>

          {/* severity 別件数サマリー */}
          {hasFindings && (
            <div
              data-testid="health-severity-summary"
              className="flex flex-wrap items-center gap-2 mt-6 pt-6 border-t border-slate-100"
            >
              <SeverityCountChip severity="warning" count={warningCount} />
              <SeverityCountChip severity="info" count={infoCount} />
            </div>
          )}
        </div>

        {/* 空状態 */}
        {!hasFindings ? (
          <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-10 text-center">
            <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={32} />
            </div>
            <h3 className="text-lg font-black text-slate-800 mb-2">
              {t('health.no_findings')}
            </h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">
              {t('health.no_findings_desc')}
            </p>
          </div>
        ) : (
          // カテゴリ別セクション（指摘のあるカテゴリ・ルールのみ表示）
          CATEGORY_ORDER.map((category) => {
            const ruleIds = RULE_ID_ORDER.filter((ruleId) => {
              const list = findingsByRule.get(ruleId)
              const first = list?.[0]
              return !!first && first.category === category
            })
            if (ruleIds.length === 0) return null
            return (
              <CategorySection key={category} category={category}>
                {ruleIds.map((ruleId) => (
                  <RuleCard
                    key={ruleId}
                    ruleId={ruleId}
                    findings={findingsByRule.get(ruleId)!}
                    onOpenField={onOpenField}
                  />
                ))}
              </CategorySection>
            )
          })
        )}
      </div>
    </div>
  )
}
