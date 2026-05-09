export function formatFormulaText(
  rawFormula: string | undefined,
  fieldMeta: Map<string, { caption?: string }>,
) {
  if (!rawFormula) return undefined

  // 1. まず &amp; をデコード（二重エンコード対策）
  let decoded = rawFormula.replace(/&amp;/g, '&')

  // 2. 数値実体参照 (&#10;, &#13; 等) をすべて文字に変換
  decoded = decoded.replace(/&#(\d+);/g, (_: string, dec: string) => {
    const charCode = parseInt(dec, 10)
    if (charCode === 13) return '' // CRは除去
    return String.fromCharCode(charCode)
  })

  // 3. 16進数実体参照 (&#x0A; 等) をすべて文字に変換
  decoded = decoded.replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => {
    const charCode = parseInt(hex, 16)
    if (charCode === 13) return ''
    return String.fromCharCode(charCode)
  })

  // 4. その他の主要な実体参照
  decoded = decoded
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#9;/g, '\t')

  // 5. 物理名（[Calculation_...] など）を表示名に置換
  const getCaption = (fieldName: string) => {
    const clean = fieldName.replace(/^\[/, '').replace(/\]$/, '')
    const meta = fieldMeta.get(clean)
    if (meta?.caption) return meta.caption
    return clean
  }

  return decoded.replace(
    // eslint-disable-next-line security/detect-unsafe-regex
    /\[(?:([^\]]+)\]\.\[)?([^\]]+)\]/g,
    (_match, _dsName, fieldName) => {
      const caption = getCaption(fieldName)
      // すでに括弧で囲まれている場合はそのまま返し、そうでなければ [] で囲む
      const result =
        caption.startsWith('[') && caption.endsWith(']')
          ? caption
          : `[${caption}]`

      // パラメーター等の特殊なプレフィックスが必要な場合はここで調整可能
      return result
    },
  )
}
