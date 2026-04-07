import type { Feature } from '@domain/entities/Feature';
import type { TimePoint } from '@domain/value-objects/TimePoint';

export interface FeatureSearchItem {
  readonly id: string;
  readonly featureType: Feature['featureType'];
  readonly displayName: string;
  readonly description: string;
  readonly attributeSummary: string;
  readonly isActiveAtCurrentTime: boolean;
}

export interface HighlightSegment {
  readonly text: string;
  readonly match: boolean;
}

function stringifyAttributeValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    value === null ||
    value === undefined
  ) {
    return String(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => stringifyAttributeValue(entry)).join(', ');
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function tokenizeFeatureSearch(query: string): readonly string[] {
  return [...new Set(
    query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)
  )];
}

export function buildFeatureSearchItems(
  features: readonly Feature[],
  currentTime?: TimePoint
): readonly FeatureSearchItem[] {
  return features.map((feature) => {
    const anchor = currentTime ? feature.getActiveAnchor(currentTime) : undefined;
    const attributeSummary = anchor?.property.attributes
      ? Object.entries(anchor.property.attributes)
        .map(([key, value]) => `${key}: ${stringifyAttributeValue(value)}`)
        .join(' / ')
      : '';

    return {
      id: feature.id,
      featureType: feature.featureType,
      displayName: anchor?.property.name || feature.id,
      description: anchor?.property.description ?? '',
      attributeSummary,
      isActiveAtCurrentTime: anchor !== undefined,
    };
  });
}

function buildSearchHaystack(item: FeatureSearchItem): string {
  return [
    item.id,
    item.displayName,
    item.description,
    item.attributeSummary,
  ].join('\n').toLowerCase();
}

export function filterFeatureSearchItems(
  items: readonly FeatureSearchItem[],
  query: string
): readonly FeatureSearchItem[] {
  const tokens = tokenizeFeatureSearch(query);
  if (tokens.length === 0) {
    return items;
  }

  return items.filter((item) => {
    const haystack = buildSearchHaystack(item);
    return tokens.every((token) => haystack.includes(token));
  });
}

export function getHighlightSegments(
  text: string,
  query: string
): readonly HighlightSegment[] {
  if (!text) {
    return [];
  }

  const tokens = tokenizeFeatureSearch(query);
  if (tokens.length === 0) {
    return [{ text, match: false }];
  }

  const lowerText = text.toLowerCase();
  const ranges: Array<{ start: number; end: number }> = [];

  for (const token of tokens) {
    let startIndex = 0;

    while (startIndex < lowerText.length) {
      const foundIndex = lowerText.indexOf(token, startIndex);
      if (foundIndex === -1) {
        break;
      }

      ranges.push({ start: foundIndex, end: foundIndex + token.length });
      startIndex = foundIndex + token.length;
    }
  }

  if (ranges.length === 0) {
    return [{ text, match: false }];
  }

  ranges.sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: Array<{ start: number; end: number }> = [];
  for (const range of ranges) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
      continue;
    }

    previous.end = Math.max(previous.end, range.end);
  }

  const segments: HighlightSegment[] = [];
  let cursor = 0;

  for (const range of merged) {
    if (cursor < range.start) {
      segments.push({ text: text.slice(cursor, range.start), match: false });
    }
    segments.push({ text: text.slice(range.start, range.end), match: true });
    cursor = range.end;
  }

  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), match: false });
  }

  return segments;
}
