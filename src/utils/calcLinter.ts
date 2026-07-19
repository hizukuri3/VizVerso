import type { TableauDocument, TableauField } from '../types/tableau'
import { normalizeFieldId } from './xmlParser'
import { classifyFormula } from './calcClassifier'
import { buildFieldMap, extractFieldRefs } from './dependencyTree'
import { analyzeFieldUsage } from './usageAnalyzer'

/**
 * 計算フィールドのリント（ヘルスチェック）。
 * ワークブック内の計算フィールドをパフォーマンス・複雑度・クリーンアップの
 * 観点で静的検査し、ルール別の指摘一覧とヘルススコアを返す（純粋関数）。
 * ルールIDは UI 側で i18n キー `health.rule.<ruleId>.*` として解決される。
 */

export type LintRuleId =
  | 'nestedLod' // LOD式の入れ子
  | 'countd' // COUNTD の使用
  | 'heavyStringCalc' // 行レベルの重い文字列関数
  | 'deepIfChain' // 長い IF/ELSEIF・CASE 分岐
  | 'deepDependency' // 深い依存チェーン
  | 'duplicateFormula' // 重複した計算式
  | 'unusedCalc' // 未使用の計算フィールド
  | 'unusedParam' // 未使用のパラメータ

export type LintSeverity = 'warning' | 'info'
export type LintCategory = 'performance' | 'complexity' | 'cleanup'

/** リント指摘1件。 */
export interface LintFinding {
  ruleId: LintRuleId
  severity: LintSeverity
  category: LintCategory
  /** 正規化フィールドID（normalizeFieldId 済み） */
  fieldId: string
  /** 表示名（caption 優先、なければブラケット除去した column） */
  caption: string
  /** 所属データソース名（判明している場合） */
  datasourceName?: string
  /** 対象の計算式（あれば。詳細表示・ドロワー誘導用） */
  formula?: string
  /** i18n の詳細文 `health.rule.<ruleId>.detail` へ差し込むルール固有パラメータ */
  params?: Record<string, string | number>
}

/** ルール1件分の集計（0件のルールも含む）。 */
export interface LintRuleSummary {
  ruleId: LintRuleId
  severity: LintSeverity
  category: LintCategory
  count: number
}

export interface LintResult {
  /** 全指摘（RULE_ORDER のルール順 → フィールド表示名順） */
  findings: LintFinding[]
  /** ルールごとの集計（RULE_ORDER の固定順、0件も含む） */
  rules: LintRuleSummary[]
  /** 検査対象になった計算フィールド数（パラメータ除く） */
  calcFieldCount: number
  /** 100点満点のヘルススコア（warning×5 / info×2 の減点、下限0） */
  score: number
}

/** ルールの表示順と属性（カテゴリ内はパフォーマンス → 複雑度 → クリーンアップ）。 */
export const RULE_ORDER: readonly LintRuleSummary[] = [
  {
    ruleId: 'nestedLod',
    severity: 'warning',
    category: 'performance',
    count: 0,
  },
  { ruleId: 'countd', severity: 'info', category: 'performance', count: 0 },
  {
    ruleId: 'heavyStringCalc',
    severity: 'info',
    category: 'performance',
    count: 0,
  },
  {
    ruleId: 'deepIfChain',
    severity: 'warning',
    category: 'complexity',
    count: 0,
  },
  {
    ruleId: 'deepDependency',
    severity: 'info',
    category: 'complexity',
    count: 0,
  },
  {
    ruleId: 'duplicateFormula',
    severity: 'warning',
    category: 'cleanup',
    count: 0,
  },
  { ruleId: 'unusedCalc', severity: 'info', category: 'cleanup', count: 0 },
  { ruleId: 'unusedParam', severity: 'info', category: 'cleanup', count: 0 },
] as const

// ルールID → severity/category の逆引き（findings 生成時に属性を引く）。
const RULE_META = new Map(RULE_ORDER.map((r) => [r.ruleId, r]))

/**
 * 判定前に文字列リテラル・コメント・フィールド参照を除去する。
 * calcClassifier.stripNoise と同方針（"COUNTD(" のような文字列リテラルや
 * [ELSEIF] のようなフィールド名での誤検知を防ぐ）。各正規表現は入れ子量指定子を
 * 持たず後方参照も無いため ReDoS の危険はない。
 */
function stripNoise(formula: string): string {
  return (
    formula
      // ブロックコメント /* ... */
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      // 行コメント // ...
      .replace(/\/\/[^\n]*/g, ' ')
      // 文字列リテラル（ダブル/シングルクォート）
      .replace(/"[^"]*"/g, ' ')
      .replace(/'[^']*'/g, ' ')
      // フィールド参照 [ ... ]
      .replace(/\[[^\]]*\]/g, ' ')
  )
}

