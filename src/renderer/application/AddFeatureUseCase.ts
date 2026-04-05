/**
 * 地物追加ユースケース
 *
 * 要件定義書 §5.3.0: AddFeatureUseCase — 点・線・面の追加
 * 要件定義書 §2.3.2: 追加ツール仕様
 *
 * 頂点とFeatureAnchorを生成し、指定レイヤーに地物を追加する。
 * 追加後に feature:added イベントを発行する。
 */

import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import type { AnchorProperty, AnchorPlacement, FeatureShape, PolygonStyle } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { Vertex } from '@domain/entities/Vertex';
import { Feature } from '@domain/entities/Feature';
import type { FeatureType } from '@domain/entities/Feature';
import { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import { eventBus } from './EventBus';

/**
 * 地物・頂点を管理し、点・線・面の追加操作を提供する。
 */
export class AddFeatureUseCase {
  private features: Map<string, Feature> = new Map();
  private vertices: Map<string, Vertex> = new Map();
  private sharedVertexGroups: Map<string, SharedVertexGroup> = new Map();
  private nextFeatureNum = 1;
  private nextVertexNum = 1;
  private nextAnchorNum = 1;
  private nextRingNum = 1;

  /** 現在の全地物を取得する */
  getFeatures(): readonly Feature[] {
    return [...this.features.values()];
  }

  /** 現在の全頂点マップを取得する */
  getVertices(): ReadonlyMap<string, Vertex> {
    return this.vertices;
  }

  /** 現在の全地物マップを取得する */
  getFeaturesMap(): ReadonlyMap<string, Feature> {
    return this.features;
  }

  /** 現在の全共有頂点グループマップを取得する */
  getSharedVertexGroups(): ReadonlyMap<string, SharedVertexGroup> {
    return this.sharedVertexGroups;
  }

  /** IDで地物を取得する */
  getFeatureById(id: string): Feature | undefined {
    return this.features.get(id);
  }

  /** 保存データから状態を復元する */
  restore(
    features: ReadonlyMap<string, Feature>,
    vertices: ReadonlyMap<string, Vertex>,
    sharedVertexGroups?: ReadonlyMap<string, SharedVertexGroup>
  ): void {
    this.features = new Map(features);
    this.vertices = new Map(vertices);
    this.sharedVertexGroups = new Map(sharedVertexGroups ?? []);
    // ID採番カウンタを復元データの最大値以降に設定
    this.nextFeatureNum = this.computeNextNum(features.keys(), 'f-');
    this.nextVertexNum = this.computeNextNum(vertices.keys(), 'v-');
    this.nextAnchorNum = this.computeNextAnchorNum(features.values());
    this.nextRingNum = this.computeNextRingNum(features.values());
  }

  private computeNextNum(ids: IterableIterator<string>, prefix: string): number {
    let max = 0;
    for (const id of ids) {
      if (id.startsWith(prefix)) {
        const n = parseInt(id.slice(prefix.length), 10);
        if (!isNaN(n) && n > max) max = n;
      }
    }
    return max + 1;
  }

  private computeNextAnchorNum(features: IterableIterator<Feature>): number {
    let max = 0;
    for (const f of features) {
      for (const a of f.anchors) {
        if (a.id.startsWith('a-')) {
          const n = parseInt(a.id.slice(2), 10);
          if (!isNaN(n) && n > max) max = n;
        }
      }
    }
    return max + 1;
  }

  private computeNextRingNum(features: IterableIterator<Feature>): number {
    let max = 0;
    for (const f of features) {
      for (const a of f.anchors) {
        if (a.shape.type === 'Polygon') {
          for (const ring of a.shape.rings) {
            if (ring.id.startsWith('ring-')) {
              const n = parseInt(ring.id.slice(5), 10);
              if (!isNaN(n) && n > max) max = n;
            }
          }
        }
      }
    }
    return max + 1;
  }

  /**
   * 点情報を追加する
   * @param coord 配置座標
   * @param layerId 所属レイヤーID
   * @param currentTime 現在時刻（錨の開始時刻になる）
   * @param name 地物名（省略時は自動採番）
   */
  addPoint(
    coord: Coordinate,
    layerId: string,
    currentTime: TimePoint,
    name?: string
  ): Feature {
    const vertex = this.createVertex(coord);
    const shape: FeatureShape = { type: 'Point', vertexId: vertex.id };
    return this.createFeature('Point', shape, layerId, currentTime, name);
  }

  /**
   * 線情報を追加する
   * @param coords 頂点座標の配列（2点以上）
   * @param layerId 所属レイヤーID
   * @param currentTime 現在時刻
   * @param name 地物名（省略時は自動採番）
   */
  addLine(
    coords: readonly Coordinate[],
    layerId: string,
    currentTime: TimePoint,
    name?: string
  ): Feature {
    if (coords.length < 2) {
      throw new Error('線情報には2点以上の座標が必要です');
    }
    const vertexIds = coords.map((c) => this.createVertex(c).id);
    const shape: FeatureShape = { type: 'LineString', vertexIds };
    return this.createFeature('Line', shape, layerId, currentTime, name);
  }

  /**
   * 面情報を追加する（単一の外部リング）
   * @param coords 頂点座標の配列（3点以上）
   * @param layerId 所属レイヤーID
   * @param currentTime 現在時刻
   * @param name 地物名（省略時は自動採番）
   */
  addPolygon(
    coords: readonly Coordinate[],
    layerId: string,
    currentTime: TimePoint,
    name?: string,
    style?: PolygonStyle
  ): Feature {
    if (coords.length < 3) {
      throw new Error('面情報には3点以上の座標が必要です');
    }
    const vertexIds = coords.map((c) => this.createVertex(c).id);
    const ringId = `ring-${this.nextRingNum++}`;
    const ring = new Ring(ringId, vertexIds, 'territory', null);
    const shape: FeatureShape = { type: 'Polygon', rings: [ring] };
    return this.createFeature('Polygon', shape, layerId, currentTime, name, style ? { style } : undefined);
  }

  /**
   * 既存のFeatureShape（Polygon）から地物を追加する
   *
   * ナイフツール（分割）で生成された形状をそのまま地物として登録する。
   * 頂点は呼び出し側で事前にverticesマップに登録済みであること。
   */
  addPolygonFromShape(
    shape: FeatureShape & { type: 'Polygon' },
    layerId: string,
    currentTime: TimePoint,
    name?: string,
    style?: PolygonStyle
  ): Feature {
    return this.createFeature('Polygon', shape, layerId, currentTime, name, style ? { style } : undefined);
  }

  /** 頂点を生成して登録する */
  private createVertex(coord: Coordinate): Vertex {
    const id = `v-${this.nextVertexNum++}`;
    const vertex = new Vertex(id, coord.clampLatitude());
    this.vertices.set(id, vertex);
    return vertex;
  }

  /** 地物を生成して登録し、イベントを発行する */
  private createFeature(
    featureType: FeatureType,
    shape: FeatureShape,
    layerId: string,
    currentTime: TimePoint,
    name?: string,
    propertyPatch?: Partial<AnchorProperty>
  ): Feature {
    const featureId = `f-${this.nextFeatureNum++}`;
    const anchorId = `a-${this.nextAnchorNum++}`;

    const typeLabel =
      featureType === 'Point' ? '点' :
      featureType === 'Line' ? '線' : '面';
    const featureName = name ?? `${typeLabel}${this.nextFeatureNum - 1}`;

    const property: AnchorProperty = {
      name: featureName,
      description: '',
      ...propertyPatch,
    };

    const placement: AnchorPlacement = {
      layerId,
      parentId: null,
      childIds: [],
    };

    const anchor = new FeatureAnchor(
      anchorId,
      { start: currentTime },
      property,
      shape,
      placement
    );

    const feature = new Feature(featureId, featureType, [anchor]);
    this.features.set(featureId, feature);

    eventBus.emit('feature:added', { featureId });
    return feature;
  }
}
