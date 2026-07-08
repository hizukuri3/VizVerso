/**
 * @vitest-environment jsdom
 */
import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import { LandingSections } from './LandingSections'
import ja from '../locales/ja.json'
import enJson from '../locales/en.json'
import '@testing-library/jest-dom'

describe('LandingSections - ユースケースと FAQ', () => {
  it('ユースケースの見出しと 3 つのシナリオが描画されること', () => {
    render(<LandingSections />)
    expect(screen.getByText(ja.usecases.title)).toBeInTheDocument()
    expect(screen.getByText(ja.usecases.handover.title)).toBeInTheDocument()
    expect(screen.getByText(ja.usecases.cleanup.title)).toBeInTheDocument()
    expect(
      screen.getByText(ja.usecases.documentation.title),
    ).toBeInTheDocument()
  })

  it('FAQ の見出しと 4 つの質問が描画されること', () => {
    render(<LandingSections />)
    expect(screen.getByText(ja.faq.title)).toBeInTheDocument()
    expect(screen.getByText(ja.faq.q1.q)).toBeInTheDocument()
    expect(screen.getByText(ja.faq.q2.q)).toBeInTheDocument()
    expect(screen.getByText(ja.faq.q3.q)).toBeInTheDocument()
    expect(screen.getByText(ja.faq.q4.q)).toBeInTheDocument()
  })

  it('FAQ は details/summary によるアコーディオンで構成されること', () => {
    const { container } = render(<LandingSections />)
    const details = container.querySelectorAll('details')
    expect(details.length).toBe(4)
    // 各 details に summary が存在すること
    details.forEach((d) => {
      expect(d.querySelector('summary')).not.toBeNull()
    })
  })
})

describe('i18n キーの存在確認', () => {
  it('ja/en 双方に usecases と faq の主要キーが存在すること', () => {
    for (const locale of ['ja', 'en'] as const) {
      // 動的 import ではなく静的読み込みで検証
      const dict = locale === 'ja' ? ja : enJson
      expect(dict.dropzone.try_sample).toBeTruthy()
      expect(dict.dropzone.try_sample_hint).toBeTruthy()
      expect(dict.usecases.title).toBeTruthy()
      expect(dict.faq.title).toBeTruthy()
      expect(dict.faq.q1.q).toBeTruthy()
      expect(dict.faq.q4.a).toBeTruthy()
    }
  })
})
