import type { SlideResult } from './EdgeSlideService';
import {
  isPointInPolygon,
  projectPointOnSegment,
  type RingCoords,
} from './GeometryService';

/** 移動頂点に接続された辺。fixed側は移動しない隣接頂点。 */
export interface MovingEdgeConstraint {
  readonly fixedX: number;
  readonly fixedY: number;
  readonly sourceX: number;
  readonly sourceY: number;
}

export interface ObstaclePoint {
  readonly x: number;
  readonly y: number;
}

interface MovingEdgePointHit {
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly fixedX: number;
  readonly fixedY: number;
  readonly pointX: number;
  readonly pointY: number;
}

/**
 * 移動中の辺が他地物の頂点へ衝突する場合、接触線に沿って滑らせる。
 */
export function constrainMovingEdgesAgainstPoints(
  targetX: number,
  targetY: number,
  movingEdges: readonly MovingEdgeConstraint[],
  obstaclePoints: readonly ObstaclePoint[],
  obstacleRings: readonly RingCoords[] = []
): SlideResult {
  if (movingEdges.length === 0 || obstaclePoints.length === 0) {
    return { x: targetX, y: targetY, didSlide: false, edgeIndex: null };
  }

  let current = { x: movingEdges[0].sourceX, y: movingEdges[0].sourceY };
  let destination = { x: targetX, y: targetY };
  let didSlide = false;

  // 最大4反復で多重接触を解消（実用は 1-2 回で収束）
  for (let iteration = 0; iteration < 4; iteration += 1) {
    const currentEdges = movingEdges.map((edge) => ({
      ...edge,
      sourceX: current.x,
      sourceY: current.y,
    }));

    const activeContact = findActivePointContact(currentEdges, obstaclePoints, destination);
    if (activeContact) {
      const projected = projectDestinationAlongPointContact(current, destination, activeContact);
      didSlide = true;
      if (movingEdgesPenetrateRings(currentEdges, projected, obstacleRings)) {
        const fallback = findSafeRingBoundaryProjection(current, destination, currentEdges, obstacleRings);
        return {
          x: fallback.x,
          y: fallback.y,
          didSlide: true,
          edgeIndex: null,
        };
      }
      if (isSamePointWithinEpsilon(projected, current)) {
        return { x: current.x, y: current.y, didSlide: true, edgeIndex: null };
      }
      destination = projected;
      continue;
    }

    const hit = findFirstMovingEdgePointHit(currentEdges, obstaclePoints, destination);
    if (!hit) {
      if (movingEdgesPenetrateRings(currentEdges, destination, obstacleRings)) {
        const fallback = findSafeRingBoundaryProjection(current, destination, currentEdges, obstacleRings);
        return {
          x: fallback.x,
          y: fallback.y,
          didSlide: true,
          edgeIndex: null,
        };
      }
      return {
        x: destination.x,
        y: destination.y,
        didSlide,
        edgeIndex: null,
      };
    }

    const hitPoint = { x: hit.x, y: hit.y };
    const projected = projectDestinationAlongPointContact(hitPoint, destination, hit);
    didSlide = true;
    if (
      movingEdgesPenetrateRings(currentEdges, hitPoint, obstacleRings) ||
      movingEdgesPenetrateRings(currentEdges, projected, obstacleRings)
    ) {
      const fallback = findSafeRingBoundaryProjection(current, destination, currentEdges, obstacleRings);
      return {
        x: fallback.x,
        y: fallback.y,
        didSlide: true,
        edgeIndex: null,
      };
    }
    if (isSamePointWithinEpsilon(projected, hitPoint)) {
      return { x: hit.x, y: hit.y, didSlide: true, edgeIndex: null };
    }

    current = hitPoint;
    destination = projected;
  }

  return {
    x: destination.x,
    y: destination.y,
    didSlide,
    edgeIndex: null,
  };
}

