/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { TrySampleButton } from './TrySampleButton'
import '@testing-library/jest-dom'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('TrySampleButton - サンプルデモボタン', () => {
  it('クリックで /sample.twbx を fetch し、sample.twbx という File で onFileDrop が呼ばれること', async () => {
    // ArrayBuffer を返す fetch をモック
    const buffer = new ArrayBuffer(8)
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(buffer),
    })
    vi.stubGlobal('fetch', fetchMock)

    const onFileDrop = vi.fn()
    render(<TrySampleButton onFileDrop={onFileDrop} />)

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onFileDrop).toHaveBeenCalledTimes(1)
    })

    // fetch が /sample.twbx を叩いていること
    expect(fetchMock).toHaveBeenCalledWith('/sample.twbx')

    // 渡された File のファイル名が sample.twbx であること
    const passed = onFileDrop.mock.calls[0][0] as File
    expect(passed).toBeInstanceOf(File)
    expect(passed.name).toBe('sample.twbx')
  })

  it('fetch が失敗した場合は onError が呼ばれ、onFileDrop は呼ばれないこと', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('network error'))
    vi.stubGlobal('fetch', fetchMock)

    const onFileDrop = vi.fn()
    const onError = vi.fn()
    render(<TrySampleButton onFileDrop={onFileDrop} onError={onError} />)

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
    })
    expect(onFileDrop).not.toHaveBeenCalled()
  })

  it('レスポンスが ok でない場合も onError が呼ばれること', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })
    vi.stubGlobal('fetch', fetchMock)

    const onFileDrop = vi.fn()
    const onError = vi.fn()
    render(<TrySampleButton onFileDrop={onFileDrop} onError={onError} />)

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
    })
    expect(onFileDrop).not.toHaveBeenCalled()
  })
})
