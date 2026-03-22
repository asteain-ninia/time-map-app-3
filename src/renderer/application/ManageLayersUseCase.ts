/**
 * レイヤー管理ユースケース
 *
 * 要件定義書 §2.1:
 * - レイヤーは序列を持ち、この順序は固定。
 * - レイヤーの表示/非表示を個別に切り替え可能。
 * - 各レイヤーには一意の識別子と名前がある。
 */

import { Layer } from '@domain/entities/Layer';
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
  }

  /** レイヤーの透明度を変更する */
  setOpacity(layerId: string, opacity: number): void {
    const idx = this.layers.findIndex(l => l.id === layerId);
    if (idx === -1) return;
    const clamped = Math.max(0, Math.min(1, opacity));
    this.layers[idx] = this.layers[idx].withOpacity(clamped);
  }

  /** 保存データから状態を復元する */
  restore(layers: readonly Layer[]): void {
    this.layers = [...layers];
    let maxOrder = 0;
    for (const l of layers) {
      if (l.order >= maxOrder) maxOrder = l.order + 1;
    }
    this.nextOrder = maxOrder;
  }

  /** レイヤー名を変更する */
  rename(layerId: string, name: string): void {
    const idx = this.layers.findIndex(l => l.id === layerId);
    if (idx === -1) return;
    this.layers[idx] = this.layers[idx].withName(name);
  }
}
