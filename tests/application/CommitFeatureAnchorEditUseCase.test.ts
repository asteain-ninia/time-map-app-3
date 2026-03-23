import { describe, it, expect, beforeEach } from 'vitest';
import { CommitFeatureAnchorEditUseCase, CommitError } from '@application/CommitFeatureAnchorEditUseCase';
import { PrepareFeatureAnchorEditUseCase } from '@application/PrepareFeatureAnchorEditUseCase';
import { AddFeatureUseCase } from '@application/AddFeatureUseCase';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { TimePoint } from '@domain/value-objects/TimePoint';

describe('CommitFeatureAnchorEditUseCase', () => {
  let addFeature: AddFeatureUseCase;
  let prepare: PrepareFeatureAnchorEditUseCase;
  let commit: CommitFeatureAnchorEditUseCase;

  const time = new TimePoint(2000);

  beforeEach(() => {
    addFeature = new AddFeatureUseCase();
    prepare = new PrepareFeatureAnchorEditUseCase(addFeature);
    commit = new CommitFeatureAnchorEditUseCase(addFeature, prepare);
  });

  describe('commitDirect', () => {
    it('プロパティ編集を確定できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time, 'original');
      const prepResult = prepare.prepare(feature.id, 'property_only', time, {
        property: { name: '更新後', description: '説明' },
      });

      const result = commit.commitDirect(prepResult.draftId);

      expect(result.updatedFeatureIds).toContain(feature.id);
      expect(result.historyEntryId).toBeTruthy();

      // 地物が更新されている
      const updated = addFeature.getFeatureById(feature.id)!;
      expect(updated.getNameAt(time)).toBe('更新後');
    });

    it('確定後にドラフトが破棄される', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const prepResult = prepare.prepare(feature.id, 'property_only', time, {});

      commit.commitDirect(prepResult.draftId);

      expect(prepare.getDraft(prepResult.draftId)).toBeUndefined();
    });

    it('存在しないドラフトIDはエラー', () => {
      expect(() =>
        commit.commitDirect('nonexistent')
      ).toThrow(CommitError);
    });

    it('配置の更新を確定できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const prepResult = prepare.prepare(feature.id, 'property_only', time, {
        placement: { layerId: 'l2' },
      });

      commit.commitDirect(prepResult.draftId);

      const updated = addFeature.getFeatureById(feature.id)!;
      expect(updated.getActiveAnchor(time)!.placement.layerId).toBe('l2');
    });

    it('境界編集を確定できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const anchorId = feature.anchors[0].id;

      const prepResult = prepare.prepare(feature.id, 'property_only', time, {
        boundaryEdit: {
          targetAnchorId: anchorId,
          newEnd: new TimePoint(2100),
        },
      });

      commit.commitDirect(prepResult.draftId);

      const updated = addFeature.getFeatureById(feature.id)!;
      expect(updated.anchors[0].timeRange.end?.year).toBe(2100);
    });

    it('historyEntryId がユニーク', () => {
      const f1 = addFeature.addPoint(new Coordinate(10, 20), 'l1', time);
      const f2 = addFeature.addPoint(new Coordinate(20, 30), 'l1', time);

      const p1 = prepare.prepare(f1.id, 'property_only', time, {});
      const p2 = prepare.prepare(f2.id, 'property_only', time, {});

      const r1 = commit.commitDirect(p1.draftId);
      const r2 = commit.commitDirect(p2.draftId);

      expect(r1.historyEntryId).not.toBe(r2.historyEntryId);
    });
  });

  describe('commitResolved', () => {
    it('resolvedAnchorsByFeature を使って確定できる', () => {
      const feature = addFeature.addPoint(new Coordinate(10, 20), 'l1', time, 'orig');
      const prepResult = prepare.prepare(feature.id, 'property_only', time, {
        property: { name: 'resolved', description: '' },
      });

      const resolvedMap = new Map();
      resolvedMap.set(feature.id, prepResult.candidateAnchors);

      const result = commit.commitResolved(prepResult.draftId, {
        resolvedAnchorsByFeature: resolvedMap,
      });

      expect(result.updatedFeatureIds).toContain(feature.id);
      const updated = addFeature.getFeatureById(feature.id)!;
      expect(updated.getNameAt(time)).toBe('resolved');
    });

    it('存在しないドラフトIDはエラー', () => {
      expect(() =>
        commit.commitResolved('nonexistent', {
          resolvedAnchorsByFeature: new Map(),
        })
      ).toThrow(CommitError);
    });
  });
});
