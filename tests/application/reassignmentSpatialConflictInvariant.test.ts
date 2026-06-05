/**
 * Phase 4-2b: 「位相変更のみの所属変更は空間的に競合不可」の不変条件回帰テスト
 *
 * 所属変更（割譲・帰属・直轄化・独立・連邦化）は末端地物の形状を一切変えない:
 * - コンテナ（集約地物）は `shape` を持たず、形状は子の和として派生する
 * - 移動地物（末端地物）の `shape` は `updatePlacementFromTime` / `updateParentChildIdsFromTime`
 *   の錨分割でもそのまま引き継がれ、変化するのは `placement`（parentId / childIds / isTopLevel）のみ
 *   （`src/renderer/application/ReassignFeatureParentUseCase.ts` の錨再構築を参照）
 *
 * `detectSpatialConflicts` は末端地物（`isLeafPolygonAnchor`: shape あり Polygon + childIds 空）の
 * shape のみをペアワイズに見る（開発ガイド §6.6.8 / ConflictDetectionService.ts）。よって所属変更の
 * 前後で空間競合の集合は不変である。これは要件定義書 §2.2.3 の整合性維持プロセス（空間競合検出 →
 * 解決ダイアログ → 一括確定）を所属変更フローへ配線しても構造上必ず空振りすることの根拠であり、
 * §2.2.3 起動配線を「実際に末端地物の形状を生む最初のフェーズ（Phase 4-4b 直轄領自動生成 /
 * Phase 4-6 末端結合）」へ統合する計画見直し（現状.md §6.10 Phase 4 冒頭）を裏付ける。
 *
 * 本テストは「位相変更のみ ⟹ 空間競合不変」を回帰テストとして固定する（縮小版 Phase 4-2b）。
 * §2.2.3 の解決ダイアログ配線（到達不能）は本サブフェーズでは実装しない（feedback_no_speculative_helpers）。
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { ReassignFeatureParentUseCase } from '@application/ReassignFeatureParentUseCase';
import { detectSpatialConflicts } from '@domain/services/ConflictDetectionService';
import { isLeafPolygonAnchor } from '@domain/value-objects/FeatureAnchor';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { Coordinate } from '@domain/value-objects/Coordinate';
import {
  FeatureAnchor,
  createAnchorPlacement,
  type AnchorProperty,
} from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';

const t1000 = new TimePoint(1000);

function makeVertex(id: string, x: number, y: number): Vertex {
  return new Vertex(id, new Coordinate(x, y));
}

/** 末端地物（shape を保持し childIds 空）。 */
function makeLeaf(
  id: string,
  vertexIds: readonly string[],
  parentId: string | null
): Feature {
  const property: AnchorProperty = { name: id, description: '' };
  const anchor = new FeatureAnchor(
    `${id}-a1`,
    { start: t1000 },
    property,
    { type: 'Polygon', rings: [new Ring(`${id}-ring`, [...vertexIds], 'territory', null)] },
    createAnchorPlacement(parentId, [])
  );
  return new Feature(id, 'Polygon', [anchor]);
}

/** 集約地物（shape を持たないコンテナ）。形状は子の和として派生する。 */
function makeContainer(
  id: string,
  childIds: readonly string[],
  parentId: string | null
): Feature {
  const property: AnchorProperty = { name: id, description: '' };
  const anchor = new FeatureAnchor(
    `${id}-a1`,
    { start: t1000 },
    property,
    undefined,
    createAnchorPlacement(parentId, childIds)
  );
  return new Feature(id, 'Polygon', [anchor]);
}

/** 重ならない / 重なる正方形の頂点群。 */
function squareVertices(): Map<string, Vertex> {
  return new Map<string, Vertex>([
    // squareX: (0,0)-(10,10)
    ['vX1', makeVertex('vX1', 0, 0)],
    ['vX2', makeVertex('vX2', 10, 0)],
    ['vX3', makeVertex('vX3', 10, 10)],
    ['vX4', makeVertex('vX4', 0, 10)],
    // squareY: (20,0)-(30,10) — squareX と離れている
    ['vY1', makeVertex('vY1', 20, 0)],
    ['vY2', makeVertex('vY2', 30, 0)],
    ['vY3', makeVertex('vY3', 30, 10)],
    ['vY4', makeVertex('vY4', 20, 10)],
    // squareZ: (5,0)-(15,10) — squareX と重なる
    ['vZ1', makeVertex('vZ1', 5, 0)],
    ['vZ2', makeVertex('vZ2', 15, 0)],
    ['vZ3', makeVertex('vZ3', 15, 10)],
    ['vZ4', makeVertex('vZ4', 5, 10)],
  ]);
}

