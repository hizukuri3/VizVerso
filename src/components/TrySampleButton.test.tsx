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

  it('fetch 処理中に連打しても2回目以降のクリックは無視されること（二重クリック防止・DOM上のdisabled経由）', async () => {
    // fetch を手動で解決できるように Promise を保持しておく
    let resolveFetch: (value: unknown) => void = () => {}
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const onFileDrop = vi.fn()
    render(<TrySampleButton onFileDrop={onFileDrop} />)

    const button = screen.getByRole('button')
    // 1回目のクリックで isFetching が true になり fetch 中の状態になる
    fireEvent.click(button)
    // 2回目のクリック（連打）は isFetching ガードにより無視されるはず
    fireEvent.click(button)

    expect(fetchMock).toHaveBeenCalledTimes(1)

    // 後始末: 保留中の fetch を解決してテスト終了時の警告を防ぐ
    resolveFetch({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })
    await waitFor(() => {
      expect(onFileDrop).toHaveBeenCalledTimes(1)
    })
  })

  it('isFetching 中は内部ガード（if (isFetching) return）自体で処理が打ち切られること', async () => {
    // ボタンの disabled 属性ではなく、handleClick 内部の isFetching ガード自体を
    // 直接検証するため、1回目のクリック後に disabled 属性を強制的に外してから
    // 2回目のクリックを発火させる（React の disabled 制御より先にガード分岐へ到達させる）
    let resolveFetch: (value: unknown) => void = () => {}
    const fetchMock = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve
        }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const onFileDrop = vi.fn()
    render(<TrySampleButton onFileDrop={onFileDrop} />)

    const button = screen.getByRole('button') as HTMLButtonElement
    fireEvent.click(button)
    expect(button.disabled).toBe(true)

    // disabled による dispatch 抑止を回避し、isFetching ガードのみを確認する
    button.disabled = false
    fireEvent.click(button)

    // isFetching ガードにより fetch は依然として1回しか呼ばれない
    expect(fetchMock).toHaveBeenCalledTimes(1)

    resolveFetch({
      ok: true,
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    })
    await waitFor(() => {
      expect(onFileDrop).toHaveBeenCalledTimes(1)
    })
  })

  it('Error インスタンスではない例外が送出された場合はデフォルトのエラーメッセージで onError が呼ばれること', async () => {
    // reject の理由が Error インスタンスでないケース（文字列送出等）
    const fetchMock = vi.fn().mockRejectedValue('network down')
    vi.stubGlobal('fetch', fetchMock)

    const onFileDrop = vi.fn()
    const onError = vi.fn()
    render(<TrySampleButton onFileDrop={onFileDrop} onError={onError} />)

    fireEvent.click(screen.getByRole('button'))

    await waitFor(() => {
      expect(onError).toHaveBeenCalledTimes(1)
    })
    // err instanceof Error が false のため、デフォルトのエラーメッセージが使われる
    expect(onError).toHaveBeenCalledWith(
      'ファイルの解析中にエラーが発生しました',
    )
    expect(onFileDrop).not.toHaveBeenCalled()
  })
})
