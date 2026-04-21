/**
 * 型安全なイベントバス
 *
 * 技術方針 §2.3: ドメイン状態の変更はイベントバスで通知し、
 * コンポーネント間の直接参照を避け疎結合を維持する。
 *
 * 開発ガイド §6.1.4 の教訓:
 * 共有リソースを更新したら依存する全コンポーネントに変更を通知する。
 */

import type { TimePoint } from '@domain/value-objects';

// --- イベント型定義 ---

/** ビューポートのカーソル位置変更 */
export interface CursorMovedEvent {
  lon: number;
  lat: number;
}

/** ビューポートからカーソルが離脱 */
export type CursorLeftEvent = Record<string, never>;

/** ズームレベル変更 */
export interface ZoomChangedEvent {
  zoom: number;
}

/** 現在時刻変更 */
export interface TimeChangedEvent {
  time: TimePoint;
}

/** レイヤー表示切替 */
export interface LayerVisibilityChangedEvent {
  layerId: string;
  visible: boolean;
}

/** レイヤー一覧変更 */
export type LayersChangedEvent = Record<string, never>;

/** 地物追加 */
export interface FeatureAddedEvent {
  featureId: string;
}

/** 地物削除 */
export interface FeatureRemovedEvent {
  featureId: string;
}

/** ワールド読み込み完了 */
export interface WorldLoadedEvent {
  filePath: string;
  compatibilityWarnings: readonly string[];
}

/** ワールド保存完了 */
export interface WorldSavedEvent {
  filePath: string;
}

/** イベントマップ: イベント名と型の対応 */
export interface EventMap {
  'cursor:moved': CursorMovedEvent;
  'cursor:left': CursorLeftEvent;
  'viewport:zoomChanged': ZoomChangedEvent;
  'time:changed': TimeChangedEvent;
  'layer:visibilityChanged': LayerVisibilityChangedEvent;
  'layers:changed': LayersChangedEvent;
  'feature:added': FeatureAddedEvent;
  'feature:removed': FeatureRemovedEvent;
  'world:loaded': WorldLoadedEvent;
  'world:saved': WorldSavedEvent;
}

export type EventName = keyof EventMap;
type Listener<E> = (event: E) => void;

/**
 * 型安全なイベントバス
 * シングルトンとして使用し、アプリケーション全体のイベント通知を担う。
 */
export class EventBus {
  private listeners = new Map<EventName, Set<Listener<unknown>>>();

  /** イベントリスナーを登録する。解除関数を返す */
  on<K extends EventName>(event: K, listener: Listener<EventMap[K]>): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    const set = this.listeners.get(event)!;
    set.add(listener as Listener<unknown>);

    return () => {
      set.delete(listener as Listener<unknown>);
      if (set.size === 0) {
        this.listeners.delete(event);
      }
    };
  }

  /** イベントを発行する */
  emit<K extends EventName>(event: K, data: EventMap[K]): void {
    const set = this.listeners.get(event);
    if (!set) return;
    for (const listener of set) {
      listener(data);
    }
  }

  /** 特定イベントの全リスナーを解除する */
  offAll(event: EventName): void {
    this.listeners.delete(event);
  }

  /** 全イベントの全リスナーを解除する */
  clear(): void {
    this.listeners.clear();
  }
}

/** アプリケーション全体で共有するイベントバスインスタンス */
export const eventBus = new EventBus();