/** 現在の世界状態に対する空間競合を「{featureIdA, featureIdB} のソート済みペア集合」として取得する。 */
function conflictSignature(addFeature: AddFeatureUseCase): string[] {
  const features = [...addFeature.getFeaturesMap().values()];
  const result = detectSpatialConflicts(features, addFeature.getVertices(), t1000);
  return result.conflicts
    .map((c) => [c.featureIdA, c.featureIdB].sort().join('~'))
    .sort();
}

/** 末端地物の形状署名（featureId → ringId:vertexIds の連結）を取得し、shape 不変を検証する。 */
function leafShapeSignature(addFeature: AddFeatureUseCase): Record<string, string> {
  const signature: Record<string, string> = {};
  for (const feature of addFeature.getFeaturesMap().values()) {
    const anchor = feature.getActiveAnchor(t1000);
    if (!anchor || !isLeafPolygonAnchor(anchor)) continue;
    signature[feature.id] = anchor.shape.rings
      .map((ring) => `${ring.id}:${ring.vertexIds.join(',')}`)
      .join('|');
  }
  return signature;
}

describe('Phase 4-2b: 所属変更は空間競合を生まない（位相変更のみの不変条件）', () => {
  let addFeature: AddFeatureUseCase;
  let transfer: ReassignFeatureParentUseCase;

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    transfer = new ReassignFeatureParentUseCase(addFeature);
  });

  it('連邦化（新規上位領域作成）: 重ならない最上位末端地物を束ねても競合は生じない', () => {
    const x = makeLeaf('x', ['vX1', 'vX2', 'vX3', 'vX4'], null);
    const y = makeLeaf('y', ['vY1', 'vY2', 'vY3', 'vY4'], null);
    addFeature.restore(new Map([[x.id, x], [y.id, y]]), squareVertices());

    const before = conflictSignature(addFeature);
    const beforeShapes = leafShapeSignature(addFeature);
    expect(before).toEqual([]);

    const result = transfer.reassignFeatureParent({
      featureIds: ['x', 'y'],
      newParentId: null,
      effectiveTime: t1000,
      createNewParent: { name: '合衆国' },
    });

    // 競合は前後で不変（生じない）。末端地物の shape も不変。
    expect(conflictSignature(addFeature)).toEqual(before);
    expect(leafShapeSignature(addFeature)).toEqual(beforeShapes);

    // 新規コンテナは shape を持たず、末端排他検証の対象外であることを確認。
    const container = addFeature.getFeatureById(result.createdParentId!)!;
    const containerAnchor = container.getActiveAnchor(t1000)!;
    expect(containerAnchor.shape).toBeUndefined();
    expect(isLeafPolygonAnchor(containerAnchor)).toBe(false);
    // 子は依然として末端地物のまま（連邦化で末端性は変わらない）。
    expect(isLeafPolygonAnchor(addFeature.getFeatureById('x')!.getActiveAnchor(t1000)!)).toBe(true);
    expect(isLeafPolygonAnchor(addFeature.getFeatureById('y')!.getActiveAnchor(t1000)!)).toBe(true);
  });

  it('連邦化: 既に重なっている末端地物を束ねても競合は増減しない（位相変更は競合を作らず解消もしない）', () => {
    // 既存の重なり（過去の不正編集等で混入した状態）を束ねるケース。
    const x = makeLeaf('x', ['vX1', 'vX2', 'vX3', 'vX4'], null);
    const z = makeLeaf('z', ['vZ1', 'vZ2', 'vZ3', 'vZ4'], null);
    addFeature.restore(new Map([[x.id, x], [z.id, z]]), squareVertices());

    const before = conflictSignature(addFeature);
    const beforeShapes = leafShapeSignature(addFeature);
    // squareX(0-10) と squareZ(5-15) は重なるため、束ねる前から 1 件の競合がある。
    expect(before).toEqual(['x~z']);

    transfer.reassignFeatureParent({
      featureIds: ['x', 'z'],
      newParentId: null,
      effectiveTime: t1000,
      createNewParent: { name: '連邦' },
    });

    // 束ねても競合集合は不変。所属変更は競合を作らず、解消もしない（形状を変えないため）。
    expect(conflictSignature(addFeature)).toEqual(before);
    expect(leafShapeSignature(addFeature)).toEqual(beforeShapes);
  });

  it('独立: 子末端地物を最上位へ昇格しても競合は生じない', () => {
    const container = makeContainer('c', ['x'], null);
    const x = makeLeaf('x', ['vX1', 'vX2', 'vX3', 'vX4'], 'c');
    const y = makeLeaf('y', ['vY1', 'vY2', 'vY3', 'vY4'], null);
    addFeature.restore(
      new Map([[container.id, container], [x.id, x], [y.id, y]]),
      squareVertices()
    );

    const before = conflictSignature(addFeature);
    const beforeShapes = leafShapeSignature(addFeature);
    expect(before).toEqual([]);

    transfer.reassignFeatureParent({
      featureIds: ['x'],
      newParentId: null,
      effectiveTime: t1000,
      transferType: 'reassign',
    });

    // 独立後も x は末端地物のまま、shape 不変、競合不変。
    const xAnchor = addFeature.getFeatureById('x')!.getActiveAnchor(t1000)!;
    expect(xAnchor.placement.isTopLevel).toBe(true);
    expect(xAnchor.placement.parentId).toBeNull();
    expect(isLeafPolygonAnchor(xAnchor)).toBe(true);
    // 子を唯一失ったコンテナ c は自動消滅する（末端排他検証の対象に残らない）。
    expect(addFeature.getFeatureById('c')).toBeUndefined();
    expect(conflictSignature(addFeature)).toEqual(before);
    expect(leafShapeSignature(addFeature)).toEqual(beforeShapes);
  });

  it('帰属（既存コンテナへの割譲）: 既存上位領域へ移しても競合は生じない', () => {
    // コンテナ p は子 x を持つ。離れた最上位末端 y を p へ帰属させる。
    const parent = makeContainer('p', ['x'], null);
    const x = makeLeaf('x', ['vX1', 'vX2', 'vX3', 'vX4'], 'p');
    const y = makeLeaf('y', ['vY1', 'vY2', 'vY3', 'vY4'], null);
    addFeature.restore(
      new Map([[parent.id, parent], [x.id, x], [y.id, y]]),
      squareVertices()
    );

    const before = conflictSignature(addFeature);
    const beforeShapes = leafShapeSignature(addFeature);
    expect(before).toEqual([]);

    transfer.reassignFeatureParent({
      featureIds: ['y'],
      newParentId: 'p',
      effectiveTime: t1000,
      transferType: 'cede',
    });

    // y は p の子になっても末端地物のまま、shape 不変、競合不変。
    const yAnchor = addFeature.getFeatureById('y')!.getActiveAnchor(t1000)!;
    expect(yAnchor.placement.parentId).toBe('p');
    expect(isLeafPolygonAnchor(yAnchor)).toBe(true);
    // 既存コンテナ p は子が増えても末端排他検証の対象外（shape を持たない）。
    expect(isLeafPolygonAnchor(addFeature.getFeatureById('p')!.getActiveAnchor(t1000)!)).toBe(false);
    expect(conflictSignature(addFeature)).toEqual(before);
    expect(leafShapeSignature(addFeature)).toEqual(beforeShapes);
  });

  it('直轄化（中間階層スキップ）: 祖先コンテナへ移しても競合は生じない', () => {
    // b(最上位コンテナ) > a(中間コンテナ) > x(末端)。x を a を飛ばして b 直下へ移す。
    const b = makeContainer('b', ['a'], null);
    const a = makeContainer('a', ['x'], 'b');
    const x = makeLeaf('x', ['vX1', 'vX2', 'vX3', 'vX4'], 'a');
    const y = makeLeaf('y', ['vY1', 'vY2', 'vY3', 'vY4'], null);
    addFeature.restore(
      new Map([[b.id, b], [a.id, a], [x.id, x], [y.id, y]]),
      squareVertices()
    );

    const before = conflictSignature(addFeature);
    const beforeShapes = leafShapeSignature(addFeature);
    expect(before).toEqual([]);

    transfer.reassignFeatureParent({
      featureIds: ['x'],
      newParentId: 'b',
      effectiveTime: t1000,
      transferType: 'reassign',
    });

    // 直轄化後も x は末端地物のまま、shape 不変、競合不変。中間コンテナ a は子喪失で自動消滅する。
    const xAnchor = addFeature.getFeatureById('x')!.getActiveAnchor(t1000)!;
    expect(xAnchor.placement.parentId).toBe('b');
    expect(isLeafPolygonAnchor(xAnchor)).toBe(true);
    expect(addFeature.getFeatureById('a')).toBeUndefined();
    expect(conflictSignature(addFeature)).toEqual(before);
    expect(leafShapeSignature(addFeature)).toEqual(beforeShapes);
  });
});
