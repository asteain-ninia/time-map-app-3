/**
 * 頂点編集ユースケース
 *
 * §2.3.3.2: 頂点の移動・追加・削除
 * §5.3.0: VertexEditUseCase — 頂点の編集操作
 *
 * 頂点の移動はVertex座標を更新し、
 * 追加・削除はFeatureAnchorの形状（vertexIds/rings）を更新する。
 * 衝突判定（エッジ滑り等）はフェーズ4で実装。
 */

import { Coordinate } from '@domain/value-objects/Coordinate';
import { Vertex } from '@domain/entities/Vertex';
import { Feature } from '@domain/entities/Feature';
import { FeatureAnchor, type FeatureShape } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import { eventBus } from './EventBus';

/** 頂点編集エラー */
export class VertexEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VertexEditError';
  }
}

export class VertexEditUseCase {
  constructor(private readonly featureUseCase: AddFeatureUseCase) {}

  /**
   * 頂点を移動する
   * §2.3.3.2: 選択した頂点をドラッグして移動する
   */
  moveVertex(vertexId: string, newCoordinate: Coordinate): void {
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const vertex = vertices.get(vertexId);
    if (!vertex) {
      throw new VertexEditError(`Vertex "${vertexId}" not found`);
    }
    const updated = vertex.withCoordinate(newCoordinate.clampLatitude());
    vertices.set(vertexId, updated);
  }

  /**
   * 線地物のエッジに頂点を挿入する
   * §2.3.3.2: エッジハンドル操作で新しい頂点を追加
   *
   * @param featureId 対象地物ID
   * @param currentTime 現在時刻（アクティブな錨を特定）
   * @param edgeIndex 挿入先エッジのインデックス（vertexIds[edgeIndex]とvertexIds[edgeIndex+1]の間）
   * @param coordinate 新頂点の座標
   * @returns 挿入された頂点のID
   */
  insertVertexOnLine(
    featureId: string,
    currentTime: TimePoint,
    edgeIndex: number,
    coordinate: Coordinate
  ): string {
    const feature = this.featureUseCase.getFeatureById(featureId);
    if (!feature) throw new VertexEditError(`Feature "${featureId}" not found`);
    if (feature.featureType !== 'Line') {
      throw new VertexEditError(`Feature "${featureId}" is not a Line`);
    }

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) throw new VertexEditError(`No active anchor at current time`);
    if (anchor.shape.type !== 'LineString') {
      throw new VertexEditError(`Anchor shape is not LineString`);
    }

    const vertexIds = [...anchor.shape.vertexIds];
    if (edgeIndex < 0 || edgeIndex >= vertexIds.length - 1) {
      throw new VertexEditError(`Edge index ${edgeIndex} out of range`);
    }

    // 新頂点を作成
    const newVertexId = this.createVertex(coordinate);

    // vertexIds に挿入
    vertexIds.splice(edgeIndex + 1, 0, newVertexId);
    const newShape: FeatureShape = { type: 'LineString', vertexIds };
    const newAnchor = anchor.withShape(newShape);

