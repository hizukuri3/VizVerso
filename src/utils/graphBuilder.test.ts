import { describe, it, expect } from 'vitest';
import { buildGraphData } from './graphBuilder';
import type { TableauDocument } from '../types/tableau';

describe('graphBuilder - buildGraphData', () => {
  it('TableauDocumentからノードとエッジを正しく生成できること', () => {
    const mockDoc: TableauDocument = {
      dashboards: [{ name: 'Dash1', worksheets: ['Sheet1'] }],
      worksheets: [{ name: 'Sheet1', dependencies: ['Sales'] }],
      datasources: [{
        name: 'DS1',
        fields: [{ column: 'Sales', formula: 'SUM([Value])', class: 'tableau' }]
      }]
    };

    const { nodes, edges } = buildGraphData(mockDoc);

    expect(nodes.length).toBeGreaterThan(0);
    expect(edges.length).toBeGreaterThan(0);

    const dashNode = nodes.find(n => n.id === 'dashboard-Dash1');
    const sheetNode = nodes.find(n => n.id === 'worksheet-Sheet1');
    const fieldNode = nodes.find(n => n.id === 'field-Sales');

    expect(dashNode).toBeDefined();
    expect(sheetNode).toBeDefined();
    expect(fieldNode).toBeDefined();

    // Dashboard -> Worksheet エッジ
    const dashToSheetEdge = edges.find(e => e.source === 'dashboard-Dash1' && e.target === 'worksheet-Sheet1');
    expect(dashToSheetEdge).toBeDefined();

    // Worksheet -> Field エッジ
    const sheetToFieldEdge = edges.find(e => e.source === 'worksheet-Sheet1' && e.target === 'field-Sales');
    expect(sheetToFieldEdge).toBeDefined();
  });
});
