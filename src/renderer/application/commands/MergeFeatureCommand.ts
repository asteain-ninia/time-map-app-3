/**
 * 地物結合コマンド（Undo対応）
 *
 * §2.3.3.2: 結合ツール — 複数の面情報をブーリアン和で結合。
 *
 * execute で結合対象の地物を1つに統合し、残りを削除する。
 * undo で元の形状に戻し、削除した地物を復元する。
 */

import type { UndoableCommand } from '../UndoRedoManager';
import type { AddFeatureUseCase } from '../AddFeatureUseCase';
import type { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import type { FeatureShape } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import {
  isPointInPolygon,
  polygonArea,
  type RingCoords,
} from '@domain/services/GeometryService';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { Ring } from '@domain/value-objects/Ring';
import { mergePolygons, validateMerge } from '@domain/services/MergeService';
import { eventBus } from '../EventBus';

export interface MergeFeatureParams {
  /** 結合対象の地物ID群（最初のIDが結合後の地物として残る） */
  readonly featureIds: readonly string[];
  /** 現在時間 */
  readonly currentTime: TimePoint;
  /** 結合後の地物名（省略時は最初の地物の名前を使用） */
  readonly mergedName?: string;
}

interface PolygonRingDraft {
  readonly id: string;
  readonly coords: RingCoords;
  readonly ringType: 'territory' | 'hole';
  readonly parentId: string | null;
}

export class MergeFeatureCommand implements UndoableCommand {
  readonly description: string;

  /** Undo用: 元の全地物の状態 */
  private originalFeatures: Map<string, Feature> = new Map();
  /** 結合で追加した頂点ID */
  private addedVertexIds: string[] = [];
  /** 削除した地物ID（最初の地物以外） */
  private removedFeatureIds: string[] = [];

  constructor(
    private readonly featureUseCase: AddFeatureUseCase,
    private readonly params: MergeFeatureParams
  ) {
    this.description = `${params.featureIds.length}個の地物を結合`;
  }

  execute(): void {
    const { featureIds, currentTime, mergedName } = this.params;
    const uniqueFeatureIds = [...new Set(featureIds)];
    if (uniqueFeatureIds.length < 2) {
      throw new Error('結合には2つ以上の面情報が必要です');
    }

    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices();

    // 元の地物状態を保存
    this.originalFeatures.clear();
    for (const fid of uniqueFeatureIds) {
      const f = features.get(fid);
      if (f) this.originalFeatures.set(fid, f);
    }

    // ポリゴンの座標を収集
    const polygonRingsList: RingCoords[][] = [];
    const validationTargets: Array<{ id: string; layerId: string; hasChildren: boolean }> = [];
    for (const fid of uniqueFeatureIds) {
      const feature = features.get(fid);
      if (!feature) {
        throw new Error(`結合対象の地物が見つかりません: ${fid}`);
      }
      const anchor = feature.getActiveAnchor(currentTime);
      if (!anchor || anchor.shape.type !== 'Polygon') {
        throw new Error('結合できるのは現在時刻で有効な面情報のみです');
      }
      validationTargets.push({
        id: feature.id,
        layerId: anchor.placement.layerId,
        hasChildren: anchor.placement.childIds.length > 0,
      });

      polygonRingsList.push(...this.resolvePolygonShapePolygons(anchor.shape, vertices));
    }

    const validation = validateMerge(validationTargets);
    if (!validation.valid) {
      throw new Error(validation.error ?? '結合対象が不正です');
    }

    // 結合
    const result = mergePolygons(polygonRingsList);
    if (!result.success) {
      throw new Error(result.error ?? '結合に失敗しました');
    }

    const verticesBefore = new Set(vertices.keys());

    // 結合後の形状を生成
    const mergedShape = this.createPolygonShape(result.mergedPolygons);

    // 最初の地物を結合結果に更新
    const primaryId = uniqueFeatureIds[0];
    const primaryFeature = features.get(primaryId)!;
    const anchor = primaryFeature.getActiveAnchor(currentTime)!;

    const updatedAnchor = mergedName
      ? anchor.withShape(mergedShape).withProperty({ ...anchor.property, name: mergedName })
      : anchor.withShape(mergedShape);
    const newAnchors = primaryFeature.anchors.map(a => a.id === anchor.id ? updatedAnchor : a);
    features.set(primaryId, primaryFeature.withAnchors(newAnchors));

    // 残りの地物を削除
    this.removedFeatureIds = [];
    for (let i = 1; i < uniqueFeatureIds.length; i++) {
      features.delete(uniqueFeatureIds[i]);
      this.removedFeatureIds.push(uniqueFeatureIds[i]);
    }

    // 追加された頂点IDを記録
    this.addedVertexIds = [];
    for (const id of vertices.keys()) {
      if (!verticesBefore.has(id)) {
        this.addedVertexIds.push(id);
      }
    }

    eventBus.emit('feature:added', { featureId: primaryId });
  }

  undo(): void {
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;

    // 元の全地物を復元
    for (const [fid, feature] of this.originalFeatures) {
      features.set(fid, feature);
    }

    // 結合で追加された頂点を削除
    for (const vid of this.addedVertexIds) {
      vertices.delete(vid);
    }
  }

  private createPolygonShape(
    polygons: readonly (readonly RingCoords[])[]
  ): FeatureShape & { type: 'Polygon' } {
    const mutableVertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const rings: Ring[] = [];
    const drafts: PolygonRingDraft[] = [];

    for (const polygon of polygons) {
      let territoryRingId: string | null = null;
      for (let i = 0; i < polygon.length; i++) {
        const coords = polygon[i];
        const ringId = this.createMergeRingId();
        if (i === 0) {
          territoryRingId = ringId;
          drafts.push({ id: ringId, coords, ringType: 'territory', parentId: null });
        } else {
          drafts.push({ id: ringId, coords, ringType: 'hole', parentId: territoryRingId });
        }
      }
    }

    for (const draft of this.rebuildTerritoryHierarchy(drafts)) {
      const vertexIds: string[] = [];
      for (const c of draft.coords) {
        const id = this.createMergeVertexId();
        const vertex = new Vertex(id, new Coordinate(c.x, c.y));
        mutableVertices.set(id, vertex);
        vertexIds.push(id);
      }
      rings.push(new Ring(draft.id, vertexIds, draft.ringType, draft.parentId));
    }

    return { type: 'Polygon', rings };
  }

  private rebuildTerritoryHierarchy(drafts: readonly PolygonRingDraft[]): PolygonRingDraft[] {
    const holes = drafts.filter((draft) => draft.ringType === 'hole');
    return drafts.map((draft) => {
      if (draft.ringType !== 'territory') {
        return draft;
      }

      const containingHole = holes
        .filter((hole) => isRingStrictlyInsideRing(draft.coords, hole.coords))
        .toSorted((a, b) => polygonArea(a.coords) - polygonArea(b.coords))[0];

      return containingHole
        ? { ...draft, parentId: containingHole.id }
        : draft;
    });
  }

  private createMergeVertexId(): string {
    return `v-merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private createMergeRingId(): string {
    return `ring-merge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  private resolvePolygonShapePolygons(
    shape: FeatureShape & { type: 'Polygon' },
    vertices: ReadonlyMap<string, Vertex>
  ): RingCoords[][] {
    const rings = shape.rings.map((ring) => ({
      ringId: ring.id,
      ringType: ring.ringType,
      parentId: ring.parentId,
      coords: ring.vertexIds.map((vertexId) => {
        const vertex = vertices.get(vertexId);
        return vertex ? { x: vertex.x, y: vertex.y } : { x: 0, y: 0 };
      }),
    }));

    const holesByParentId = new Map<string, RingCoords[]>();
    for (const ring of rings) {
      if (ring.ringType !== 'hole' || ring.parentId === null) continue;
      if (!holesByParentId.has(ring.parentId)) {
        holesByParentId.set(ring.parentId, []);
      }
      holesByParentId.get(ring.parentId)!.push(ring.coords);
    }

    return rings
      .filter((ring) => ring.ringType === 'territory')
      .map((ring) => [ring.coords, ...(holesByParentId.get(ring.ringId) ?? [])]);
  }
}

function isRingStrictlyInsideRing(inner: RingCoords, outer: RingCoords): boolean {
  return inner.length > 0 && inner.every((point) => isPointInPolygon(point.x, point.y, outer));
}
