import { createElement } from 'react'
import { getMarkIcon } from '../utils/markVisual'

/**
 * マーク種別に対応するアイコンを描画する小コンポーネント。
 * 動的にアイコンを選ぶため createElement を用いる（レンダー中に
 * コンポーネントを再定義しないことで static-components ルールを満たす）。
 */
export default function MarkGlyph({
  kind,
  size,
  className,
}: {
  kind: string | undefined
  size?: number
  className?: string
}) {
  return createElement(getMarkIcon(kind), { size, className })
}
