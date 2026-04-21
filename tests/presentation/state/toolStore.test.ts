import { describe, it, expect, vi, afterEach } from 'vitest';
import { createToolStore } from '@presentation/state/toolStore';
import { Coordinate } from '@domain/value-objects/Coordinate';

describe('createToolStore', () => {
  let store: ReturnType<typeof createToolStore>;

  afterEach(() => {
    store?.stop();
  });

  describe('getSnapshot', () => {
    it('初期状態はviewモード', () => {
      store = createToolStore();
      const snap = store.getSnapshot();
      expect(snap.mode).toBe('view');
      expect(snap.isDrawing).toBe(false);
      expect(snap.isPanning).toBe(false);
      expect(snap.addToolType).toBe('polygon');
      expect(snap.drawingCoords).toEqual([]);
    });

    it('モード変更後のスナップショットが正しい', () => {
      store = createToolStore();
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      expect(store.getSnapshot().mode).toBe('add');
    });

    it('描画開始でisDrawingがtrueになる', () => {
      store = createToolStore();
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      expect(store.getSnapshot().isDrawing).toBe(true);
    });

    it('パン中はisPanningがtrueになる', () => {
      store = createToolStore();
      store.send({ type: 'PAN_START' });
      expect(store.getSnapshot().isPanning).toBe(true);
      store.send({ type: 'PAN_END' });
      expect(store.getSnapshot().isPanning).toBe(false);
    });

    it('追加モードのパンでもisPanningがtrueになる', () => {
      store = createToolStore();
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'PAN_START' });
      expect(store.getSnapshot().isPanning).toBe(true);
    });

    it('ツール種別変更がスナップショットに反映される', () => {
      store = createToolStore();
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      expect(store.getSnapshot().addToolType).toBe('line');
    });

    it('描画中の座標がスナップショットに反映される', () => {
      store = createToolStore();
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 20) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(30, 40) });
      const coords = store.getSnapshot().drawingCoords;
      expect(coords).toHaveLength(2);
      expect(coords[0].x).toBe(10);
      expect(coords[1].x).toBe(30);
    });
  });

  describe('onShapeConfirmed コールバック', () => {
    it('面ツールでCONFIRM時にコールバックが呼ばれる', () => {
      const cb = vi.fn();
      store = createToolStore(cb);
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 0) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });
      store.send({ type: 'CONFIRM' });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('polygon', expect.any(Array));
      expect(cb.mock.calls[0][1]).toHaveLength(3);
    });

    it('線ツールでダブルクリック確定時にコールバックが呼ばれる', () => {
      const cb = vi.fn();
      store = createToolStore(cb);
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });
      store.send({ type: 'MAP_DOUBLE_CLICK', coord: new Coordinate(10, 10) });

      expect(cb).toHaveBeenCalledTimes(1);
      expect(cb).toHaveBeenCalledWith('line', expect.any(Array));
    });

    it('ESCキャンセル時にはコールバックが呼ばれない', () => {
      const cb = vi.fn();
      store = createToolStore(cb);
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 0) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });
      store.send({ type: 'KEY_ESCAPE' });

      expect(cb).not.toHaveBeenCalled();
    });

    it('プロジェクト読み込み用リセット時には描画座標を破棄してコールバックを呼ばない', () => {
      const cb = vi.fn();
      store = createToolStore(cb);
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 0) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });

      store.send({ type: 'RESET_INTERACTION' });

      const snap = store.getSnapshot();
      expect(snap.mode).toBe('add');
      expect(snap.isDrawing).toBe(false);
      expect(snap.drawingCoords).toEqual([]);
      expect(cb).not.toHaveBeenCalled();
    });

    it('モード切替時にはコールバックが呼ばれない', () => {
      const cb = vi.fn();
      store = createToolStore(cb);
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 0) });
      store.send({ type: 'MODE_CHANGE', mode: 'view' });

      expect(cb).not.toHaveBeenCalled();
    });

    it('頂点不足で確定できない場合はコールバックが呼ばれない', () => {
      const cb = vi.fn();
      store = createToolStore(cb);
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 0) });
      // ポリゴンは3点必要だが2点でCONFIRM → 遷移しない → コールバックなし
      store.send({ type: 'CONFIRM' });

      expect(cb).not.toHaveBeenCalled();
    });

    it('コールバック未指定でもエラーにならない', () => {
      store = createToolStore();
      store.send({ type: 'MODE_CHANGE', mode: 'add' });
      store.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      store.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });
      expect(() => {
        store.send({ type: 'CONFIRM' });
      }).not.toThrow();
    });
  });

  describe('send', () => {
    it('イベント送信で状態が変化する', () => {
      store = createToolStore();
      expect(store.getSnapshot().mode).toBe('view');
      store.send({ type: 'MODE_CHANGE', mode: 'edit' });
      expect(store.getSnapshot().mode).toBe('edit');
    });
  });

  describe('stop', () => {
    it('停止後もエラーにならない', () => {
      store = createToolStore();
      store.stop();
      // 停止後の操作は無視される（エラーにはならない）
      expect(() => store.getSnapshot()).not.toThrow();
    });
  });
});
