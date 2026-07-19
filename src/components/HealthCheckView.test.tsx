/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, within } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { HealthCheckView } from './HealthCheckView'
import {
  lintWorkbook,
  RULE_ORDER,
  type LintFinding,
  type LintResult,
} from '../utils/calcLinter'
import type { TableauDocument } from '../types/tableau'
import '@testing-library/jest-dom'

// リントエンジンはモックし、契約型どおりの LintResult を返して UI を検証する
// （エンジン実装の進捗に依存しないため）。RULE_ORDER 等の実定数は温存する。
vi.mock('../utils/calcLinter', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../utils/calcLinter')>()
  return { ...actual, lintWorkbook: vi.fn() }
})

const doc: TableauDocument = {
  datasources: [],
  worksheets: [],
  dashboards: [],
}

/** findings からルール別集計を作り、契約どおりの LintResult を組み立てる。 */
function buildResult(
  findings: LintFinding[],
  overrides: Partial<LintResult> = {},
): LintResult {
  const rules = RULE_ORDER.map((r) => ({
    ...r,
    count: findings.filter((f) => f.ruleId === r.ruleId).length,
  }))
  return {
    findings,
    rules,
    calcFieldCount: 10,
    score: 65,
    ...overrides,
  }
}

const sampleFindings: LintFinding[] = [
  {
    ruleId: 'countd',
    severity: 'info',
    category: 'performance',
    fieldId: 'distinct customers',
    caption: 'Distinct Customers',
    datasourceName: 'Sample DS',
    params: { count: 3 },
  },
  {
    ruleId: 'deepIfChain',
    severity: 'warning',
    category: 'complexity',
    fieldId: 'big case',
    caption: 'Big Case',
    datasourceName: 'Sample DS',
    params: { count: 12 },
  },
  {
    ruleId: 'unusedCalc',
    severity: 'info',
    category: 'cleanup',
    fieldId: 'orphan calc',
    caption: 'Orphan Calc',
    datasourceName: 'Sample DS',
  },
]

describe('HealthCheckView', () => {
  beforeEach(() => {
    vi.mocked(lintWorkbook).mockReset()
  })

  it('ヘルススコアと検査対象件数が表示されること', () => {
    vi.mocked(lintWorkbook).mockReturnValue(
      buildResult(sampleFindings, { score: 65, calcFieldCount: 10 }),
    )
    render(<HealthCheckView doc={doc} />)

    const score = screen.getByTestId('health-score')
    expect(score).toHaveTextContent('65')
    // 50〜79 は amber 系
    expect(score.className).toContain('amber')
    // 検査した計算フィールド数
    expect(screen.getByText('検査した計算フィールド: 10')).toBeInTheDocument()
  })

  it('スコアに応じてスコア色が切り替わること', () => {
    vi.mocked(lintWorkbook).mockReturnValue(
      buildResult(sampleFindings, { score: 90 }),
    )
    const { rerender } = render(<HealthCheckView doc={doc} />)
    expect(screen.getByTestId('health-score').className).toContain('emerald')

    vi.mocked(lintWorkbook).mockReturnValue(
      buildResult(sampleFindings, { score: 30 }),
    )
    rerender(<HealthCheckView doc={{ ...doc }} />)
    expect(screen.getByTestId('health-score').className).toContain('red')
  })

  it('指摘行にフィールド表示名・データソース名・ルール固有詳細が表示されること', () => {
    vi.mocked(lintWorkbook).mockReturnValue(buildResult(sampleFindings))
    render(<HealthCheckView doc={doc} />)

    // フィールド表示名（太字）
    expect(screen.getByText('Big Case')).toBeInTheDocument()
    // データソース名は複数箇所に出るため件数のみ確認
    expect(screen.getAllByText('Sample DS').length).toBeGreaterThan(0)
    // ルール固有詳細（deepIfChain.detail = 分岐数: 12）
    expect(screen.getByText('分岐数: 12')).toBeInTheDocument()
    // countd.detail = COUNTD の使用: 3 箇所
    expect(screen.getByText('COUNTD の使用: 3 箇所')).toBeInTheDocument()
  })

  it('カテゴリ見出しとルールタイトルが表示されること', () => {
    vi.mocked(lintWorkbook).mockReturnValue(buildResult(sampleFindings))
    render(<HealthCheckView doc={doc} />)

    // 指摘のあるカテゴリのみ表示
    expect(screen.getByText('パフォーマンス')).toBeInTheDocument()
    expect(screen.getByText('複雑度')).toBeInTheDocument()
    expect(screen.getByText('クリーンアップ')).toBeInTheDocument()
    // ルールタイトル
    expect(screen.getByText('長い条件分岐')).toBeInTheDocument()
    expect(screen.getByText('COUNTD の使用')).toBeInTheDocument()
  })

  it('指摘が0件のとき空状態カードが表示されること', () => {
    vi.mocked(lintWorkbook).mockReturnValue(buildResult([], { score: 100 }))
    render(<HealthCheckView doc={doc} />)

    expect(screen.getByText('問題は見つかりませんでした')).toBeInTheDocument()
    expect(
      screen.getByText(
        '検査したすべての計算フィールドがルールをパスしました。',
      ),
    ).toBeInTheDocument()
    // ルールセクションは描画されない
    expect(screen.queryByText('長い条件分岐')).not.toBeInTheDocument()
  })

  it('指摘行クリックで onOpenField が fieldId で呼ばれること', () => {
    vi.mocked(lintWorkbook).mockReturnValue(buildResult(sampleFindings))
    const onOpenField = vi.fn()
    render(<HealthCheckView doc={doc} onOpenField={onOpenField} />)

    const row = screen.getByText('Big Case').closest('button')
    expect(row).not.toBeNull()
    fireEvent.click(row!)
    // SideDrawer は normalizeFieldId(column) で解決するため fieldId を渡す
    expect(onOpenField).toHaveBeenCalledWith('big case')
  })

  it('ルールカードの折りたたみで指摘行が開閉すること', () => {
    vi.mocked(lintWorkbook).mockReturnValue(buildResult(sampleFindings))
    render(<HealthCheckView doc={doc} />)

    // 初期状態は展開（Big Case が見える）
    expect(screen.getByText('Big Case')).toBeInTheDocument()
    // ルールタイトルのトグルボタンをクリックして折りたたむ
    const toggle = screen.getByText('長い条件分岐').closest('button')
    fireEvent.click(toggle!)
    expect(screen.queryByText('Big Case')).not.toBeInTheDocument()
  })

  it('severity 別件数が表示されること', () => {
    vi.mocked(lintWorkbook).mockReturnValue(buildResult(sampleFindings))
    render(<HealthCheckView doc={doc} />)

    // warning 1 件 / info 2 件（ヘッダーのサマリー内で確認）
    const summary = screen.getByTestId('health-severity-summary')
    expect(
      within(summary).getByTestId('health-count-warning'),
    ).toHaveTextContent('1')
    expect(within(summary).getByTestId('health-count-info')).toHaveTextContent(
      '2',
    )
  })
})
