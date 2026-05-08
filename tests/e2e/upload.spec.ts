import { test, expect } from '@playwright/test';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

test.describe('Tableau Workbook Analyzer - Comprehensive E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('正常系: twbxファイルをアップロードして解析結果が表示されること', async ({ page }) => {
    const filePath = resolve(__dirname, '../../tests/fixtures/sample.twbx');
    await page.setInputFiles('data-testid=file-input', filePath);

    // 解析結果の表示を待機
    await expect(page.locator('h3:has-text("解析結果")')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=ダッシュボード: 3')).toBeVisible();
    await expect(page.locator('.react-flow__renderer')).toBeVisible();
  });

  test('アクセシビリティ: キーボード操作 (Enter) でダイアログが反応すること', async ({ page }) => {
    // タブキーでフォーカスを移動
    await page.keyboard.press('Tab');
    
    // ファイルダイアログが開くのを待ち受ける
    const fileChooserPromise = page.waitForEvent('filechooser');
    
    // Enter キーを押下
    await page.keyboard.press('Enter');
    
    const fileChooser = await fileChooserPromise;
    expect(fileChooser).toBeDefined();
  });

  test('異常系: 破損したファイルをアップロードした際、エラーメッセージが表示されること', async ({ page }) => {
    // 偽の (破損した) zip ファイルを作成
    const filePath = resolve(__dirname, '../../tests/fixtures/corrupt.twbx');
    // (事前にテスト用ファイルを作成するか、ここで mock する)
    
    await page.setInputFiles('data-testid=file-input', filePath);

    // エラーメッセージが表示されることを確認 (見出しの部分一致で判定)
    await expect(page.locator('h3:has-text("エラーが発生しました")')).toBeVisible({ timeout: 15000 });
    
    // 詳細なエラーメッセージが含まれていることも確認 (JSZipのエラーの一部)
    await expect(page.locator('text=/zip/i')).toBeVisible();
  });

  test('UI状態: 解析中に読み込みインジケータが表示されること', async ({ page }) => {
    const filePath = resolve(__dirname, '../../tests/fixtures/sample.twbx');
    
    // アップロード開始
    await page.setInputFiles('data-testid=file-input', filePath);

    // 解析中（loading）の状態が表示されていることを確認
    await expect(page.locator('text=解析中...')).toBeVisible();
    
    // その後、結果が表示されること
    await expect(page.locator('h3:has-text("解析結果")')).toBeVisible({ timeout: 15000 });
  });
});
