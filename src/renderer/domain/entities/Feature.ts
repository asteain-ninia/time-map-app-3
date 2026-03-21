import { FeatureAnchor } from '../value-objects/FeatureAnchor';
import type { TimePoint } from '../value-objects/TimePoint';

/** 地物の種別 */
export type FeatureType = 'Point' | 'Line' | 'Polygon';

/**
 * 地物エンティティ
 * 全ての地理オブジェクトの基底。歴史の錨のリストで経時的状態を管理する。
 */
export class Feature {
  readonly id: string;
  readonly featureType: FeatureType;
  readonly anchors: readonly FeatureAnchor[];

  constructor(
    id: string,
    featureType: FeatureType,
    anchors: readonly FeatureAnchor[]
  ) {
    this.id = id;
    this.featureType = featureType;
    this.anchors = anchors;
  }

  /** 指定時間点で有効な錨を取得 */
  getActiveAnchor(time: TimePoint): FeatureAnchor | undefined {
    for (let i = this.anchors.length - 1; i >= 0; i--) {
      if (this.anchors[i].isActiveAt(time)) {
        return this.anchors[i];
      }
    }
    return undefined;
  }

  /** 指定時間点でこの地物が存在するか */
  existsAt(time: TimePoint): boolean {
    return this.getActiveAnchor(time) !== undefined;
  }

  /** 指定時間点での名前を取得 */
  getNameAt(time: TimePoint): string | undefined {
    return this.getActiveAnchor(time)?.property.name;
  }

  withAnchors(anchors: readonly FeatureAnchor[]): Feature {
    return new Feature(this.id, this.featureType, anchors);
  }
}
