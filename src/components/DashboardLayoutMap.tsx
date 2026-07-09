import React, { useState } from 'react'
import {
  FileBarChart,
  Type,
  SlidersHorizontal,
  Image as ImageIcon,
  List,
  Filter,
  Square,
} from 'lucide-react'
import type { DashboardZone, TableauDocument } from '../types/tableau'
import { t, tMark, type TKey } from '../utils/i18n'
import { getWorksheetMarkKind, getMarkIcon } from '../utils/markVisual'
import { normalizeFieldId } from '../utils/xmlParser'

// ホバー中の zone とその位置（ツールチップ描画用）
interface HoverState {
  zone: DashboardZone
  rect: DOMRect
}

interface DashboardLayoutMapProps {
  zones: DashboardZone[]
  doc: TableauDocument
  onNavigate?: (type: 'worksheet', id: string) => void
}

// zone 種別ごとの見た目定義（色・アイコン・i18nラベルキー）
const KIND_STYLE: Record<
  DashboardZone['kind'],
  {
    labelKey: TKey
    icon: React.ComponentType<{ size?: number; className?: string }>
    box: string // 枠・背景
    text: string // ラベル文字色
    z: number // 重ね順（背景要素を下、コンテンツを上に）
  }
> = {
  worksheet: {
    labelKey: 'detail.zone_worksheet',
    icon: FileBarChart,
    box: 'border-emerald-400 bg-emerald-50/80',
    text: 'text-emerald-700',
    z: 20,
  },
  paramctrl: {
    labelKey: 'detail.zone_paramctrl',
    icon: SlidersHorizontal,
    box: 'border-amber-300 bg-amber-50/80',
    text: 'text-amber-700',
    z: 20,
  },
  image: {
    labelKey: 'detail.zone_image',
    icon: ImageIcon,
    box: 'border-violet-300 bg-violet-50/80',
    text: 'text-violet-700',
    z: 20,
  },
  legend: {
    labelKey: 'detail.zone_legend',
    icon: List,
    box: 'border-sky-300 bg-sky-50/80',
    text: 'text-sky-700',
    z: 20,
  },
  filter: {
    labelKey: 'detail.zone_filter',
    icon: Filter,
    box: 'border-cyan-300 bg-cyan-50/80',
    text: 'text-cyan-700',
    z: 20,
  },
  text: {
    labelKey: 'detail.zone_text',
    icon: Type,
    box: 'border-slate-200 border-dashed bg-slate-50/40',
    text: 'text-slate-400',
    z: 10,
  },
  other: {
    labelKey: 'detail.zone_other',
    icon: Square,
    box: 'border-slate-200 bg-slate-50/40',
    text: 'text-slate-400',
    z: 10,
  },
}

// 正規化座標（0-100000）を CSS の % 文字列に変換する
const pct = (v: number) => `${v / 1000}%`

