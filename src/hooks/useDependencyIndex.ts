import { useMemo } from 'react'
import type { TableauDocument, TableauField } from '../types/tableau'
import { normalizeFieldId } from '../utils/xmlParser'

export interface ResolvedFieldInfo {
  field: TableauField
  parentName: string
  parentCaption: string
  parentType: 'datasource' | 'worksheet'
  resolvedCaption: string
  resolvedFormula?: string
  resolvedDataType?: string
  isCalculated: boolean
}

export interface DependencyIndex {
  fields: Map<
    string,
    {
      field: TableauField
      parentName: string
      parentCaption: string
      parentType: 'datasource' | 'worksheet'
    }
  >
  fieldToParents: Map<string, Set<string>> // fieldName -> referencing fields
  fieldToSheets: Map<string, Set<string>> // fieldName -> using sheets
  getFieldInfo: (name: string) => ResolvedFieldInfo | null
}

export function useDependencyIndex(
  doc: TableauDocument | null,
): DependencyIndex | null {
  return useMemo(() => {
    if (!doc) return null

    const fields = new Map<
      string,
      {
        field: TableauField
        parentName: string
        parentCaption: string
        parentType: 'datasource' | 'worksheet'
      }
    >()
    const fieldToParents = new Map<string, Set<string>>()
    const fieldToSheets = new Map<string, Set<string>>()

    // 全フィールドの収集
    doc.datasources.forEach((ds) => {
      const parentCaption = ds.caption || ds.name
      ds.fields.forEach((f) => {
        fields.set(normalizeFieldId(f.column), {
          field: f,
          parentName: ds.name,
          parentCaption,
          parentType: 'datasource',
        })
      })
    })

    // ワークシート固有のフィールドも追加
    doc.worksheets.forEach((ws) => {
      const parentCaption = ws.caption || ws.name
      ws.localFields?.forEach((f) => {
        const id = normalizeFieldId(f.column)
        if (!fields.has(id)) {
          fields.set(id, {
            field: f,
            parentName: ws.name,
            parentCaption,
            parentType: 'worksheet',
          })
        }
      })
    })

    // 依存関係（計算式）の解析
    fields.forEach((info, name) => {
      if (info.field.formula) {
        // [Field Name] 形式の参照を抽出
        // 抽出精度を上げるための正規表現
        const matches = info.field.formula.matchAll(/\[([^\]]+)\]/g)
        for (const match of matches) {
          const refName = normalizeFieldId(match[1])
          if (!fieldToParents.has(refName))
            fieldToParents.set(refName, new Set())
          fieldToParents.get(refName)!.add(normalizeFieldId(name))
        }
      }
    })

    // ワークシートによる使用の解析
    doc.worksheets.forEach((ws) => {
      ws.dependencies.forEach((dep) => {
        const id = normalizeFieldId(dep)
        if (!fieldToSheets.has(id)) fieldToSheets.set(id, new Set())
        fieldToSheets.get(id)!.add(ws.name)
      })
    })

    // ヘルパー関数の定義
    const getFieldInfo = (name: string): ResolvedFieldInfo | null => {
      const cleanId = normalizeFieldId(name)
      const info = fields.get(cleanId)
      if (!info) return null

      // メタデータの解決（参照元を辿る）
      let currentField: TableauField | undefined = info.field
      let caption = currentField.caption
      let formula = currentField.formula
      let dataType = currentField.dataType
      let depth = 0

      const visited = new Set<string>()
      visited.add(cleanId)

      while (depth < 5) {
        if (currentField?.class) {
          const classId = normalizeFieldId(currentField.class)
          const next = fields.get(classId)
          if (next && !visited.has(classId)) {
            if (!caption) caption = next.field.caption
            if (!formula) formula = next.field.formula
            if (!dataType) dataType = next.field.dataType
            visited.add(classId)
            currentField = next.field
          } else {
            break
          }
        } else {
          break
        }
        depth++
      }

      return {
        field: info.field,
        parentName: info.parentName,
        parentCaption: info.parentCaption,
        parentType: info.parentType,
        resolvedCaption: caption || cleanId,
        resolvedFormula: formula,
        resolvedDataType: dataType,
        isCalculated: !!formula,
      }
    }

    return { fields, fieldToParents, fieldToSheets, getFieldInfo }
  }, [doc])
}