/** 表示名: caption 優先、なければ column の前後ブラケットを除去したもの。 */
function displayCaption(f: TableauField): string {
  if (f.caption) return f.caption
  // 前後のブラケットのみ除去（[Field] → Field）
  return (f.column ?? '').replace(/^\[+/, '').replace(/\]+$/, '').trim()
}

// heavyStringCalc 対象の重い文字列関数（呼び出し形式で判定）。
const HEAVY_STRING_FNS = [
  'CONTAINS',
  'FIND',
  'FINDNTH',
  'STARTSWITH',
  'ENDSWITH',
  'REGEXP_MATCH',
  'REGEXP_EXTRACT',
  'REGEXP_EXTRACT_NTH',
  'REGEXP_REPLACE',
  'SPLIT',
] as const

// 関数ごとの検出正規表現を事前構築する。`\bFN\s*\(` 形式で呼び出しのみ判定するため
// FINDNTH を FIND と、REGEXP_EXTRACT_NTH を REGEXP_EXTRACT と混同しない。
const HEAVY_STRING_RES: { name: string; re: RegExp }[] = HEAVY_STRING_FNS.map(
  (fn) => ({
    name: fn,
    // モジュール内の定数配列のみから構築するため外部入力は混入しない
    // eslint-disable-next-line security/detect-non-literal-regexp
    re: new RegExp(`\\b${fn}\\s*\\(`, 'i'),
  }),
)