export default function DashboardLayoutMap({
  zones,
  doc,
  onNavigate,
}: DashboardLayoutMapProps) {
  const [hover, setHover] = useState<HoverState | null>(null)

  if (!zones || zones.length === 0) {
    return (
      <p className="text-sm text-slate-400 italic">
        {t('detail.layout_empty')}
      </p>
    )
  }

  const resolveWorksheet = (name?: string) =>
    name ? doc.worksheets.find((w) => w.name === name) : undefined

  const resolveDatasourceCaption = (name: string) =>
    doc.datasources.find((d) => d.name === name)?.caption || name

  // パラメーターコントロールが参照するパラメーター定義を探す
  const resolveParamField = (paramRef?: string) => {
    if (!paramRef) return undefined
    const id = normalizeFieldId(paramRef)
    for (const ds of doc.datasources) {
      const f = ds.fields.find((x) => x.column === id || x.caption === id)
      if (f) return f
    }
    return undefined
  }

  // Tableau のリテラル値（"East" や #2016-01-01#）から表示用の囲み文字を除く
  const cleanParamValue = (v?: string | number) =>
    v === undefined || v === null ? '' : String(v).replace(/^["#]+|["#]+$/g, '')

  // ツールチップに出す意味のある内容があるか（区切り線等は出さない＝ビジー回避）
  const zoneHasTip = (zone: DashboardZone) =>
    zone.kind === 'worksheet' || Boolean(zone.title) || Boolean(zone.param)

  const handleEnter = (
    e: React.MouseEvent | React.FocusEvent,
    zone: DashboardZone,
  ) => {
    if (!zoneHasTip(zone)) return
    setHover({
      zone,
      rect: (e.currentTarget as HTMLElement).getBoundingClientRect(),
    })
  }
  const handleLeave = () => setHover(null)

  // ツールチップ本文（情報は最小限に絞ってビジーにしない）
  const tooltipBody = (zone: DashboardZone) => {
    if (zone.kind === 'worksheet') {
      const ws = resolveWorksheet(zone.name)
      const kind = ws ? getWorksheetMarkKind(ws) : 'automatic'
      const Icon = getMarkIcon(kind)
      const dsList = ws?.datasourceNames
        ?.map(resolveDatasourceCaption)
        .join(', ')
      const cols = ws?.shelf?.cols?.length ?? 0
      const rows = ws?.shelf?.rows?.length ?? 0
      const filters = ws?.shelf?.filters?.length ?? 0
      return (
        <>
          <div className="font-bold text-slate-800 flex items-center gap-1.5">
            <Icon size={13} className="text-emerald-600 shrink-0" />
            <span className="truncate">{ws?.caption || zone.name}</span>
          </div>
          <div className="mt-1 space-y-0.5">
            <div className="text-slate-500">
              {t('detail.mark_type')}:{' '}
              <span className="text-slate-700 font-medium">{tMark(kind)}</span>
            </div>
            {dsList && (
              <div className="text-slate-500 truncate">
                {t('nav.datasources')}:{' '}
                <span className="text-slate-700 font-medium">{dsList}</span>
              </div>
            )}
            <div className="text-slate-400">
              {t('detail.columns')} {cols} ・ {t('detail.rows')} {rows} ・{' '}
              {t('detail.filters')} {filters}
            </div>
          </div>
          {onNavigate && (
            <div className="mt-1.5 text-emerald-600 font-semibold">
              {t('button.view_detail')}
            </div>
          )}
        </>
      )
    }

    // パラメーターコントロール: 現在値・選択肢/範囲などの中身を表示する
    if (zone.kind === 'paramctrl') {
      const pf = resolveParamField(zone.param)
      const Icon = KIND_STYLE.paramctrl.icon
      const current = cleanParamValue(pf?.value)
      const members = pf?.paramMembers ?? []
      const shown = members
        .slice(0, 6)
        .map((m) => cleanParamValue(m.alias || m.value))
      const more = members.length - shown.length
      const heading = zone.title || pf?.caption || normalizeFieldId(zone.param)
      return (
        <>
          <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wide flex items-center gap-1.5">
            <Icon size={12} /> {t('detail.zone_paramctrl')}
          </div>
          <div className="mt-0.5 font-bold text-slate-800 break-words">
            {heading}
          </div>
          {pf?.caption && pf.caption !== heading && (
            <div className="text-slate-400 break-words">{pf.caption}</div>
          )}
          {current && (
            <div className="mt-1 text-slate-500">
              {t('detail.current_value')}:{' '}
              <span className="text-slate-700 font-medium">{current}</span>
            </div>
          )}
          {pf?.paramDomainType === 'list' && shown.length > 0 && (
            <div className="mt-0.5 text-slate-500 break-words">
              {t('detail.choices')}:{' '}
              <span className="text-slate-700">
                {shown.join(', ')}
                {more > 0 ? ` +${more}` : ''}
              </span>
            </div>
          )}
          {pf?.paramDomainType === 'range' && pf.paramRange && (
            <div className="mt-0.5 text-slate-500">
              {t('detail.range')}:{' '}
              <span className="text-slate-700">
                {cleanParamValue(pf.paramRange.min)} –{' '}
                {cleanParamValue(pf.paramRange.max)}
              </span>
            </div>
          )}
        </>
      )
    }

    const style = KIND_STYLE[zone.kind]
    const Icon = style.icon
    return (
      <>
        <div className="font-semibold text-slate-400 text-[10px] uppercase tracking-wide flex items-center gap-1.5">
          <Icon size={12} /> {t(style.labelKey)}
        </div>
        {zone.title && (
          <div className="mt-0.5 text-slate-700 whitespace-pre-wrap break-words">
            {zone.title}
          </div>
        )}
        {/* フィルターは対象フィールド、画像はファイル名を補足表示 */}
        {zone.kind === 'filter' && zone.param && (
          <div className="mt-0.5 text-slate-500 break-words">
            {normalizeFieldId(zone.param)}
          </div>
        )}
        {zone.kind === 'image' && zone.param && (
          <div className="mt-0.5 text-slate-400 break-all">{zone.param}</div>
        )}
      </>
    )
  }

  // 浮動情報（Z軸の奥行き）を持つかどうか。持たない旧データは従来の
  // 種別ベースの重ね順にフォールバックする。
  const hasDepth = zones.some((z) => z.floating !== undefined)

  // 浮動 zone をドキュメント順（zOrder 昇順）で並べ、重なりランクを付ける。
  // ランクが大きいほど手前（Z軸で上）で、影を強めて浮き上がりを表現する。
  const floatOrders = zones
    .filter((z) => z.floating)
    .map((z) => z.zOrder ?? 0)
    .sort((a, b) => a - b)
  const floatRankByOrder = new Map(floatOrders.map((o, i) => [o, i]))
  const floatCount = floatOrders.length

  // zone の重ね順（zIndex）。tiled は下層、floating はランク順に上へ積む。
  const zIndexOf = (zone: DashboardZone): number => {
    if (!hasDepth) return KIND_STYLE[zone.kind].z
    if (zone.floating) {
      const rank = floatRankByOrder.get(zone.zOrder ?? 0) ?? 0
      return 30 + rank
    }
    // tiled（レイアウト内）は種別の背景/前景関係のみ保つ
    return KIND_STYLE[zone.kind].z <= 10 ? 1 : 5
  }

  // 浮動オブジェクトの奥行き感を影で表現する（手前ほど強い影）。
  const depthShadow = (zone: DashboardZone): string => {
    if (!hasDepth || !zone.floating) return ''
    const rank = floatRankByOrder.get(zone.zOrder ?? 0) ?? 0
    const ratio = floatCount > 1 ? rank / (floatCount - 1) : 1
    if (ratio >= 0.66) return 'shadow-lg ring-1 ring-black/5'
    if (ratio >= 0.33) return 'shadow-md ring-1 ring-black/5'
    return 'shadow-sm ring-1 ring-black/5'
  }

  // 背景（tiled・テキスト等）を先に、浮動を後に描画するため z 昇順で並べる
  const ordered = [...zones].sort((a, b) => zIndexOf(a) - zIndexOf(b))

  // 描画対象に含まれる種別だけ凡例に出す
  const presentKinds = Array.from(new Set(zones.map((z) => z.kind)))

  return (
    <div>
      {/* 狭い画面ではマップを縮めず、最小幅を保って横スクロールさせる
          （潰れ防止）。min-w と aspect 比で読みやすいサイズを維持する。 */}
      <div className="overflow-x-auto overflow-y-hidden -mx-1 px-1 pb-1">
        {/* 外枠（パディングで内側を確保）＋ 内側の相対座標キャンバス。
            zone は絶対配置なので、内側キャンバスをパディング分だけ縮めて
            端の zone が枠に接して見切れないようにする。 */}
        <div className="w-full min-w-[640px] aspect-[3/2] rounded-2xl border border-slate-200 bg-slate-100/50 overflow-hidden shadow-inner p-2.5 sm:p-4">
          <div className="relative w-full h-full">
            {ordered.map((zone, i) => {
              const style = KIND_STYLE[zone.kind]
              const isWorksheet =
                zone.kind === 'worksheet' && Boolean(zone.name)
              const ws = isWorksheet ? resolveWorksheet(zone.name) : undefined
              // ワークシートはマーク種別のアイコンで種類を示す
              const Icon = ws
                ? getMarkIcon(getWorksheetMarkKind(ws))
                : style.icon
              const caption = isWorksheet
                ? ws?.caption || zone.name
                : zone.title
              const label = caption || t(style.labelKey)
              // ツールチップにはマーク種別も添える（例: 全米マップ ・ マップ）
              const tooltip =
                isWorksheet && ws
                  ? `${label} ・ ${tMark(getWorksheetMarkKind(ws))}`
                  : label

              // 極小 zone（区切り線・薄いバンド等）はラベルを描画すると潰れて
              // 重なるため、一定サイズ未満はラベルを省き色ブロックのみにする。
              // 最小マップ（幅640px・高さ約427px）基準の正規化しきい値。
              // またタイトルの無い背景テキスト帯は、前面のテキストと文字が
              // 重なる原因になるためラベル自体を出さない。
              const isBackgroundBand =
                (zone.kind === 'text' || zone.kind === 'other') && !zone.title
              const showLabel =
                !isBackgroundBand && zone.w >= 5200 && zone.h >= 2800

              // 浮動オブジェクトは影＋リングで「浮き上がり」を、tiled は影なしで
              // 基盤レイヤーであることを表現する（Z軸の奥行き表現）。
              const floatClass = zone.floating ? depthShadow(zone) : ''
              const commonClass = `absolute overflow-hidden rounded-md border ${style.box} ${floatClass} transition-all`
              const positionStyle: React.CSSProperties = {
                left: pct(zone.x),
                top: pct(zone.y),
                width: pct(zone.w),
                height: pct(zone.h),
                zIndex: zIndexOf(zone),
              }

              const inner = showLabel ? (
                <span
                  className={`flex items-start gap-1 p-1 text-[10px] font-semibold leading-tight ${style.text}`}
                >
                  <Icon size={11} className="shrink-0 mt-px" />
                  <span className="truncate">{label}</span>
                </span>
              ) : null

              if (isWorksheet && onNavigate) {
                return (
                  <button
                    key={`${zone.id ?? i}`}
                    type="button"
                    aria-label={tooltip}
                    onClick={() => onNavigate('worksheet', zone.name as string)}
                    onMouseEnter={(e) => handleEnter(e, zone)}
                    onMouseLeave={handleLeave}
                    onFocus={(e) => handleEnter(e, zone)}
                    onBlur={handleLeave}
                    className={`${commonClass} text-left cursor-pointer hover:bg-emerald-100 hover:border-emerald-500 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-emerald-400 active:scale-[0.98]`}
                    style={positionStyle}
                  >
                    {inner}
                  </button>
                )
              }

              return (
                <div
                  key={`${zone.id ?? i}`}
                  className={commonClass}
                  style={positionStyle}
                  onMouseEnter={(e) => handleEnter(e, zone)}
                  onMouseLeave={handleLeave}
                >
                  {inner}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* 凡例 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {presentKinds.map((kind) => {
          // kind は DashboardZone['kind'] のユニオン型で安全
          // eslint-disable-next-line security/detect-object-injection
          const style = KIND_STYLE[kind]
          const Icon = style.icon
          return (
            <span
              key={kind}
              className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${style.text}`}
            >
              <span
                className={`inline-block w-3 h-3 rounded-sm border ${style.box}`}
              />
              <Icon size={12} />
              {t(style.labelKey)}
            </span>
          )
        })}
      </div>

      {/* ホバー時のツールチップ（zone の上に落ち着いて表示。カーソル追従なし） */}
      {hover &&
        (() => {
          const r = hover.rect
          const above = r.top > 150
          const tipStyle: React.CSSProperties = {
            position: 'fixed',
            left: Math.min(
              Math.max(r.left + r.width / 2, 100),
              window.innerWidth - 100,
            ),
            top: above ? r.top - 8 : r.bottom + 8,
            transform: above ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
            zIndex: 60,
          }
          return (
            <div
              role="tooltip"
              style={tipStyle}
              className="pointer-events-none max-w-[260px] rounded-lg border border-slate-200 bg-white shadow-xl px-3 py-2 text-[11px] leading-snug animate-in fade-in zoom-in-95 duration-100"
            >
              {tooltipBody(hover.zone)}
            </div>
          )
        })()}
    </div>
  )
}
