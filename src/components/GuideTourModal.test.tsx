/**
 * @vitest-environment jsdom
 */
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest'
import { GuideTourModal } from './GuideTourModal'
import { hasSeenTour, markTourSeen } from '../utils/tourStorage'
import '@testing-library/jest-dom'

// この vitest 環境では Node の実験的 localStorage（undefined）が jsdom のものを
// 覆い隠してしまうため、インメモリのスタブを window に定義してテストする
beforeAll(() => {
  const store = new Map<string, string>()
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, String(value)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    },
  })
})

afterEach(() => {
  window.localStorage.clear()
  vi.restoreAllMocks()
})

describe('GuideTourModal - 使い方ガイドツアー', () => {
  it('isOpen が false のときは何も描画しないこと', () => {
    render(<GuideTourModal isOpen={false} onClose={() => {}} />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('isOpen が true のときタイトルと最初のステップが表示されること', () => {
    render(<GuideTourModal isOpen={true} onClose={() => {}} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByText('VizVerso の使い方')).toBeInTheDocument()
    // 最初のステップ（アップロード）
    expect(screen.getByText('ワークブックをドロップ')).toBeInTheDocument()
    // 最初のステップでは「戻る」ではなく「スキップ」が表示される
    expect(screen.getByText('スキップ')).toBeInTheDocument()
  })

  it('「次へ」でステップが進み、最終ステップでは「はじめる」になること', () => {
    render(<GuideTourModal isOpen={true} onClose={() => {}} />)

    fireEvent.click(screen.getByText('次へ'))
    expect(
      screen.getByText('データはブラウザの外に出ません'),
    ).toBeInTheDocument()

    // 解析直後に最初に表示されるヘルスチェックを、探索より先に説明する順序
    fireEvent.click(screen.getByText('次へ'))
    expect(screen.getByText('ヘルスチェックで健全性を確認')).toBeInTheDocument()

    fireEvent.click(screen.getByText('次へ'))
    expect(screen.getByText('構造と計算式を探索')).toBeInTheDocument()

    fireEvent.click(screen.getByText('次へ'))
    expect(screen.getByText('Excel にエクスポート')).toBeInTheDocument()
    expect(screen.getByText('はじめる')).toBeInTheDocument()
    expect(screen.queryByText('次へ')).not.toBeInTheDocument()
  })

  it('最終ステップの「はじめる」で onClose が呼ばれること', () => {
    const onClose = vi.fn()
    render(<GuideTourModal isOpen={true} onClose={onClose} />)

    for (let i = 0; i < 4; i++) {
      fireEvent.click(screen.getByText('次へ'))
    }
    fireEvent.click(screen.getByText('はじめる'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('「戻る」で前のステップに戻れること', () => {
    render(<GuideTourModal isOpen={true} onClose={() => {}} />)

    fireEvent.click(screen.getByText('次へ'))
    fireEvent.click(screen.getByText('戻る'))
    expect(screen.getByText('ワークブックをドロップ')).toBeInTheDocument()
  })

  it('「スキップ」で onClose が呼ばれること', () => {
    const onClose = vi.fn()
    render(<GuideTourModal isOpen={true} onClose={onClose} />)
    fireEvent.click(screen.getByText('スキップ'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('Escape キーで onClose が呼ばれること', () => {
    const onClose = vi.fn()
    render(<GuideTourModal isOpen={true} onClose={onClose} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('ドットインジケーターのクリックで任意のステップへ移動できること', () => {
    render(<GuideTourModal isOpen={true} onClose={() => {}} />)
    fireEvent.click(screen.getByLabelText('4 / 5'))
    expect(screen.getByText('構造と計算式を探索')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText('5 / 5'))
    expect(screen.getByText('Excel にエクスポート')).toBeInTheDocument()
  })
})

describe('hasSeenTour / markTourSeen - 初回表示フラグ', () => {
  it('未表示の状態では hasSeenTour が false を返すこと', () => {
    expect(hasSeenTour()).toBe(false)
  })

  it('markTourSeen 後は hasSeenTour が true を返すこと', () => {
    markTourSeen()
    expect(hasSeenTour()).toBe(true)
  })

  it('localStorage が使えない環境では true（表示しない扱い）を返すこと', () => {
    vi.spyOn(window.localStorage, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError')
    })
    expect(hasSeenTour()).toBe(true)
  })

  it('localStorage への保存が失敗しても markTourSeen が例外を投げないこと', () => {
    vi.spyOn(window.localStorage, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError')
    })
    expect(() => markTourSeen()).not.toThrow()
  })
})
