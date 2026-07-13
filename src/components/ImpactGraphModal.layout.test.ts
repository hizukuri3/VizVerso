import { describe, it, expect } from 'vitest'
import { layoutNodes, type LayoutPinState } from './ImpactGraphModal'
import type { ImpactGraphNode } from '../utils/impactAnalyzer'

// レイアウト純関数（layoutNodes）のピン留め差分挙動を検証する。
// buildImpactGraph は通さず、ImpactGraphNode を直接組み立てる。

// ROW_GAP*0.8（占有判定のしきい値）。ROW_GAP=72 なので 57.6。
const MIN_GAP = 72 * 0.8

let seq = 0
function makeNode(
  id: string,
  column: number,
  over: Partial<ImpactGraphNode> = {},
): ImpactGraphNode {
  seq += 1
  return {
    id,
    kind: 'field',
    label: id,
    column,
    isRoot: column === 0,
    isCalc: false,
    calcType: null,
    isParameter: false,
    isUnresolved: false,
    fieldId: `f_${id}_${seq}`,
    ...over,
  }
}

/** col<0 の上流ノード uX から root R への辺（source→target = 左→右） */
function edgeTo(source: string, target: string) {
  return { source, target }
}

describe('layoutNodes ピン留め差分レイアウト', () => {
  it('1. prev=null のフルレイアウトは決定的（同入力→同出力）', () => {
    const nodes = [
      makeNode('R', 0),
      makeNode('u1', -1),
      makeNode('u2', -1),
      makeNode('u3', -1),
    ]
    const edges = [edgeTo('u1', 'R'), edgeTo('u2', 'R'), edgeTo('u3', 'R')]
    const a = layoutNodes(nodes, edges, null)
    const b = layoutNodes(nodes, edges, null)
    expect([...a.positions.entries()]).toEqual([...b.positions.entries()])
  })

  it('2. ノード追加後の差分で生存ノードの座標がビット同一', () => {
    const base = [makeNode('R', 0), makeNode('u1', -1), makeNode('u2', -1)]
    const baseEdges = [edgeTo('u1', 'R'), edgeTo('u2', 'R')]
    const full = layoutNodes(base, baseEdges, null)

    const added = [...base, makeNode('u3', -1)]
    const addedEdges = [...baseEdges, edgeTo('u3', 'R')]
    const diff = layoutNodes(added, addedEdges, full.pin)

    for (const id of ['R', 'u1', 'u2']) {
      expect(diff.positions.get(id)).toEqual(full.positions.get(id))
    }
    expect(diff.positions.has('u3')).toBe(true)
  })

  it('3. 新規ノードが既存ノードと重ならない（同一 x で |Δy| >= ROW_GAP*0.8）', () => {
    const base = [
      makeNode('R', 0),
      makeNode('u1', -1),
      makeNode('u2', -1),
      makeNode('u3', -1),
    ]
    const baseEdges = [edgeTo('u1', 'R'), edgeTo('u2', 'R'), edgeTo('u3', 'R')]
    const full = layoutNodes(base, baseEdges, null)

    const added = [
      ...base,
      makeNode('n1', -1),
      makeNode('n2', -1),
      makeNode('n3', -1),
    ]
    const addedEdges = [
      ...baseEdges,
      edgeTo('n1', 'R'),
      edgeTo('n2', 'R'),
      edgeTo('n3', 'R'),
    ]
    const diff = layoutNodes(added, addedEdges, full.pin)

    const pts = [...diff.positions.values()]
    pts.forEach((a, i) => {
      pts.slice(i + 1).forEach((b) => {
        if (Math.abs(a.x - b.x) < 0.5) {
          expect(Math.abs(a.y - b.y)).toBeGreaterThanOrEqual(MIN_GAP - 1e-6)
        }
      })
    })
  })

  it('4. column が変わった生存ノードは y 維持・x のみ変化', () => {
    const base = [makeNode('R', 0), makeNode('u1', -1), makeNode('u2', -1)]
    const baseEdges = [edgeTo('u1', 'R'), edgeTo('u2', 'R')]
    const full = layoutNodes(base, baseEdges, null)
    const beforeU2 = full.positions.get('u2')!

    // u2 を column -2 へ沈め込む（他ノードは据え置き）
    const moved = [makeNode('R', 0), makeNode('u1', -1), makeNode('u2', -2)]
    const movedEdges = baseEdges
    const diff = layoutNodes(moved, movedEdges, full.pin)
    const afterU2 = diff.positions.get('u2')!

    expect(afterU2.y).toBe(beforeU2.y)
    expect(afterU2.x).not.toBe(beforeU2.x)
  })

  it('5. 新規列が既存 x 範囲の外側に置かれる', () => {
    const base = [makeNode('R', 0), makeNode('u1', -1)]
    const baseEdges = [edgeTo('u1', 'R')]
    const full = layoutNodes(base, baseEdges, null)
    const minX = Math.min(...[...full.positions.values()].map((p) => p.x))

    const added = [...base, makeNode('d1', -2)]
    const addedEdges = [...baseEdges, edgeTo('d1', 'u1')]
    const diff = layoutNodes(added, addedEdges, full.pin)
    expect(diff.positions.get('d1')!.x).toBeLessThan(minX)
  })

  it('6. 消えたノードのスロットが解放され、新規ノードがそこへ入れる', () => {
    const base = [
      makeNode('R', 0),
      makeNode('u1', -1),
      makeNode('u2', -1),
      makeNode('u3', -1),
    ]
    const baseEdges = [edgeTo('u1', 'R'), edgeTo('u2', 'R'), edgeTo('u3', 'R')]
    const full = layoutNodes(base, baseEdges, null)
    const freedY = full.positions.get('u2')!.y // 中央スロット（barycenter 0）

    // u2 を消し、root 隣接の新規 w を追加（目標 y = root の y = freedY 近傍）
    const next = [
      makeNode('R', 0),
      makeNode('u1', -1),
      makeNode('u3', -1),
      makeNode('w', -1),
    ]
    const nextEdges = [edgeTo('u1', 'R'), edgeTo('u3', 'R'), edgeTo('w', 'R')]
    const diff = layoutNodes(next, nextEdges, full.pin)

    expect(diff.positions.get('w')!.y).toBe(freedY)
    expect(diff.positions.get('w')!.x).toBe(full.positions.get('u2')!.x)
    // 型が export されていることの確認
    const pin: LayoutPinState = diff.pin
    expect(pin.positions.has('w')).toBe(true)
  })
})
