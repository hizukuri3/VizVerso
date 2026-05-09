import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { extractTwbFromTwbx } from './twbxParser'
import { parseTableauXml } from './xmlParser'

describe('Integration - twbx to XML Parsing', () => {
  it('実ファイル B2VB2026W8.twbx から設計情報を抽出できること', async () => {
    const filePath = resolve(__dirname, '../../tests/fixtures/B2VB2026W8.twbx')
    // eslint-disable-next-line security/detect-non-literal-fs-filename
    const buffer = readFileSync(filePath)
    // JSZipが確実に読めるように Uint8Array に変換して渡す
    const data = new Uint8Array(buffer)

    const xmlString = await extractTwbFromTwbx(data)
    expect(xmlString).toBeDefined()

    const documentInfo = parseTableauXml(xmlString)
    expect(documentInfo).toBeDefined()
    expect(documentInfo.worksheets.length).toBeGreaterThan(0)
  })
})
