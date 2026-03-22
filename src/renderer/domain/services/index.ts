/**
 * ドメインサービス層のバレルエクスポート
 */
export {
  segmentsIntersect,
  isPointInPolygon,
  ringsEdgesIntersect,
  isRingContainedIn,
  ringsOverlap,
  isSelfIntersecting,
  projectPointOnSegment,
  signedArea,
  polygonArea,
  distance,
} from './GeometryService';
export type { RingCoords } from './GeometryService';

export {
  slideAlongEdge,
  moveAlongEdge,
} from './EdgeSlideService';
export type { SlideResult } from './EdgeSlideService';

export {
  screenToWorldSnapDistance,
  findSnapCandidates,
  findGroupForVertex,
  getLinkedVertexIds,
  mergeVertices,
  unmergeVertex,
  moveSharedVertices,
  UnmergeSuppression,
} from './SharedVertexService';
export type { SnapCandidate, MergeResult, UnmergeResult } from './SharedVertexService';

export {
  addHoleRing,
  addExclaveRing,
  deleteRing,
  validateRingPlacement,
} from './RingEditService';
export type { AddRingResult, DeleteRingResult, RingValidationError } from './RingEditService';

export {
  detectSpatialConflicts,
  detectConflictsForFeature,
} from './ConflictDetectionService';
export type { SpatialConflict } from './ConflictDetectionService';

export {
  polygonDifference,
  polygonIntersection,
  polygonUnion,
  toClipRing,
  fromClipRing,
  toClipPolygon,
  fromClipPolygon,
} from './BooleanOperationService';
export type { BooleanResult } from './BooleanOperationService';
