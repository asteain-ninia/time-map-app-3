/**
 * レイヤー管理ユースケース
 *
 * 要件定義書 §2.1:
 * - レイヤーは序列を持ち、この順序は固定。
 * - レイヤーの表示/非表示を個別に切り替え可能。
 * - 各レイヤーには一意の識別子と名前がある。
 */

import { Layer } from '@domain/entities/Layer';
import type { Feature } from '@domain/entities/Feature';
import { eventBus } from './EventBus';

/**
 * レイヤーの追加・表示切替・透明度変更・名前変更を管理するユースケース。
 * レイヤー一覧をリアクティブに公開し、変更時にイベントバスで通知する。
 */
export class ManageLayersUseCase {
  private layers: Layer[] = [];
  private nextOrder = 0;

  /** 現在のレイヤー一覧を序列順で取得する */
  getLayers(): readonly Layer[] {
    return this.layers;
  }

  /** IDでレイヤーを取得する */
  getLayerById(id: string): Layer | undefined {
    return this.layers.find(l => l.id === id);
  }

  /** レイヤーを追加する */
  addLayer(id: string, name: string): Layer {
    const layer = new Layer(id, name, this.nextOrder++);
    this.layers.push(layer);
    eventBus.emit('layers:changed', {});
    return layer;
  }

  /** レイヤーの表示/非表示を切り替える */
  toggleVisibility(layerId: string): void {
    const idx = this.layers.findIndex(l => l.id === layerId);
    if (idx === -1) return;
    const layer = this.layers[idx];
    this.layers[idx] = layer.withVisible(!layer.visible);
    eventBus.emit('layer:visibilityChanged', {
      layerId,
      visible: this.layers[idx].visible,
    });
    eventBus.emit('layers:changed', {});
  }

  /** レイヤーの透明度を変更する */
  setOpacity(layerId: string, opacity: number): void {
    const idx = this.layers.findIndex(l => l.id === layerId);
    if (idx === -1) return;
    const clamped = Math.max(0, Math.min(1, opacity));
    this.layers[idx] = this.layers[idx].withOpacity(clamped);
    eventBus.emit('layers:changed', {});
  }

  /** 保存データから状態を復元する */
  restore(layers: readonly Layer[]): void {
    this.layers = [...layers];
    let maxOrder = 0;
    for (const l of layers) {
      if (l.order >= maxOrder) maxOrder = l.order + 1;
    }
    this.nextOrder = maxOrder;
    eventBus.emit('layers:changed', {});
  }

  /** レイヤー名を変更する */
  rename(layerId: string, name: string): void {
    const idx = this.layers.findIndex(l => l.id === layerId);
    if (idx === -1) return;
    this.layers[idx] = this.layers[idx].withName(name);
    eventBus.emit('layers:changed', {});
  }

  /**
   * レイヤーを削除する
   *
   * §2.1: 全時刻を通じてそのレイヤーに所属する地物が存在しない場合にのみ許可
   *
   * @param layerId 削除対象のレイヤーID
   * @param allFeatures 全地物（レイヤー所属チェック用）
   * @returns 削除成功時 true、地物が所属していて削除不可の場合 false
   */
  deleteLayer(layerId: string, allFeatures: readonly Feature[]): boolean {
    const idx = this.layers.findIndex(l => l.id === layerId);
    if (idx === -1) return false;

    // 全時刻を通じてレイヤーに所属する地物がないことを確認
    const hasFeatures = allFeatures.some(f =>
      f.anchors.some(a => a.placement.layerId === layerId)
    );
    if (hasFeatures) return false;

    this.layers.splice(idx, 1);
    eventBus.emit('layers:changed', {});
    return true;
  }
}
