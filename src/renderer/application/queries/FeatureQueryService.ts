import type { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import type { Feature } from '@domain/entities/Feature';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { Vertex } from '@domain/entities/Vertex';

/**
 * 地物関連の読み取り専用クエリ。
 *
 * UI から AddFeatureUseCase の内部状態へ直接アクセスさせず、
 * 読み取り経路を明示的に分離する。
 */
export class FeatureQueryService {
  constructor(private readonly addFeature: AddFeatureUseCase) {}

  getFeatures(): readonly Feature[] {
    return this.addFeature.getFeatures();
  }

  getFeatureById(featureId: string): Feature | undefined {
    return this.addFeature.getFeatureById(featureId);
  }

  getVertices(): ReadonlyMap<string, Vertex> {
    return new Map(this.addFeature.getVertices());
  }

  getSharedVertexGroups(): ReadonlyMap<string, SharedVertexGroup> {
    return new Map(this.addFeature.getSharedVertexGroups());
  }
}
