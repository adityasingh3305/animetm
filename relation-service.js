// ============================================================
// AnimeTM — Related anime aggregation service
// ============================================================

const RELATION_LABELS = {
  prequel: 'Prequel',
  sequel: 'Sequel',
  parent_story: 'Parent Story',
  side_story: 'Side Story',
  spin_off: 'Spin-Off',
  summary: 'Summary',
  alternative_setting: 'Alternative Setting',
  alternative_version: 'Alternative Setting',
  other: 'Other',
};

const ANIME_MEDIA_TYPES = new Set(['tv', 'movie', 'ova', 'ona', 'special', 'music']);

const TYPE_PRIORITY = {
  TV: 0,
  MOVIE: 1,
  OVA: 2,
  ONA: 3,
  SPECIAL: 4,
  MUSIC: 5,
};

function asPositiveId(value) {
  const id = Number.parseInt(value, 10);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function normalizeRelationType(value) {
  return RELATION_LABELS[String(value || '').trim().toLowerCase()] || null;
}

function isAnimeNode(node) {
  if (!node || !asPositiveId(node.id)) return false;
  const mediaType = String(node.media_type || node.type || '').toLowerCase();
  return !mediaType || ANIME_MEDIA_TYPES.has(mediaType);
}

function normalizeType(value) {
  const type = String(value || '').trim().toUpperCase();
  return type ? type.replace(/_/g, ' ') : '';
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) <= 0) return null;
  const minutes = Math.round(Number(seconds) / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h ${remainder}m` : `${hours}h`;
}

function normalizeRelatedAnime(raw, relation = null) {
  const node = raw?.node || raw;
  const id = asPositiveId(node?.id);
  if (!id) return null;

  return {
    id,
    title: String(node.title || 'Unknown'),
    ...(node.alternative_titles?.en ? { englishTitle: String(node.alternative_titles.en) } : {}),
    ...(node.main_picture?.large || node.main_picture?.medium
      ? { imageUrl: node.main_picture.large || node.main_picture.medium }
      : {}),
    type: normalizeType(node.media_type),
    airedFrom: node.start_date || null,
    airedTo: node.end_date || null,
    episodes: Number.isInteger(node.num_episodes) ? node.num_episodes : null,
    duration: formatDuration(node.average_episode_duration),
    relation: relation || 'Current',
    related: {},
  };
}

function mergeNormalized(existing, incoming) {
  if (!existing) return incoming;
  return {
    ...existing,
    ...incoming,
    title: incoming.title && incoming.title !== 'Unknown' ? incoming.title : existing.title,
    englishTitle: incoming.englishTitle || existing.englishTitle,
    imageUrl: incoming.imageUrl || existing.imageUrl,
    type: incoming.type || existing.type,
    airedFrom: incoming.airedFrom || existing.airedFrom || null,
    airedTo: incoming.airedTo || existing.airedTo || null,
    episodes: incoming.episodes ?? existing.episodes ?? null,
    duration: incoming.duration || existing.duration || null,
    relation: existing.relation === 'Current' ? existing.relation : (incoming.relation || existing.relation),
    related: { ...(existing.related || {}), ...(incoming.related || {}) },
  };
}

function compareReleaseOrder(a, b) {
  const aDate = a.airedFrom ? Date.parse(a.airedFrom) : Number.POSITIVE_INFINITY;
  const bDate = b.airedFrom ? Date.parse(b.airedFrom) : Number.POSITIVE_INFINITY;
  const aValid = Number.isFinite(aDate);
  const bValid = Number.isFinite(bDate);

  if (aValid && bValid && aDate !== bDate) return aDate - bDate;
  if (aValid !== bValid) return aValid ? -1 : 1;

  const aPriority = TYPE_PRIORITY[a.type] ?? 99;
  const bPriority = TYPE_PRIORITY[b.type] ?? 99;
  if (aPriority !== bPriority) return aPriority - bPriority;
  return a.id - b.id;
}

function getOverride(overrides, rootId) {
  const source = overrides || {};
  const groups = source.groups && typeof source.groups === 'object' ? source.groups : source;
  const direct = groups[String(rootId)];
  if (direct && typeof direct === 'object') return direct;

  for (const value of Object.values(groups)) {
    if (!value || typeof value !== 'object') continue;
    const animeIds = Array.isArray(value.animeIds) ? value.animeIds.map(asPositiveId) : [];
    if (animeIds.includes(rootId)) return value;
  }
  return {};
}

function overrideRelationLabel(relationLabels, sourceId, targetId, fallback) {
  if (!relationLabels || typeof relationLabels !== 'object') return fallback;
  const direct = relationLabels[`${sourceId}:${targetId}`];
  if (typeof direct === 'string' && direct.trim()) return direct.trim();

  const nested = relationLabels[String(sourceId)];
  if (nested && typeof nested === 'object' && typeof nested[String(targetId)] === 'string') {
    return nested[String(targetId)].trim() || fallback;
  }

  return fallback;
}

function sortWithManualOrder(items, order) {
  const orderIds = Array.isArray(order) ? order.map(asPositiveId).filter(Boolean) : [];
  if (orderIds.length === 0) return [...items].sort(compareReleaseOrder);

  const orderIndex = new Map(orderIds.map((id, index) => [id, index]));
  return [...items].sort((a, b) => {
    const aIndex = orderIndex.has(a.id) ? orderIndex.get(a.id) : Number.POSITIVE_INFINITY;
    const bIndex = orderIndex.has(b.id) ? orderIndex.get(b.id) : Number.POSITIVE_INFINITY;
    if (aIndex !== bIndex) return aIndex - bIndex;
    return compareReleaseOrder(a, b);
  });
}

/**
 * Traverses MAL's anime relationship graph and returns a normalized release order.
 * `fetchAnime` is injected so the service remains provider-agnostic and testable.
 */
async function aggregateRelatedSeries(rootId, {
  fetchAnime,
  overrides = {},
  maxDepth = 3,
} = {}) {
  const normalizedRootId = asPositiveId(rootId);
  if (!normalizedRootId) throw new Error('Invalid anime ID');
  if (typeof fetchAnime !== 'function') throw new Error('A fetchAnime function is required');

  const override = getOverride(overrides, normalizedRootId);
  const nodes = new Map();
  const edges = new Map();
  const visited = new Set();
  const queue = [{ id: normalizedRootId, depth: 0, raw: null, relation: 'Current' }];

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || visited.has(current.id) || current.depth > maxDepth) continue;
    visited.add(current.id);

    let raw = current.raw;
    try {
      const fetched = await fetchAnime(current.id);
      if (fetched) raw = fetched;
    } catch (error) {
      if (!raw) {
        if (current.id === normalizedRootId) throw error;
        continue;
      }
    }

    const normalized = normalizeRelatedAnime(raw, current.relation);
    if (!normalized) {
      if (current.id === normalizedRootId) throw new Error('Anime not found');
      continue;
    }
    nodes.set(normalized.id, mergeNormalized(nodes.get(normalized.id), normalized));

    const relations = Array.isArray(raw?.related_anime) ? raw.related_anime : [];
    for (const relation of relations) {
      const label = normalizeRelationType(relation?.relation_type);
      const target = relation?.node;
      const targetId = asPositiveId(target?.id);
      if (!label || !targetId || !isAnimeNode(target)) continue;

      if (!edges.has(normalized.id)) edges.set(normalized.id, new Map());
      edges.get(normalized.id).set(targetId, label);

      if (!nodes.has(targetId)) {
        const targetNormalized = normalizeRelatedAnime(target, label);
        if (targetNormalized) nodes.set(targetId, targetNormalized);
      }

      if (current.depth < maxDepth && !visited.has(targetId)) {
        queue.push({ id: targetId, depth: current.depth + 1, raw: target, relation: label });
      }
    }
  }

  const relationLabels = override.relationLabels || {};
  for (const [sourceId, targets] of edges.entries()) {
    const source = nodes.get(sourceId);
    if (!source) continue;
    for (const [targetId, fallback] of targets.entries()) {
      if (!nodes.has(targetId)) continue;
      source.related[String(targetId)] = overrideRelationLabel(relationLabels, sourceId, targetId, fallback);
    }
  }

  for (const item of nodes.values()) {
    const itemOverride = relationLabels[String(item.id)];
    if (typeof itemOverride === 'string' && itemOverride.trim()) item.relation = itemOverride.trim();
  }

  const excludedIds = new Set((Array.isArray(override.excludedIds) ? override.excludedIds : [])
    .map(asPositiveId).filter(Boolean));
  const items = [...nodes.values()].filter(item => item.id === normalizedRootId || !excludedIds.has(item.id));
  const orderedItems = sortWithManualOrder(items, override.order || override.customOrder);
  const minimumId = orderedItems.reduce((min, item) => Math.min(min, item.id), normalizedRootId);
  const root = nodes.get(normalizedRootId);

  return {
    animeId: normalizedRootId,
    groupId: String(override.groupId || `mal-${minimumId}`),
    title: String(override.title || `${root?.title || 'Anime'} Watch Order`),
    items: orderedItems,
    hasRelations: orderedItems.some(item => item.id !== normalizedRootId),
  };
}

function isSpecialRelease(item) {
  const type = String(item?.type || '').toUpperCase();
  const title = String(item?.title || '').toUpperCase();
  if (['MUSIC', 'PV', 'CM', 'TV SPECIAL', 'SPECIAL'].includes(type)) return true;
  return /\b(?:PV|CM)\b/.test(title) || /\bTV SPECIAL\b/.test(title) || /\bSPECIAL\b/.test(title);
}

function filterRelatedItems(items, hideSpecials, currentId = null) {
  if (!Array.isArray(items)) return [];
  const selectedId = asPositiveId(currentId);
  return hideSpecials
    ? items.filter(item => item.id === selectedId || !isSpecialRelease(item))
    : [...items];
}

module.exports = {
  RELATION_LABELS,
  TYPE_PRIORITY,
  aggregateRelatedSeries,
  compareReleaseOrder,
  filterRelatedItems,
  formatDuration,
  isAnimeNode,
  isSpecialRelease,
  normalizeRelatedAnime,
  normalizeRelationType,
};