    this.updateFeatureAnchor(feature, anchor.id, newAnchor);
    return newVertexId;
  }

  /**
   * ポリゴン地物のリングエッジに頂点を挿入する
   *
   * @param featureId 対象地物ID
   * @param currentTime 現在時刻
   * @param ringId 対象リングID
   * @param edgeIndex 挿入先エッジのインデックス
   * @param coordinate 新頂点の座標
   * @returns 挿入された頂点のID
   */
  insertVertexOnPolygon(
    featureId: string,
    currentTime: TimePoint,
    ringId: string,
    edgeIndex: number,
    coordinate: Coordinate
  ): string {
    const feature = this.featureUseCase.getFeatureById(featureId);
    if (!feature) throw new VertexEditError(`Feature "${featureId}" not found`);
    if (feature.featureType !== 'Polygon') {
      throw new VertexEditError(`Feature "${featureId}" is not a Polygon`);
    }

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) throw new VertexEditError(`No active anchor at current time`);
    if (anchor.shape.type !== 'Polygon') {
      throw new VertexEditError(`Anchor shape is not Polygon`);
    }

    const ringIndex = anchor.shape.rings.findIndex(r => r.id === ringId);
    if (ringIndex === -1) throw new VertexEditError(`Ring "${ringId}" not found`);

    const ring = anchor.shape.rings[ringIndex];
    const vertexIds = [...ring.vertexIds];

    // ポリゴンのエッジは閉じている（最後の頂点→最初の頂点もエッジ）
    if (edgeIndex < 0 || edgeIndex >= vertexIds.length) {
      throw new VertexEditError(`Edge index ${edgeIndex} out of range`);
    }

    const newVertexId = this.createVertex(coordinate);

    // 最後のエッジ（最終頂点→最初の頂点）の場合は末尾に追加
    if (edgeIndex === vertexIds.length - 1) {
      vertexIds.push(newVertexId);
    } else {
      vertexIds.splice(edgeIndex + 1, 0, newVertexId);
    }

    const newRing = new Ring(ring.id, vertexIds, ring.ringType, ring.parentId);
    const newRings = [...anchor.shape.rings];
    newRings[ringIndex] = newRing;

    const newShape: FeatureShape = { type: 'Polygon', rings: newRings };
    const newAnchor = anchor.withShape(newShape);

    this.updateFeatureAnchor(feature, anchor.id, newAnchor);
    return newVertexId;
  }

  /**
   * 線地物から頂点を削除する
   * §2.3.3.2: 2点未満になった場合、線自体が削除される
   *
   * @returns 地物が削除された場合 true
   */
  deleteVertexFromLine(
    featureId: string,
    currentTime: TimePoint,
    vertexId: string
  ): boolean {
    const feature = this.featureUseCase.getFeatureById(featureId);
    if (!feature) throw new VertexEditError(`Feature "${featureId}" not found`);
    if (feature.featureType !== 'Line') {
      throw new VertexEditError(`Feature "${featureId}" is not a Line`);
    }

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) throw new VertexEditError(`No active anchor at current time`);
    if (anchor.shape.type !== 'LineString') {
      throw new VertexEditError(`Anchor shape is not LineString`);
    }

    const idx = anchor.shape.vertexIds.indexOf(vertexId);
    if (idx === -1) throw new VertexEditError(`Vertex "${vertexId}" not in this line`);

    const newVertexIds = anchor.shape.vertexIds.filter(id => id !== vertexId);

    // §2.3.3.2: 2点未満になった場合、線自体が削除される
    if (newVertexIds.length < 2) {
      this.deleteFeature(featureId);
      return true;
    }

    const newShape: FeatureShape = { type: 'LineString', vertexIds: newVertexIds };
    const newAnchor = anchor.withShape(newShape);
    this.updateFeatureAnchor(feature, anchor.id, newAnchor);
    return false;
  }

  /**
   * ポリゴン地物のリングから頂点を削除する
   * §2.3.3.2: 3点未満になった場合、面自体が削除される
   *
   * @returns 地物が削除された場合 true
   */
  deleteVertexFromPolygon(
    featureId: string,
    currentTime: TimePoint,
    ringId: string,
    vertexId: string
  ): boolean {
    const feature = this.featureUseCase.getFeatureById(featureId);
    if (!feature) throw new VertexEditError(`Feature "${featureId}" not found`);
    if (feature.featureType !== 'Polygon') {
      throw new VertexEditError(`Feature "${featureId}" is not a Polygon`);
    }

    const anchor = feature.getActiveAnchor(currentTime);
    if (!anchor) throw new VertexEditError(`No active anchor at current time`);
    if (anchor.shape.type !== 'Polygon') {
      throw new VertexEditError(`Anchor shape is not Polygon`);
    }

    const ringIndex = anchor.shape.rings.findIndex(r => r.id === ringId);
    if (ringIndex === -1) throw new VertexEditError(`Ring "${ringId}" not found`);

    const ring = anchor.shape.rings[ringIndex];
    const idx = ring.vertexIds.indexOf(vertexId);
    if (idx === -1) throw new VertexEditError(`Vertex "${vertexId}" not in ring "${ringId}"`);

    const newVertexIds = ring.vertexIds.filter(id => id !== vertexId);

    // §2.3.3.2: 3点未満になった場合
    if (newVertexIds.length < 3) {
      // メインリング（territory）の場合は面自体を削除
      if (ring.ringType === 'territory' && ring.parentId === null) {
        this.deleteFeature(featureId);
        return true;
      }
      // サブリング（hole）の場合はそのリングだけ削除
      const newRings = anchor.shape.rings.filter(r => r.id !== ringId);
      const newShape: FeatureShape = { type: 'Polygon', rings: newRings };
      const newAnchor = anchor.withShape(newShape);
      this.updateFeatureAnchor(feature, anchor.id, newAnchor);
      return false;
    }

    const newRing = new Ring(ring.id, newVertexIds, ring.ringType, ring.parentId);
    const newRings = [...anchor.shape.rings];
    newRings[ringIndex] = newRing;

    const newShape: FeatureShape = { type: 'Polygon', rings: newRings };
    const newAnchor = anchor.withShape(newShape);
    this.updateFeatureAnchor(feature, anchor.id, newAnchor);
    return false;
  }

  /** 新頂点を作成してVerticesマップに登録する */
  private createVertex(coordinate: Coordinate): string {
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const id = `v-edit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const vertex = new Vertex(id, coordinate.clampLatitude());
    vertices.set(id, vertex);
    return id;
  }

  /** 地物のアンカーを更新する */
  private updateFeatureAnchor(
    feature: Feature,
    anchorId: string,
    newAnchor: FeatureAnchor
  ): void {
    const newAnchors = feature.anchors.map(a =>
      a.id === anchorId ? newAnchor : a
    );
    const updatedFeature = feature.withAnchors(newAnchors);
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    features.set(feature.id, updatedFeature);
    eventBus.emit('feature:added', { featureId: feature.id });
  }

  /** 地物を削除する */
  private deleteFeature(featureId: string): void {
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    features.delete(featureId);
    eventBus.emit('feature:removed', { featureId });
  }
}
