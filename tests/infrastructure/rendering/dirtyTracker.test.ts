import { describe, it, expect } from 'vitest';
import {
  createDirtyState,
  markDirty,
  markSaved,
  resetDirty,
} from '@infrastructure/rendering/dirtyTracker';

describe('dirtyTracker', () => {
  it('初期状態はクリーン', () => {
    const s = createDirtyState();
    expect(s.isDirty).toBe(false);
    expect(s.savedVersion).toBe(0);
    expect(s.currentVersion).toBe(0);
  });

  it('markDirtyでダーティになる', () => {
    const s = markDirty(createDirtyState());
    expect(s.isDirty).toBe(true);
    expect(s.currentVersion).toBe(1);
    expect(s.savedVersion).toBe(0);
  });

  it('markDirtyを複数回呼ぶとバージョンが増える', () => {
    let s = createDirtyState();
    s = markDirty(s);
    s = markDirty(s);
    s = markDirty(s);
    expect(s.currentVersion).toBe(3);
    expect(s.isDirty).toBe(true);
  });

  it('markSavedでクリーンになる', () => {
    let s = createDirtyState();
    s = markDirty(s);
    s = markDirty(s);
    s = markSaved(s);
    expect(s.isDirty).toBe(false);
    expect(s.savedVersion).toBe(2);
    expect(s.currentVersion).toBe(2);
  });

  it('保存後に変更するとまたダーティ', () => {
    let s = createDirtyState();
    s = markDirty(s);
    s = markSaved(s);
    s = markDirty(s);
    expect(s.isDirty).toBe(true);
    expect(s.savedVersion).toBe(1);
    expect(s.currentVersion).toBe(2);
  });

  it('resetDirtyで初期状態に戻る', () => {
    let s = createDirtyState();
    s = markDirty(s);
    s = markDirty(s);
    s = resetDirty();
    expect(s.isDirty).toBe(false);
    expect(s.savedVersion).toBe(0);
    expect(s.currentVersion).toBe(0);
  });

  it('元の状態は変更されない（イミュータブル）', () => {
    const s1 = createDirtyState();
    const s2 = markDirty(s1);
    expect(s1.isDirty).toBe(false);
    expect(s2.isDirty).toBe(true);
  });
});
