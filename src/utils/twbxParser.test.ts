/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { extractTwbFromTwbx } from './twbxParser';

// テスト用のダミーファイルを作成するヘルパー
async function createDummyTwbxBlob(twbContent: string | null): Promise<File> {
  const zip = new JSZip();
  if (twbContent !== null) {
    zip.file('dummy_dashboard.twb', twbContent);
  }
  // twbxには画像ファイル等も含まれる想定
  zip.file('Image/logo.png', 'dummy image content');
  
  const blob = await zip.generateAsync({ type: 'blob' });
  return new File([blob], 'test.twbx', { type: 'application/zip' });
}

describe('twbxParser - extractTwbFromTwbx', () => {
  it('正常な.twbxファイルから.twbのXML文字列を抽出できること', async () => {
    const dummyXml = '<workbook><test>ダミーXML</test></workbook>';
    const file = await createDummyTwbxBlob(dummyXml);
    
    const result = await extractTwbFromTwbx(file);
    expect(result).toBe(dummyXml);
  });

  it('.twbファイルが一つも存在しない場合はエラーを投げること', async () => {
    const file = await createDummyTwbxBlob(null); // twbを含まない
    
    await expect(extractTwbFromTwbx(file)).rejects.toThrowError(
      'The provided .twbx file does not contain a .twb workbook.'
    );
  });

  it('Zipボム（解凍後サイズが大きすぎる場合）を検知してエラーを投げること', async () => {
    const zip = new JSZip();
    // 巨大なダミーファイルを作成（約10MBの文字列を突っ込んで圧縮）
    const hugeString = 'A'.repeat(10 * 1024 * 1024);
    zip.file('huge_dashboard.twb', hugeString);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    const file = new File([blob], 'bomb.twbx', { type: 'application/zip' });

    // 抽出時にサイズ制限（例：5MB）を超えたらエラーになる想定
    await expect(extractTwbFromTwbx(file, { maxSizeMB: 5 })).rejects.toThrowError(
      'File size limit exceeded. Potential Zip bomb detected.'
    );
  });
});
