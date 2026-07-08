/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import DragDropZone from './DragDropZone'
import '@testing-library/jest-dom' // 念のためインポート

describe('DragDropZone', () => {
  it('ファイルをドロップした時に onFileDrop が呼ばれること', () => {
    const mockOnFileDrop = vi.fn()
    render(<DragDropZone onFileDrop={mockOnFileDrop} />)

    // a11y要件: ドロップゾーンはフォーカス可能なボタン要素等であるべき
    const dropzone = screen.getByRole('button', { name: /アップロード/i })

    const file = new File(['dummy content'], 'test.twbx', {
      type: 'application/zip',
    })

    // onDropイベントを発火
    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    })

    expect(mockOnFileDrop).toHaveBeenCalledWith(file)
  })

  it('ドラッグオーバー時に視覚的なフィードバック（スタイル変化）があること', async () => {
    render(<DragDropZone onFileDrop={vi.fn()} />)
    const dropzone = screen.getByRole('button')

    fireEvent.dragOver(dropzone)
    // ドラッグ中のクラス（border-blue-500等）が含まれているか確認
    expect(dropzone.className).toContain('border-blue-500')

    fireEvent.dragLeave(dropzone)
    expect(dropzone.className).not.toContain('border-blue-500')
  })

  it('アクセシビリティ属性（aria-label等）が正しく設定されていること', () => {
    render(<DragDropZone onFileDrop={vi.fn()} />)
    const dropzone = screen.getByRole('button')
    expect(dropzone).toHaveAttribute('aria-label', 'アップロード')
    expect(dropzone).toHaveAttribute('tabIndex', '0')
  })

  it('クリック（またはタップ）してファイルを選択した時に onFileDrop が呼ばれること', async () => {
    const mockOnFileDrop = vi.fn()
    render(<DragDropZone onFileDrop={mockOnFileDrop} />)

    const input = screen.getByTestId('file-input')
    const file = new File(['dummy content'], 'test.twbx', {
      type: 'application/zip',
    })

    // ファイル選択イベントをシミュレート
    fireEvent.change(input, {
      target: { files: [file] },
    })

    expect(mockOnFileDrop).toHaveBeenCalledWith(file)
  })

  it('.twbx または .twb 以外のファイルは弾かれること', () => {
    const mockOnFileDrop = vi.fn()
    render(<DragDropZone onFileDrop={mockOnFileDrop} />)

    const dropzone = screen.getByRole('button', { name: /アップロード/i })

    // 画像ファイルをドロップ
    const file = new File(['image'], 'test.png', { type: 'image/png' })

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [file],
      },
    })

    // 呼ばれないことを確認
    expect(mockOnFileDrop).not.toHaveBeenCalled()
  })

  it('Enterキー押下でファイル選択用の input がクリックされること', () => {
    render(<DragDropZone onFileDrop={vi.fn()} />)
    const dropzone = screen.getByRole('button', { name: /アップロード/i })
    const input = screen.getByTestId('file-input') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    fireEvent.keyDown(dropzone, { key: 'Enter' })

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('スペースキー押下でもファイル選択用の input がクリックされること', () => {
    render(<DragDropZone onFileDrop={vi.fn()} />)
    const dropzone = screen.getByRole('button', { name: /アップロード/i })
    const input = screen.getByTestId('file-input') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    fireEvent.keyDown(dropzone, { key: ' ' })

    expect(clickSpy).toHaveBeenCalledTimes(1)
  })

  it('Enter/スペース以外のキー押下では input がクリックされないこと', () => {
    render(<DragDropZone onFileDrop={vi.fn()} />)
    const dropzone = screen.getByRole('button', { name: /アップロード/i })
    const input = screen.getByTestId('file-input') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    fireEvent.keyDown(dropzone, { key: 'a' })

    expect(clickSpy).not.toHaveBeenCalled()
  })

  it('ドロップされたファイルが0件（空のFileList相当）の場合は onFileDrop が呼ばれないこと', () => {
    const mockOnFileDrop = vi.fn()
    render(<DragDropZone onFileDrop={mockOnFileDrop} />)

    const dropzone = screen.getByRole('button', { name: /アップロード/i })

    fireEvent.drop(dropzone, {
      dataTransfer: {
        files: [],
      },
    })

    expect(mockOnFileDrop).not.toHaveBeenCalled()
  })
})
