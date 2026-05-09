import JSZip from 'jszip'

export interface TwbxParseOptions {
  maxSizeMB?: number
}

const DEFAULT_MAX_SIZE_MB = 100 // デフォルト100MBまで許容

/**
 * .twbxファイル（ZIPアーカイブ）から.twbファイル（XML）を抽出し、文字列として返す。
 * @param file ユーザーがアップロードした .twbx ファイル
 * @param options パース時のオプション（セキュリティ用のサイズ制限など）
 * @returns 抽出された .twb のXML文字列
 */
export async function extractTwbFromTwbx(
  file: File | Blob | ArrayBuffer | Uint8Array,
  options?: TwbxParseOptions,
): Promise<string> {
  const maxSizeMB = options?.maxSizeMB || DEFAULT_MAX_SIZE_MB
  const maxSizeBytes = maxSizeMB * 1024 * 1024

  // 入力を Uint8Array に統一
  let data: Uint8Array
  if (file instanceof Uint8Array) {
    data = file
  } else if (file instanceof ArrayBuffer) {
    data = new Uint8Array(file)
  } else {
    // File や Blob の場合
    data = new Uint8Array(await (file as Blob).arrayBuffer())
  }

  // ZIP シグネチャ (PK\x03\x04) のチェック
  const isZip = data[0] === 0x50 && data[1] === 0x4b

  if (!isZip) {
    // 非ZIP（生の .twb）として処理
    const decoder = new TextDecoder('utf-8')
    return decoder.decode(data)
  }

  const zip = new JSZip()
  await zip.loadAsync(data)

  // .twb ファイルを探す
  const twbFileName = Object.keys(zip.files).find((name) =>
    name.endsWith('.twb'),
  )

  if (!twbFileName) {
    throw new Error('The provided .twbx file does not contain a .twb workbook.')
  }

  const twbFile = zip.file(twbFileName)
  if (!twbFile) {
    throw new Error('The provided .twbx file does not contain a .twb workbook.')
  }

  // まず Uint8Array として展開し、正確なバイトサイズをチェックする（Zipボム対策）
  const uint8Array = await twbFile.async('uint8array')

  if (uint8Array.byteLength > maxSizeBytes) {
    throw new Error('File size limit exceeded. Potential Zip bomb detected.')
  }

  // UTF-8 文字列としてデコードして返す
  const decoder = new TextDecoder('utf-8')
  return decoder.decode(uint8Array)
}
