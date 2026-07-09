import {
  Sparkles,
  BarChart3,
  LineChart,
  AreaChart,
  Square,
  Circle,
  Shapes,
  Type,
  Map as MapIcon,
  PieChart,
  Hexagon,
  LayoutGrid,
  CalendarRange,
} from 'lucide-react'
import type { TableauWorksheet } from '../types/tableau'

export type MarkIcon = React.ComponentType<{
  size?: number
  className?: string
}>

// tMark と共有する正準マーク種別キー（locales の mark.* に対応）
export type MarkKind =
  | 'automatic'
  | 'bar'
  | 'line'
  | 'area'
  | 'square'
  | 'circle'
  | 'shape'
  | 'text'
  | 'map'
  | 'pie'
  | 'gantt'
  | 'polygon'
  | 'density'

const ICON_BY_KIND: Record<MarkKind, MarkIcon> = {
  automatic: Sparkles,
  bar: BarChart3,
  line: LineChart,
  area: AreaChart,
  square: Square,
  circle: Circle,
  shape: Shapes,
  text: Type,
  map: MapIcon,
  pie: PieChart,
  gantt: CalendarRange,
  polygon: Hexagon,
  density: LayoutGrid,
}

/**
 * Tableau の mark class（大文字始まり・表記ゆれあり）を正準キーに正規化する。
 * 例: 'Automatic' → 'automatic'、'Multipolygon' → 'map'、'Gantt Bar' → 'gantt'
 */
export function normalizeMarkKind(rawClass: string | undefined): MarkKind {
  const c = (rawClass || 'automatic').toLowerCase().trim()
  if (!c || c === 'automatic') return 'automatic'
  // 地理系（マップ）はまとめて map 扱い
  if (c.includes('multipolygon') || c === 'map') return 'map'
  if (c.includes('polygon')) return 'polygon'
  if (c.includes('gantt')) return 'gantt'
  if (c.includes('line')) return 'line'
  if (c.includes('area')) return 'area'
  if (c.includes('bar')) return 'bar'
  if (c.includes('pie')) return 'pie'
  if (c.includes('circle')) return 'circle'
  if (c.includes('square')) return 'square'
  if (c.includes('shape')) return 'shape'
  if (c.includes('text')) return 'text'
  if (c.includes('density') || c.includes('heatmap')) return 'density'
  return 'automatic'
}

/**
 * 正準マーク種別に対応するアイコンを返す。
 * ラベルは呼び出し側で tMark(kind) を用いる。
 */
export function getMarkIcon(rawClass: string | undefined): MarkIcon {
  return ICON_BY_KIND[normalizeMarkKind(rawClass)]
}

/**
 * ワークシートの代表的なマーク種別を推定する。
 * 複数ペイン（レイヤー）を持つ場合、地理レイヤーがあれば map を優先する。
 * それ以外はメインペインの mark class を採用する。
 */
export function getWorksheetMarkKind(ws: TableauWorksheet): MarkKind {
  const panes = ws.shelf?.panes ?? []
  const paneKinds = panes.map((p) => normalizeMarkKind(p.markType))
  if (paneKinds.some((k) => k === 'map' || k === 'polygon')) return 'map'
  const main = ws.shelf?.marks?.markType
  const mainKind = normalizeMarkKind(main)
  if (mainKind !== 'automatic') return mainKind
  // メインが automatic でも、明示的な種別を持つペインがあれば採用
  const explicit = paneKinds.find((k) => k !== 'automatic')
  return explicit ?? 'automatic'
}
