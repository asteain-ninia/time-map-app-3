/**
 * 錨編集ドラフト（編集案）共有型
 *
 * §5.3.1: 歴史の錨編集の保存契約
 *
 * Prepare → Resolve → Commit の3段階で使用される共有型。
 */

import type { FeatureAnchor, AnchorProperty, FeatureShape, AnchorPlacement, TimeRange } from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { SpatialConflict } from '@domain/services/ConflictDetectionService';
import type { Vertex } from '@domain/entities/Vertex';

/** 編集モード */
export type EditMode = 'property_only' | 'shape_and_property';

/** 錨境界編集案 */
export interface BoundaryEdit {
  readonly targetAnchorId: string;
  readonly newStart?: TimePoint;
  readonly newEnd?: TimePoint | null;
}

/** 編集差分パッチ */
export interface DraftPatch {
  readonly property?: Partial<AnchorProperty>;
  readonly shape?: FeatureShape;
  readonly placement?: Partial<AnchorPlacement>;
  readonly timeRange?: Partial<TimeRange>;
  readonly boundaryEdit?: BoundaryEdit;
}

/** 編集案のステータス */
export type DraftStatus = 'ready_to_commit' | 'requires_resolution';

/** Prepare の出力 */
export interface PrepareResult {
  readonly draftId: string;
  readonly status: DraftStatus;
  readonly candidateAnchors: readonly FeatureAnchor[];
  readonly affectedTimeRange: { start: TimePoint; end?: TimePoint };
  readonly conflicts: readonly SpatialConflict[];
}

/** 競合解決方針 */
export interface ConflictResolution {
  readonly conflictIndex: number;
  readonly preferFeatureId: string;
}

/** Resolve の出力 */
export interface ResolveResult {
  readonly resolvedAnchorsByFeature: ReadonlyMap<string, readonly FeatureAnchor[]>;
  readonly createdVertices?: ReadonlyMap<string, Vertex>;
}

/** Commit の出力 */
export interface CommitResult {
  readonly updatedFeatureIds: readonly string[];
  readonly historyEntryId: string;
}

/** 保存されるドラフト状態 */
export interface AnchorEditDraft {
  readonly draftId: string;
  readonly featureId: string;
  readonly editMode: EditMode;
  readonly editTime: TimePoint;
  readonly originalAnchors: readonly FeatureAnchor[];
  readonly candidateAnchors: readonly FeatureAnchor[];
  readonly affectedTimeRange: { start: TimePoint; end?: TimePoint };
  readonly conflicts: readonly SpatialConflict[];
  readonly status: DraftStatus;
}
