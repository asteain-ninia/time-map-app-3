/**
 * 歴史の錨の更新ユースケース
 *
 * §2.2.4: 歴史の錨の追加・編集・削除
 * §5.3.0: UpdateFeatureAnchorUseCase — 歴史の錨の更新
 *
 * 地物の時間的変遷を管理する。各地物は複数の錨を持ち、
 * 各錨がある時間範囲における地物の完全状態を表す。
 */

import { Feature } from '@domain/entities/Feature';
import {
  FeatureAnchor,
  type AnchorProperty,
  type FeatureShape,
  type AnchorPlacement,
  type TimeRange,
} from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import { eventBus } from './EventBus';

/** 錨更新エラー */
export class AnchorEditError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnchorEditError';
  }
}

export class UpdateFeatureAnchorUseCase {
  constructor(private readonly featureUseCase: AddFeatureUseCase) {}

  /**
   * 地物に新しい錨を追加する
   * §2.2.4: 現在時刻で新しい時間スナップショットを作成
   *
   * 既存の錨の終了時刻を調整し、新しい錨を挿入する。
   * 新しい錨は既存の錨の状態をコピーして作成される。
   *
   * @param featureId 対象地物ID
   * @param splitTime 分割時刻（新しい錨の開始時刻）
   * @returns 作成された新しい錨
   */
  addAnchor(featureId: string, splitTime: TimePoint): FeatureAnchor {
    const feature = this.getFeatureOrThrow(featureId);

    // 分割時刻でアクティブな錨を取得
    const activeAnchor = feature.getActiveAnchor(splitTime);
    if (!activeAnchor) {
      throw new AnchorEditError(
        `No active anchor at time ${splitTime.toString()} for feature "${featureId}"`
      );
    }

    // 分割時刻が既存の錨の開始時刻と同じなら重複
    if (activeAnchor.timeRange.start.equals(splitTime)) {
      throw new AnchorEditError(
        `An anchor already starts at time ${splitTime.toString()}`
      );
    }

    // 既存の錨の終了時刻を分割時刻に設定
    const updatedExisting = activeAnchor.withTimeRange({
      start: activeAnchor.timeRange.start,
      end: splitTime,
    });

    // 新しい錨を作成（形状・配置はコピー、開始時刻=splitTime、終了=既存の終了時刻）
    const newAnchorId = `a-split-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newAnchor = new FeatureAnchor(
      newAnchorId,
      { start: splitTime, end: activeAnchor.timeRange.end },
      { ...activeAnchor.property },
      activeAnchor.shape,
      activeAnchor.placement
    );

    // 錨リストを更新（時系列順を維持）
    const newAnchors = feature.anchors.map(a =>
      a.id === activeAnchor.id ? updatedExisting : a
    );
    // 分割された既存錨の直後に新しい錨を挿入
    const insertIdx = newAnchors.findIndex(a => a.id === updatedExisting.id) + 1;
    newAnchors.splice(insertIdx, 0, newAnchor);

    this.updateFeature(feature.withAnchors(newAnchors));
    return newAnchor;
  }

  /**
   * 錨のプロパティを更新する
   * §2.2.4: 歴史の錨の属性編集
   */
  updateProperty(
    featureId: string,
    anchorId: string,
    property: AnchorProperty
  ): void {
    const feature = this.getFeatureOrThrow(featureId);
    const anchor = this.getAnchorOrThrow(feature, anchorId);
    const updated = anchor.withProperty(property);
    this.replaceAnchor(feature, anchorId, updated);
  }

  /**
   * 錨の時間範囲を更新する
   * §2.2.4: 錨境界編集（開始/終了時刻変更）
   */
  updateTimeRange(
    featureId: string,
    anchorId: string,
    timeRange: TimeRange
  ): void {
    const feature = this.getFeatureOrThrow(featureId);
    const anchor = this.getAnchorOrThrow(feature, anchorId);

    // 終了が開始より前でないことを検証
    if (timeRange.end && timeRange.end.isBefore(timeRange.start)) {
      throw new AnchorEditError('End time cannot be before start time');
    }

    const updated = anchor.withTimeRange(timeRange);
    this.replaceAnchor(feature, anchorId, updated);
  }

  /**
   * 錨の形状を更新する
   */
  updateShape(
    featureId: string,
    anchorId: string,
    shape: FeatureShape
  ): void {
    const feature = this.getFeatureOrThrow(featureId);
    const anchor = this.getAnchorOrThrow(feature, anchorId);
    const updated = anchor.withShape(shape);
    this.replaceAnchor(feature, anchorId, updated);
  }

  /**
   * 錨の配置を更新する
   */
  updatePlacement(
    featureId: string,
    anchorId: string,
    placement: AnchorPlacement
  ): void {
    const feature = this.getFeatureOrThrow(featureId);
    const anchor = this.getAnchorOrThrow(feature, anchorId);
    const updated = anchor.withPlacement(placement);
    this.replaceAnchor(feature, anchorId, updated);
  }

  /**
   * 錨を削除する
   * 地物の最後の錨を削除すると地物自体が削除される
   */
  deleteAnchor(featureId: string, anchorId: string): boolean {
    const feature = this.getFeatureOrThrow(featureId);
    this.getAnchorOrThrow(feature, anchorId);

    const newAnchors = feature.anchors.filter(a => a.id !== anchorId);

    if (newAnchors.length === 0) {
      // 最後の錨 → 地物削除
      const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
      features.delete(featureId);
      eventBus.emit('feature:removed', { featureId });
      return true;
    }

    this.updateFeature(feature.withAnchors(newAnchors));
    return false;
  }

  /** 地物の全錨を取得する */
  getAnchors(featureId: string): readonly FeatureAnchor[] {
    const feature = this.getFeatureOrThrow(featureId);
    return feature.anchors;
  }

  private getFeatureOrThrow(featureId: string): Feature {
    const feature = this.featureUseCase.getFeatureById(featureId);
    if (!feature) throw new AnchorEditError(`Feature "${featureId}" not found`);
    return feature;
  }

  private getAnchorOrThrow(feature: Feature, anchorId: string): FeatureAnchor {
    const anchor = feature.anchors.find(a => a.id === anchorId);
    if (!anchor) {
      throw new AnchorEditError(`Anchor "${anchorId}" not found in feature "${feature.id}"`);
    }
    return anchor;
  }

  private replaceAnchor(feature: Feature, anchorId: string, newAnchor: FeatureAnchor): void {
    const newAnchors = feature.anchors.map(a =>
      a.id === anchorId ? newAnchor : a
    );
    this.updateFeature(feature.withAnchors(newAnchors));
  }

  private updateFeature(feature: Feature): void {
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    features.set(feature.id, feature);
    eventBus.emit('feature:added', { featureId: feature.id });
  }
}