function findSafeRingBoundaryProjection(
  current: ObstaclePoint,
  destination: ObstaclePoint,
  movingEdges: readonly MovingEdgeConstraint[],
  obstacleRings: readonly RingCoords[]
): ObstaclePoint {
  const epsilon = 1e-9;
  const moveX = destination.x - current.x;
  const moveY = destination.y - current.y;
  const moveLengthSq = moveX * moveX + moveY * moveY;
  if (moveLengthSq <= epsilon * epsilon) {
    return current;
  }

  let bestCandidate: ObstaclePoint | null = null;
  let bestLineDistance = Infinity;
  let bestProgress = Infinity;
  let bestDistance = Infinity;

  for (const ring of obstacleRings) {
    for (let index = 0; index < ring.length; index += 1) {
      const a = ring[index];
      const b = ring[(index + 1) % ring.length];
      const projection = projectPointOnSegment(destination.x, destination.y, a.x, a.y, b.x, b.y);
      const candidate = { x: projection.x, y: projection.y };
      if (isSamePointWithinEpsilon(candidate, current)) {
        continue;
      }
      if (movingEdgesPenetrateRings(movingEdges, candidate, obstacleRings)) {
        continue;
      }

      const progress = ((candidate.x - current.x) * moveX + (candidate.y - current.y) * moveY) / moveLengthSq;
      if (progress <= epsilon) {
        continue;
      }

      const distanceX = destination.x - candidate.x;
      const distanceY = destination.y - candidate.y;
      const distance = distanceX * distanceX + distanceY * distanceY;
      const candidateMoveX = candidate.x - current.x;
      const candidateMoveY = candidate.y - current.y;
      const candidateLengthSq = candidateMoveX * candidateMoveX + candidateMoveY * candidateMoveY;
      const lineDistance = Math.max(0, candidateLengthSq - progress * progress * moveLengthSq);
      // Prefer candidates on the drag line, then the earliest forward hit, then the point closest to the target.
      if (
        lineDistance < bestLineDistance - epsilon ||
        (Math.abs(lineDistance - bestLineDistance) <= epsilon && progress < bestProgress - epsilon) ||
        (
          Math.abs(lineDistance - bestLineDistance) <= epsilon &&
          Math.abs(progress - bestProgress) <= epsilon &&
          distance < bestDistance
        )
      ) {
        bestCandidate = candidate;
        bestLineDistance = lineDistance;
        bestProgress = progress;
        bestDistance = distance;
      }
    }
  }

  return bestCandidate ?? current;
}

function movingEdgesPenetrateRings(
  movingEdges: readonly MovingEdgeConstraint[],
  movingVertex: ObstaclePoint,
  obstacleRings: readonly RingCoords[]
): boolean {
  if (obstacleRings.length === 0) {
    return false;
  }

  return movingEdges.some((edge) =>
    obstacleRings.some((ring) =>
      segmentPenetratesRingArea(edge.fixedX, edge.fixedY, movingVertex.x, movingVertex.y, ring)
    )
  );
}

function segmentPenetratesRingArea(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  ring: RingCoords
): boolean {
  const epsilon = 1e-9;
  const parameters = [0, 1];

  for (let index = 0; index < ring.length; index += 1) {
    const a = ring[index];
    const b = ring[(index + 1) % ring.length];
    const t = getSegmentIntersectionParameter(
      startX,
      startY,
      endX,
      endY,
      a.x,
      a.y,
      b.x,
      b.y
    );
    if (t !== null) {
      parameters.push(Math.max(0, Math.min(1, t)));
    }
  }

  const sortedParameters = [...new Set(parameters.map((t) => Math.round(t / epsilon) * epsilon))]
    .sort((a, b) => a - b);

  for (let index = 0; index < sortedParameters.length - 1; index += 1) {
    const from = sortedParameters[index];
    const to = sortedParameters[index + 1];
    if (to - from <= epsilon) {
      continue;
    }
    const mid = (from + to) / 2;
    const sampleX = startX + (endX - startX) * mid;
    const sampleY = startY + (endY - startY) * mid;
    if (isPointInPolygon(sampleX, sampleY, ring)) {
      return true;
    }
  }

  return false;
}

function getSegmentIntersectionParameter(
  p1x: number,
  p1y: number,
  p2x: number,
  p2y: number,
  q1x: number,
  q1y: number,
  q2x: number,
  q2y: number
): number | null {
  const epsilon = 1e-9;
  const rx = p2x - p1x;
  const ry = p2y - p1y;
  const sx = q2x - q1x;
  const sy = q2y - q1y;
  const denominator = cross2(rx, ry, sx, sy);
  const qpx = q1x - p1x;
  const qpy = q1y - p1y;

  if (Math.abs(denominator) <= epsilon) {
    if (Math.abs(cross2(qpx, qpy, rx, ry)) > epsilon) {
      return null;
    }
    const lengthSq = rx * rx + ry * ry;
    if (lengthSq <= epsilon * epsilon) {
      return null;
    }
    const t1 = ((q1x - p1x) * rx + (q1y - p1y) * ry) / lengthSq;
    const t2 = ((q2x - p1x) * rx + (q2y - p1y) * ry) / lengthSq;
    const from = Math.max(0, Math.min(t1, t2));
    const to = Math.min(1, Math.max(t1, t2));
    return from <= to + epsilon ? from : null;
  }

  const t = cross2(qpx, qpy, sx, sy) / denominator;
  const u = cross2(qpx, qpy, rx, ry) / denominator;
  if (t < -epsilon || t > 1 + epsilon || u < -epsilon || u > 1 + epsilon) {
    return null;
  }

  return t;
}

function findFirstMovingEdgePointHit(
  movingEdges: readonly MovingEdgeConstraint[],
  obstaclePoints: readonly ObstaclePoint[],
  target: ObstaclePoint
): MovingEdgePointHit | null {
  let bestHit: MovingEdgePointHit | null = null;

  for (const edge of movingEdges) {
    for (const point of obstaclePoints) {
      const hit = getMovingEdgePointCollision(edge, target.x, target.y, point);
      if (!hit) {
        continue;
      }
      if (!bestHit || hit.t < bestHit.t) {
        bestHit = hit;
      }
    }
  }

  return bestHit;
}

