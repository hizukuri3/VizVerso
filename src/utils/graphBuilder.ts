import type { TableauDocument } from '../types/tableau';
import type { Node, Edge } from '@xyflow/react';

const X_DASHBOARD = 0;
const X_WORKSHEET = 500;
const X_FIELD = 1100;
const X_DATASOURCE = 1700;
const Y_STEP = 160;

export function buildGraphData(doc: TableauDocument): { nodes: Node[], edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  let yDash = 0;
  let ySheet = 0;
  let yField = 0;
  let yDs = 0;

  // ──────────────────────────────────────────────
  // 1. ダッシュボード ノード
  // ──────────────────────────────────────────────
  doc.dashboards.forEach((db) => {
    const id = `dashboard-${db.name}`;
    nodes.push({
      id,
      position: { x: X_DASHBOARD, y: yDash },
      data: {
        label: `📊 ${db.caption || db.name}`,
        type: 'dashboard',
        originalName: db.name,
      },
      className: 'custom-node dashboard-node',
      style: { width: 240, fontSize: '14px', fontWeight: 'bold' },
    });
    yDash += Y_STEP;

    // ダッシュボード → シート エッジ
    db.worksheets.forEach((wsName) => {
      edges.push({
        id: `e-db-ws-${db.name}-${wsName}`,
        source: id,
        target: `worksheet-${wsName}`,
        type: 'default',
        animated: true,
        style: { stroke: '#f87171', strokeWidth: 2 },
      });
    });
  });

  // ──────────────────────────────────────────────
  // 2. ワークシート ノード
  // ──────────────────────────────────────────────
  doc.worksheets.forEach((ws) => {
    const id = `worksheet-${ws.name}`;
    nodes.push({
      id,
      position: { x: X_WORKSHEET, y: ySheet },
      data: {
        label: `📝 ${ws.caption || ws.name}`,
        type: 'worksheet',
        originalName: ws.name,
      },
      className: 'custom-node worksheet-node',
      style: { width: 240, fontSize: '13px' },
    });
    ySheet += Y_STEP;

    // シート → フィールド エッジ（フィールドID: field-{column}）
    ws.dependencies.forEach((depName) => {
      edges.push({
        id: `e-ws-field-${ws.name}-${depName}`,
        source: id,
        target: `field-${depName}`,
        type: 'default',
        style: { stroke: '#fbbf24', strokeWidth: 1.5 },
      });
    });
  });

  // ──────────────────────────────────────────────
  // 3. データソース & フィールド ノード
  // ──────────────────────────────────────────────
  doc.datasources.forEach((ds) => {
    const dsId = `ds-${ds.name}`;
    nodes.push({
      id: dsId,
      position: { x: X_DATASOURCE, y: yDs },
      data: {
        label: `🗄️ ${ds.caption || ds.name}`,
        type: 'datasource',
        originalName: ds.name,
      },
      className: 'custom-node datasource-node',
      style: { width: 240, fontSize: '13px' },
    });
    yDs += Y_STEP;

    ds.fields.forEach((field) => {
      const fieldId = `field-${field.column}`;

      // 重複防止
      if (!nodes.find((n) => n.id === fieldId)) {
        nodes.push({
          id: fieldId,
          position: { x: X_FIELD, y: yField },
          data: {
            label: `${field.formula ? 'f(x)' : '●'} ${field.caption || field.column}`,
            type: 'field',
            originalName: field.column,
          },
          className: `custom-node ${field.formula ? 'calc-field-node' : 'field-node'}`,
          style: { width: 240, fontSize: '11px' },
        });
        yField += Y_STEP;
      }

      // フィールド → データソース エッジ
      edges.push({
        id: `e-field-ds-${field.column}-${ds.name}`,
        source: fieldId,
        target: dsId,
        type: 'default',
        style: { stroke: '#4ade80', strokeWidth: 1.5 },
      });
    });
  });

  return { nodes, edges };
}
