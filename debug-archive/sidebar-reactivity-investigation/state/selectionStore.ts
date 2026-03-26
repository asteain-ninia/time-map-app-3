/**
 * 選択状態の共有ストア
 *
 * Svelte store (writable) を使い、App と Sidebar 間で選択状態を共有する。
 * .svelte.ts の $state ルーンは dev server でシグナルランタイムが分離する問題があるため、
 * ランタイム非依存な writable store を使用。
 */
import { writable } from 'svelte/store';

export const selectedFeatureId$ = writable<string | null>(null);