// COUNTD / ELSEIF / WHEN の出現数カウント用（ノイズ除去後の文字列に適用）。
const COUNTD_RE = /\bCOUNTD\s*\(/gi
const ELSEIF_RE = /\bELSEIF\b/gi
const WHEN_RE = /\bWHEN\b/gi

/**
 * LOD式の入れ子の最大深さを求める。
 * ノイズ除去後の文字列をブレース単位で走査し、LOD開始（`{ FIXED|INCLUDE|EXCLUDE`、
 * 大文字小文字・空白許容）のブレースだけを数える。トップレベルLOD=1、
 * LODブロック内に別のLODがあれば2以上になる。
 */
function maxLodNesting(clean: string): number {
  const stack: boolean[] = [] // 各開きブレースが LOD 由来かどうか
  let lodDepth = 0
  let maxDepth = 0
  for (let i = 0; i < clean.length; i++) {
    const ch = clean.charAt(i)
    if (ch === '{') {
      // `{` の直後（空白許容）が LOD キーワードかを判定する。アンカー付きで
      // 単純な選択のみのため ReDoS の危険はない。
      const isLod = /^\s*(?:FIXED|INCLUDE|EXCLUDE)\b/i.test(clean.slice(i + 1))
      stack.push(isLod)
      if (isLod) {
        lodDepth++
        if (lodDepth > maxDepth) maxDepth = lodDepth
      }
    } else if (ch === '}') {
      if (stack.pop()) lodDepth--
    }
  }
  return maxDepth
}

/**
 * ワークブック全体の計算フィールドをリントする（純粋関数）。
 * buildFieldMap 相当で集めた全フィールドのうち計算フィールド（isCalc && formula）を
 * 対象に各ルールを適用し、RULE_ORDER 順の findings とヘルススコアを返す。
 */
export function lintWorkbook(doc: TableauDocument): LintResult {
  const fieldMap = buildFieldMap(doc)

  // パラメータ判定用の集合と、フィールドID → 所属データソース名のマップ。
  const paramIds = new Set<string>()
  const dsNameById = new Map<string, string>()
  doc.datasources.forEach((ds) => {
    ds.fields.forEach((f) => {
      const id = normalizeFieldId(f.column)
      if (!id) return
      // buildFieldMap と同じく後勝ちで所属データソースを記録する
      dsNameById.set(id, f.datasourceName ?? ds.name)
      if (ds.name === 'Parameters' || f.datasourceName === 'Parameters') {
        paramIds.add(id)
      }
    })
  })

  // 検査対象の計算フィールド（パラメータ除く）。
  const calcFields: { id: string; field: TableauField }[] = []
  fieldMap.forEach((field, id) => {
    if (field.isCalc && field.formula && !paramIds.has(id)) {
      calcFields.push({ id, field })
    }
  })

  // ルールID → findings（フィールド表示名でソートは最後にまとめて行う）。
  const byRule = new Map<LintRuleId, LintFinding[]>()
  const emit = (
    ruleId: LintRuleId,
    id: string,
    field: TableauField,
    params?: Record<string, string | number>,
  ): void => {
    const meta = RULE_META.get(ruleId)!
    const finding: LintFinding = {
      ruleId,
      severity: meta.severity,
      category: meta.category,
      fieldId: id,
      caption: displayCaption(field),
    }
    const dsName = field.datasourceName ?? dsNameById.get(id)
    if (dsName) finding.datasourceName = dsName
    if (field.formula) finding.formula = field.formula
    if (params) finding.params = params
    const list = byRule.get(ruleId)
    if (list) list.push(finding)
    else byRule.set(ruleId, [finding])
  }

  // --- 計算式系ルール（各計算フィールドを走査） ---
  for (const { id, field } of calcFields) {
    const formula = field.formula!
    const clean = stripNoise(formula)
    const calcType = classifyFormula(formula)

    // 1. nestedLod: LODの入れ子
    const lodDepth = maxLodNesting(clean)
    if (lodDepth >= 2) emit('nestedLod', id, field, { depth: lodDepth })

    // 2. countd: COUNTD の使用
    const countdCount = (clean.match(COUNTD_RE) || []).length
    if (countdCount > 0) emit('countd', id, field, { count: countdCount })

    // 3. heavyStringCalc: 行レベル（regular）の重い文字列関数
    if (calcType === 'regular') {
      const detected = HEAVY_STRING_RES.filter(({ re }) => re.test(clean)).map(
        ({ name }) => name,
      )
      if (detected.length > 0) {
        emit('heavyStringCalc', id, field, { functions: detected.join(', ') })
      }
    }

    // 4. deepIfChain: 長い ELSEIF / WHEN 分岐
    const elseifCount = (clean.match(ELSEIF_RE) || []).length
    const whenCount = (clean.match(WHEN_RE) || []).length
    if (elseifCount >= 5 || whenCount >= 10) {
      emit('deepIfChain', id, field, {
        count: Math.max(elseifCount, whenCount),
      })
    }
  }

  // 5. deepDependency: 計算フィールド間の上流依存深さ（calc→calc のエッジ数）
  const depthMemo = new Map<string, number>()
  const calcDepth = (id: string, stack: Set<string>): number => {
    const cached = depthMemo.get(id)
    if (cached !== undefined) return cached
    if (stack.has(id)) return 0 // 循環は打ち切り（深さに数えない）
    const field = fieldMap.get(id)
    if (!field?.isCalc || !field.formula) return 0
    stack.add(id)
    let max = 0
    for (const ref of extractFieldRefs(field.formula, id)) {
      const rf = fieldMap.get(ref)
      // 非計算フィールドへの参照は深さに数えない（calc の鎖のみ辿る）
      if (rf?.isCalc && rf.formula) {
        const d = 1 + calcDepth(ref, stack)
        if (d > max) max = d
      }
    }
    stack.delete(id)
    depthMemo.set(id, max)
    return max
  }
  for (const { id, field } of calcFields) {
    const depth = calcDepth(id, new Set())
    if (depth >= 5) emit('deepDependency', id, field, { depth })
  }

  // 6. duplicateFormula: 空白正規化した同一式（10文字以上）が2件以上
  const dupGroups = new Map<string, { id: string; field: TableauField }[]>()
  for (const entry of calcFields) {
    const norm = entry.field.formula!.replace(/\s+/g, ' ').trim()
    if (norm.length < 10) continue
    const group = dupGroups.get(norm)
    if (group) group.push(entry)
    else dupGroups.set(norm, [entry])
  }
  dupGroups.forEach((group) => {
    if (group.length < 2) return
    for (const { id, field } of group) {
      const others = group
        .filter((g) => g.id !== id)
        .map((g) => displayCaption(g.field))
        .sort((a, b) => a.localeCompare(b))
      emit('duplicateFormula', id, field, {
        others: others.join(', '),
        count: group.length,
      })
    }
  })

  // 7 / 8. unusedCalc / unusedParam: 使用状況解析の未使用フィールドを振り分ける
  const { unusedFields } = analyzeFieldUsage(doc)
  for (const id of unusedFields) {
    const field = fieldMap.get(id)
    if (!field) continue
    if (paramIds.has(id)) {
      emit('unusedParam', id, field)
    } else if (field.isCalc && field.formula) {
      emit('unusedCalc', id, field)
    }
  }

  // --- findings の組み立て: RULE_ORDER 順 → 同一ルール内は表示名昇順 ---
  const findings: LintFinding[] = []
  for (const rule of RULE_ORDER) {
    const list = byRule.get(rule.ruleId)
    if (!list) continue
    list.sort((a, b) => a.caption.localeCompare(b.caption))
    findings.push(...list)
  }

  // --- 集計・スコア ---
  const rules = RULE_ORDER.map((r) => ({
    ...r,
    count: byRule.get(r.ruleId)?.length ?? 0,
  }))
  let warning = 0
  let info = 0
  for (const f of findings) {
    if (f.severity === 'warning') warning++
    else info++
  }
  const score = Math.max(0, 100 - (warning * 5 + info * 2))

  return { findings, rules, calcFieldCount: calcFields.length, score }
}
