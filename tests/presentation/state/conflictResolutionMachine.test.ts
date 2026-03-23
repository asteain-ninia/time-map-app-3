import { describe, it, expect } from 'vitest';
import { createActor } from 'xstate';
import { conflictResolutionMachine } from '@presentation/state/conflictResolutionMachine';
import type { SpatialConflict } from '@domain/services/ConflictDetectionService';

/** テスト用の競合データを生成 */
function makeConflict(overrides: Partial<SpatialConflict> = {}): SpatialConflict {
  return {
    featureA: { id: 'f1', layerId: 'l1' },
    featureB: { id: 'f2', layerId: 'l1' },
    overlapRatio: 0.3,
    ...overrides,
  } as SpatialConflict;
}

function makeConflicts(count: number): SpatialConflict[] {
  return Array.from({ length: count }, (_, i) =>
    makeConflict({
      featureA: { id: `fa${i}`, layerId: 'l1' } as SpatialConflict['featureA'],
      featureB: { id: `fb${i}`, layerId: 'l1' } as SpatialConflict['featureB'],
    })
  );
}

function startActor() {
  const actor = createActor(conflictResolutionMachine);
  actor.start();
  return actor;
}

describe('conflictResolutionMachine', () => {
  describe('初期状態', () => {
    it('idle状態で開始する', () => {
      const actor = startActor();
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });

    it('初期コンテキストが空', () => {
      const actor = startActor();
      const ctx = actor.getSnapshot().context;
      expect(ctx.draftId).toBe('');
      expect(ctx.conflicts).toEqual([]);
      expect(ctx.currentIndex).toBe(0);
      expect(ctx.resolutions).toEqual([]);
      expect(ctx.errorMessage).toBe('');
      actor.stop();
    });
  });

  describe('ダイアログ開閉', () => {
    it('OPENでreviewingに遷移する', () => {
      const actor = startActor();
      const conflicts = makeConflicts(2);
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts });
      expect(actor.getSnapshot().value).toBe('reviewing');
      expect(actor.getSnapshot().context.draftId).toBe('d1');
      expect(actor.getSnapshot().context.conflicts).toHaveLength(2);
      actor.stop();
    });

    it('CANCELでidleに戻りリセットされる', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(1) });
      actor.send({ type: 'CANCEL' });
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.draftId).toBe('');
      expect(actor.getSnapshot().context.conflicts).toEqual([]);
      actor.stop();
    });

    it('idleでCANCELは無視される', () => {
      const actor = startActor();
      actor.send({ type: 'CANCEL' });
      expect(actor.getSnapshot().value).toBe('idle');
      actor.stop();
    });
  });

  describe('競合ナビゲーション', () => {
    it('NEXT_CONFLICTで次の競合に移動する', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(3) });
      actor.send({ type: 'NEXT_CONFLICT' });
      expect(actor.getSnapshot().context.currentIndex).toBe(1);
      actor.stop();
    });

    it('PREV_CONFLICTで前の競合に移動する', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(3) });
      actor.send({ type: 'NEXT_CONFLICT' });
      actor.send({ type: 'NEXT_CONFLICT' });
      actor.send({ type: 'PREV_CONFLICT' });
      expect(actor.getSnapshot().context.currentIndex).toBe(1);
      actor.stop();
    });

    it('先頭でPREV_CONFLICTは無視される', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(3) });
      actor.send({ type: 'PREV_CONFLICT' });
      expect(actor.getSnapshot().context.currentIndex).toBe(0);
      actor.stop();
    });

    it('末尾でNEXT_CONFLICTは無視される', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(2) });
      actor.send({ type: 'NEXT_CONFLICT' });
      actor.send({ type: 'NEXT_CONFLICT' });
      expect(actor.getSnapshot().context.currentIndex).toBe(1);
      actor.stop();
    });

    it('JUMP_TO_CONFLICTで指定インデックスに移動する', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(5) });
      actor.send({ type: 'JUMP_TO_CONFLICT', index: 3 });
      expect(actor.getSnapshot().context.currentIndex).toBe(3);
      actor.stop();
    });

    it('範囲外のJUMP_TO_CONFLICTは無視される', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(3) });
      actor.send({ type: 'JUMP_TO_CONFLICT', index: 10 });
      expect(actor.getSnapshot().context.currentIndex).toBe(0);
      actor.stop();
    });

    it('負のインデックスのJUMP_TO_CONFLICTは無視される', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(3) });
      actor.send({ type: 'JUMP_TO_CONFLICT', index: -1 });
      expect(actor.getSnapshot().context.currentIndex).toBe(0);
      actor.stop();
    });
  });

  describe('解決方針選択', () => {
    it('SELECT_PREFERREDで方針が記録される', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(2) });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fa0' });
      const resolutions = actor.getSnapshot().context.resolutions;
      expect(resolutions).toHaveLength(1);
      expect(resolutions[0]).toEqual({ conflictIndex: 0, preferFeatureId: 'fa0' });
      actor.stop();
    });

    it('同じ競合への再選択は上書きされる', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(2) });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fa0' });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fb0' });
      const resolutions = actor.getSnapshot().context.resolutions;
      expect(resolutions).toHaveLength(1);
      expect(resolutions[0].preferFeatureId).toBe('fb0');
      actor.stop();
    });

    it('複数の競合に方針を設定できる', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(3) });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fa0' });
      actor.send({ type: 'NEXT_CONFLICT' });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fb1' });
      actor.send({ type: 'NEXT_CONFLICT' });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fa2' });
      expect(actor.getSnapshot().context.resolutions).toHaveLength(3);
      actor.stop();
    });
  });

  describe('コミット', () => {
    it('全競合解決済みでCOMMITするとcommittingに遷移する', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(1) });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fa0' });
      actor.send({ type: 'COMMIT' });
      expect(actor.getSnapshot().value).toBe('committing');
      actor.stop();
    });

    it('未解決の競合があるとCOMMITは無視される', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(2) });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fa0' });
      // 競合1件のみ解決、もう1件未解決
      actor.send({ type: 'COMMIT' });
      expect(actor.getSnapshot().value).toBe('reviewing');
      actor.stop();
    });

    it('COMMIT_SUCCESSでdoneに遷移する', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(1) });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fa0' });
      actor.send({ type: 'COMMIT' });
      actor.send({ type: 'COMMIT_SUCCESS' });
      expect(actor.getSnapshot().value).toBe('done');
      actor.stop();
    });

    it('COMMIT_FAILUREでreviewingに戻りエラーが設定される', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(1) });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fa0' });
      actor.send({ type: 'COMMIT' });
      actor.send({ type: 'COMMIT_FAILURE', error: '保存に失敗しました' });
      expect(actor.getSnapshot().value).toBe('reviewing');
      expect(actor.getSnapshot().context.errorMessage).toBe('保存に失敗しました');
      actor.stop();
    });

    it('doneからRESETでidleに戻る', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(1) });
      actor.send({ type: 'SELECT_PREFERRED', featureId: 'fa0' });
      actor.send({ type: 'COMMIT' });
      actor.send({ type: 'COMMIT_SUCCESS' });
      actor.send({ type: 'RESET' });
      expect(actor.getSnapshot().value).toBe('idle');
      expect(actor.getSnapshot().context.draftId).toBe('');
      actor.stop();
    });
  });

  describe('エッジケース', () => {
    it('競合0件でOPENしてもreviewingになる', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: [] });
      expect(actor.getSnapshot().value).toBe('reviewing');
      actor.stop();
    });

    it('競合0件ではCOMMITできない（allResolvedガード）', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: [] });
      actor.send({ type: 'COMMIT' });
      // conflicts.length === 0 → allResolved returns false
      expect(actor.getSnapshot().value).toBe('reviewing');
      actor.stop();
    });

    it('reviewing中にOPENは無視される', () => {
      const actor = startActor();
      actor.send({ type: 'OPEN', draftId: 'd1', conflicts: makeConflicts(1) });
      actor.send({ type: 'OPEN', draftId: 'd2', conflicts: makeConflicts(3) });
      // reviewing state doesn't handle OPEN
      expect(actor.getSnapshot().context.draftId).toBe('d1');
      actor.stop();
    });
  });
});