function getMovingEdgePointCollision(
  edge: MovingEdgeConstraint,
  targetX: number,
  targetY: number,
  point: ObstaclePoint
): MovingEdgePointHit | null {
  const epsilon = 1e-9;
  if (
    isSamePointWithinEpsilon(point, { x: edge.fixedX, y: edge.fixedY }) ||
    isSamePointWithinEpsilon(point, { x: edge.sourceX, y: edge.sourceY })
  ) {
    return null;
  }

  const deltaX = targetX - edge.sourceX;
  const deltaY = targetY - edge.sourceY;
  if (deltaX * deltaX + deltaY * deltaY <= epsilon * epsilon) {
    return null;
  }

  const pointX = point.x - edge.fixedX;
  const pointY = point.y - edge.fixedY;
  const pointDistanceSq = pointX * pointX + pointY * pointY;
  if (pointDistanceSq <= epsilon * epsilon) {
    return null;
  }

  const sourceX = edge.sourceX - edge.fixedX;
  const sourceY = edge.sourceY - edge.fixedY;
  const denominator = cross2(pointX, pointY, deltaX, deltaY);
  if (Math.abs(denominator) <= epsilon) {
    return null;
  }

  const t = -cross2(pointX, pointY, sourceX, sourceY) / denominator;
  if (t <= epsilon || t > 1 + epsilon) {
    return null;
  }

  const safeT = Math.min(t, 1);
  const hitX = edge.sourceX + safeT * deltaX;
  const hitY = edge.sourceY + safeT * deltaY;
  const hitVectorX = hitX - edge.fixedX;
  const hitVectorY = hitY - edge.fixedY;
  const dot = pointX * hitVectorX + pointY * hitVectorY;
  if (dot < pointDistanceSq - epsilon) {
    return null;
  }

  return {
    x: hitX,
    y: hitY,
    t: safeT,
    fixedX: edge.fixedX,
    fixedY: edge.fixedY,
    pointX: point.x,
    pointY: point.y,
  };
}

function findActivePointContact(
  movingEdges: readonly MovingEdgeConstraint[],
  obstaclePoints: readonly ObstaclePoint[],
  target: ObstaclePoint
): MovingEdgePointHit | null {
  const epsilon = 1e-9;

  for (const edge of movingEdges) {
    for (const point of obstaclePoints) {
      if (
        isSamePointWithinEpsilon(point, { x: edge.fixedX, y: edge.fixedY }) ||
        isSamePointWithinEpsilon(point, { x: edge.sourceX, y: edge.sourceY })
      ) {
        continue;
      }

      const pointX = point.x - edge.fixedX;
      const pointY = point.y - edge.fixedY;
      const pointDistanceSq = pointX * pointX + pointY * pointY;
      if (pointDistanceSq <= epsilon * epsilon) {
        continue;
      }

      const sourceX = edge.sourceX - edge.fixedX;
      const sourceY = edge.sourceY - edge.fixedY;
      if (Math.abs(cross2(pointX, pointY, sourceX, sourceY)) > epsilon) {
        continue;
      }

      const sourceDot = pointX * sourceX + pointY * sourceY;
      if (sourceDot < pointDistanceSq - epsilon) {
        continue;
      }

      const targetX = target.x - edge.fixedX;
      const targetY = target.y - edge.fixedY;
      if (Math.abs(cross2(pointX, pointY, targetX, targetY)) <= epsilon) {
        continue;
      }

      return {
        x: edge.sourceX,
        y: edge.sourceY,
        t: 0,
        fixedX: edge.fixedX,
        fixedY: edge.fixedY,
        pointX: point.x,
        pointY: point.y,
      };
    }
  }

  return null;
}

function projectDestinationAlongPointContact(
  base: ObstaclePoint,
  destination: ObstaclePoint,
  contact: MovingEdgePointHit
): ObstaclePoint {
  const epsilon = 1e-9;
  const tangentX = contact.pointX - contact.fixedX;
  const tangentY = contact.pointY - contact.fixedY;
  const tangentLength = Math.sqrt(tangentX * tangentX + tangentY * tangentY);
  if (tangentLength <= epsilon) {
    return base;
  }

  const unitX = tangentX / tangentLength;
  const unitY = tangentY / tangentLength;
  const remainingX = destination.x - base.x;
  const remainingY = destination.y - base.y;
  const scalar = remainingX * unitX + remainingY * unitY;
  const projected = {
    x: base.x + scalar * unitX,
    y: base.y + scalar * unitY,
  };

  const projectedDistanceFromFixed =
    (projected.x - contact.fixedX) * unitX +
    (projected.y - contact.fixedY) * unitY;
  if (projectedDistanceFromFixed < tangentLength + epsilon) {
    return base;
  }

  return projected;
}

function isSamePointWithinEpsilon(
  a: ObstaclePoint,
  b: ObstaclePoint,
  epsilon: number = 1e-9
): boolean {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= epsilon * epsilon;
}

function cross2(ax: number, ay: number, bx: number, by: number): number {
  return ax * by - ay * bx;
}
