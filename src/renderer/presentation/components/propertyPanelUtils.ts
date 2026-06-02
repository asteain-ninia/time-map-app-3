import type { Feature } from '@domain/entities/Feature';
import type {
  AnchorProperty,
  FeatureAnchor,
  PolygonStyle,
} from '@domain/value-objects/FeatureAnchor';

/**
 * 面情報（末端ポリゴン・集約地物の双方）かどうかを判定する。
 *
 * PropertyPanel は sceneEntries を介さず `Feature` を直接受け取るため、
 * 現状.md §6.10 Phase 2.5-D / 開発ガイド §6.6.9「判定をデータ側に寄せる」に従い、
 * `feature.featureType === 'Polygon'` を polygon-like の判定基準とする。
 * これにより shape を持たない集約地物（コンテナ）も leaf polygon と同じ経路で
 * 親子・面スタイルのセクションを表示できる（要件定義書 §4.1: style は面情報のみ保持）。
 */
export function isPolygonLikeFeature(feature: Feature | null): boolean {
  return feature?.featureType === 'Polygon';
}

/**
 * 編集フォームの値から更新後の `AnchorProperty` を構築する。
 *
 * 面情報（leaf polygon / コンテナ）のときのみフォームの面スタイルを採用し、
 * 点情報・線情報では既存の `style`（通常 undefined）を保持する。
 * テンプレート側のセクション表示ゲートと同一の `isPolygonLikeFeature` を共有することで、
 * 「スタイル UI は表示されるが保存されない」対概念ドリフト（開発ガイド §6.0.1 検出観点2）を防ぐ。
 */
export function buildUpdatedAnchorProperty(
  feature: Feature,
  anchor: FeatureAnchor,
  form: {
    readonly name: string;
    readonly description: string;
    readonly style: PolygonStyle;
  }
): AnchorProperty {
  const style = isPolygonLikeFeature(feature) ? form.style : anchor.property.style;
  return {
    ...anchor.property,
    name: form.name,
    description: form.description,
    style,
  };
}
