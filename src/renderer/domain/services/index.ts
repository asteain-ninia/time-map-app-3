/**
 * ドメインサービス層のバレルエクスポート
 */
export {
  getParentFeature,
  getChildFeatures,
  hasChildren,
  hasParent,
  getRootFeatures,
  getDescendants,
  getAncestors,
  deriveParentShape,
  validateHierarchy,
  isShapeEditable,
  isSplittable,
  shouldParentDisappear,
  buildParentChildLink,
  buildParentChildUnlink,
} from './LayerService';
export type { DerivedShapeResult, HierarchyValidationError } from './LayerService';

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
  constrainMovingEdgesAgainstPoints,
} from './EdgePointCollisionService';
export type {
  MovingEdgeConstraint,
  ObstaclePoint,
} from './EdgePointCollisionService';

export {
  screenToWorldSnapDistance,
  findSnapCandidates,
  findGroupForVertex,
  getLinkedVertexIds,
  wouldCreateShapeComponentSharedVertexConflict,
  wouldCreateAdjacentSharedVertexConflict,
  isSharedVertexMergeAllowed,
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
  validatePolygonFeature,
} from './PolygonValidationService';
export type { PolygonValidationResult } from './PolygonValidationService';

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

export {
  findAnchorsInRange,
  findPreviousAnchor,
  findNextAnchor,
  getFirstAndLastAnchors,
  validateAnchorTimeline,
  detectTimeGaps,
  sortAnchorsByStartTime,
  getEffectiveEnd,
  timeRangesOverlap,
  getFeatureTimeSpan,
  featureCoversRange,
  stepForward,
  stepBackward,
} from './TimeService';
export type { TimeValidationError, TimeGranularity } from './TimeService';

export {
  splitByLine,
  splitByClosed,
  splitPolygonsByLine,
  splitPolygonsByClosed,
  validateCuttingLine,
  validateCuttingLineForPolygons,
} from './KnifeService';
export type { KnifeSplitResult, KnifeValidation } from './KnifeService';

export {
  buildPolygonRingDrafts,
  rebuildTerritoryHierarchy,
  resolvePolygonShapePolygons,
} from './PolygonShapeService';
export type { PolygonRingDraft } from './PolygonShapeService';

export {
  validateMerge,
  mergePolygons,
  validateTransfer,
  buildAnnexation,
  buildCession,
} from './MergeService';
export type { MergeResult, MergeValidation, TransferType, TerritoryTransfer, TransferValidation } from './MergeService';

export {
  greatCircleDistance,
  equirectangularDistance,
  calculateDistance,
  greatCirclePath,
  sphericalPolygonArea,
  toDMS,
  formatCoordinate,
  DEFAULT_PLANET,
} from './SurveyService';
export type { PlanetParams, DistanceResult, CoordinateDisplay, AreaResult } from './SurveyService';

export {
  buildAdjacencyGraph,
  buildAdjacencyGraphWithAll,
  greedyColoring,
  getColorFromPalette,
  deriveColor,
  generateSelectedColor,
  autoColor,
  rgbToHsl,
  hslToRgb,
} from './AutoColorService';
export type { AdjacencyGraph, ColorAssignment, AutoColorResult } from './AutoColorService';
