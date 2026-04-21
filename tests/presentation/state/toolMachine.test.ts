import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { toolMachine } from '@presentation/state/toolMachine';
import { Coordinate } from '@domain/value-objects/Coordinate';

/** アクターを作成して開始する */
function startActor() {
  const actor = createActor(toolMachine);
  actor.start();
  return actor;
}

describe('toolMachine', () => {
  describe('初期状態', () => {
    it('表示モードのidleで開始する', () => {
      const actor = startActor();
      expect(actor.getSnapshot().value).toEqual({ view: 'idle' });
      actor.stop();
    });

    it('初期コンテキストが正しい', () => {
      const actor = startActor();
      const ctx = actor.getSnapshot().context;
      expect(ctx.addToolType).toBe('polygon');
      expect(ctx.drawingCoords).toEqual([]);
      actor.stop();
    });
  });

  describe('モード切替', () => {
    it('表示→追加モードに切り替えられる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      expect(actor.getSnapshot().value).toEqual({ add: 'idle' });
      actor.stop();
    });

    it('表示→編集モードに切り替えられる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'edit' });
      expect(actor.getSnapshot().value).toEqual({ edit: 'idle' });
      actor.stop();
    });

    it('表示→測量モードに切り替えられる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'measure' });
      expect(actor.getSnapshot().value).toEqual({ measure: 'idle' });
      actor.stop();
    });

    it('追加→表示モードに戻れる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'MODE_CHANGE', mode: 'view' });
      expect(actor.getSnapshot().value).toEqual({ view: 'idle' });
      actor.stop();
    });

    it('追加→編集モードに直接切り替えられる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'MODE_CHANGE', mode: 'edit' });
      expect(actor.getSnapshot().value).toEqual({ edit: 'idle' });
      actor.stop();
    });

    it('モード切替時に描画中のデータがクリアされる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      // drawing状態
      expect(actor.getSnapshot().context.drawingCoords).toHaveLength(1);
      // モード切替
      actor.send({ type: 'MODE_CHANGE', mode: 'view' });
      // addモードに戻ると描画データがクリアされている
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      expect(actor.getSnapshot().context.drawingCoords).toEqual([]);
      actor.stop();
    });
  });

  describe('表示モード: パン操作', () => {
    it('idle→panning→idle の遷移', () => {
      const actor = startActor();
      actor.send({ type: 'PAN_START' });
      expect(actor.getSnapshot().value).toEqual({ view: 'panning' });
      actor.send({ type: 'PAN_END' });
      expect(actor.getSnapshot().value).toEqual({ view: 'idle' });
      actor.stop();
    });
  });

  describe('追加モード: 点ツール', () => {
    it('クリックで頂点が追加されるがidle状態のまま', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'SET_ADD_TOOL', toolType: 'point' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 20) });
      // 点ツールはdrawing状態に遷移しない
      expect(actor.getSnapshot().value).toEqual({ add: 'idle' });
      // 頂点が追加されている
      expect(actor.getSnapshot().context.drawingCoords).toHaveLength(1);
      expect(actor.getSnapshot().context.drawingCoords[0].x).toBe(10);
      actor.stop();
    });
  });

  describe('追加モード: 線ツール', () => {
    it('クリックでdrawing状態に遷移する', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      expect(actor.getSnapshot().value).toEqual({ add: 'drawing' });
      actor.stop();
    });

    it('複数クリックで頂点が蓄積される', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(20, 0) });
      expect(actor.getSnapshot().context.drawingCoords).toHaveLength(3);
      actor.stop();
    });

    it('2点以上でダブルクリック確定できる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });
      actor.send({ type: 'MAP_DOUBLE_CLICK', coord: new Coordinate(10, 10) });
      expect(actor.getSnapshot().value).toEqual({ add: 'idle' });
      actor.stop();
    });

    it('1点ではダブルクリック確定できない', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      actor.send({ type: 'MAP_DOUBLE_CLICK', coord: new Coordinate(0, 0) });
      // still in drawing because only 1 coord
      expect(actor.getSnapshot().value).toEqual({ add: 'drawing' });
      actor.stop();
    });

    it('CONFIRM イベントで確定できる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });
      actor.send({ type: 'CONFIRM' });
      expect(actor.getSnapshot().value).toEqual({ add: 'idle' });
      actor.stop();
    });
  });

  describe('追加モード: 面ツール', () => {
    it('3点以上で確定できる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      // デフォルトがpolygon
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 0) });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });
      actor.send({ type: 'CONFIRM' });
      expect(actor.getSnapshot().value).toEqual({ add: 'idle' });
      actor.stop();
    });

    it('2点では確定できない', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 0) });
      actor.send({ type: 'CONFIRM' });
      // still in drawing
      expect(actor.getSnapshot().value).toEqual({ add: 'drawing' });
      actor.stop();
    });
  });

  describe('追加モード: キャンセルと頂点戻し', () => {
    it('ESCで描画をキャンセルしてidle状態に戻る', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });
      expect(actor.getSnapshot().value).toEqual({ add: 'drawing' });

      actor.send({ type: 'KEY_ESCAPE' });
      expect(actor.getSnapshot().value).toEqual({ add: 'idle' });
      expect(actor.getSnapshot().context.drawingCoords).toEqual([]);
      actor.stop();
    });

    it('UNDO_VERTEXで最後の頂点を戻せる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });
      expect(actor.getSnapshot().context.drawingCoords).toHaveLength(2);

      actor.send({ type: 'UNDO_VERTEX' });
      expect(actor.getSnapshot().context.drawingCoords).toHaveLength(1);
      actor.stop();
    });

    it('プロジェクト読み込み用リセットで描画中座標を破棄してidle状態に戻る', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(10, 10) });

      actor.send({ type: 'RESET_INTERACTION' });

      expect(actor.getSnapshot().value).toEqual({ add: 'idle' });
      expect(actor.getSnapshot().context.drawingCoords).toEqual([]);
      actor.stop();
    });

    it('プロジェクト読み込み用リセットで追加モードのパン中座標も破棄する', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      actor.send({ type: 'PAN_START' });

      actor.send({ type: 'RESET_INTERACTION' });

      expect(actor.getSnapshot().value).toEqual({ add: 'idle' });
      expect(actor.getSnapshot().context.drawingCoords).toEqual([]);
      actor.stop();
    });
  });

  describe('追加モード: ツール種別切替', () => {
    it('SET_ADD_TOOLでツール種別を変更できる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      expect(actor.getSnapshot().context.addToolType).toBe('line');
      actor.stop();
    });

    it('ツール種別変更で描画中データがクリアされる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      expect(actor.getSnapshot().context.drawingCoords).toHaveLength(1);

      actor.send({ type: 'SET_ADD_TOOL', toolType: 'line' });
      expect(actor.getSnapshot().context.drawingCoords).toEqual([]);
      actor.stop();
    });
  });

  describe('追加モード: パン操作', () => {
    it('idle状態からパンできる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'PAN_START' });
      expect(actor.getSnapshot().value).toEqual({ add: 'panning' });
      actor.send({ type: 'PAN_END' });
      expect(actor.getSnapshot().value).toEqual({ add: 'idle' });
      actor.stop();
    });

    it('drawing状態からパンして戻れる', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'MAP_CLICK', coord: new Coordinate(0, 0) });
      expect(actor.getSnapshot().value).toEqual({ add: 'drawing' });

      actor.send({ type: 'PAN_START' });
      expect(actor.getSnapshot().value).toEqual({ add: 'panning' });

      actor.send({ type: 'PAN_END' });
      // 描画中データがあるのでdrawingに戻る
      expect(actor.getSnapshot().value).toEqual({ add: 'drawing' });
      actor.stop();
    });

    it('描画データなしでパン終了するとidleに戻る', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'add' });
      actor.send({ type: 'PAN_START' });
      actor.send({ type: 'PAN_END' });
      expect(actor.getSnapshot().value).toEqual({ add: 'idle' });
      actor.stop();
    });
  });

  describe('編集モード: パン操作', () => {
    it('idle→panning→idle の遷移', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'edit' });
      actor.send({ type: 'PAN_START' });
      expect(actor.getSnapshot().value).toEqual({ edit: 'panning' });
      actor.send({ type: 'PAN_END' });
      expect(actor.getSnapshot().value).toEqual({ edit: 'idle' });
      actor.stop();
    });
  });

  describe('測量モード: パン操作', () => {
    it('idle→panning→idle の遷移', () => {
      const actor = startActor();
      actor.send({ type: 'MODE_CHANGE', mode: 'measure' });
      actor.send({ type: 'PAN_START' });
      expect(actor.getSnapshot().value).toEqual({ measure: 'panning' });
      actor.send({ type: 'PAN_END' });
      expect(actor.getSnapshot().value).toEqual({ measure: 'idle' });
      actor.stop();
    });
  });
});
