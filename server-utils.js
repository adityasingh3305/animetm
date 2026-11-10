// ============================================================
//  AnimeTM — Server Utilities (testable functions)
// ============================================================

const STATUS_MAP = {
  currently_airing: 'RELEASING',
  finished_airing: 'FINISHED',
  not_yet_aired: 'NOT_YET_RELEASED',
};

/**
 * Calculates the current airing episode number based on the start date.
 * Assumes weekly episode schedule.
 */
function getAiringEpisode(startDateStr) {
  if (!startDateStr) return null;
  const start = new Date(startDateStr);
  if (isNaN(start.getTime())) return null;
  const days = Math.max(0, (Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
  const ep = Math.floor(days / 7) + 1;
  return {
    episode: ep,
    nextEpisode: ep + 1,
    airingAt: Math.floor((start.getTime() + ep * 7 * 24 * 60 * 60 * 1000) / 1000)
  };
}

/**
 * Normalizes a raw MAL API anime object.
 */
function normalize(raw) {
  if (!raw) return null;
  const n = raw.node || raw;
  const airing = n.status === 'currently_airing' ? getAiringEpisode(n.start_date) : null;
  const dateParts = String(n.start_date || '').match(/^(\d{4})(?:-(\d{2}))?(?:-(\d{2}))?/);
  const startDate = dateParts ? {
    year: Number(dateParts[1]),
    month: dateParts[2] ? Number(dateParts[2]) : null,
    day: dateParts[3] ? Number(dateParts[3]) : null,
  } : null;

  return {
    id: n.id,
    malId: n.id,
    title: {
      romaji: n.title || 'Unknown',
      english: n.alternative_titles?.en || n.title || 'Unknown',
      native: n.alternative_titles?.ja || n.title || 'Unknown',
    },
    coverImage: {
      extraLarge: n.main_picture?.large || n.main_picture?.medium || '',
      large: n.main_picture?.medium || n.main_picture?.large || '',
    },
    bannerImage: n.main_picture?.large || '',
    format: (n.media_type || 'tv').replace(/_/g, ' ').toUpperCase(),
    status: STATUS_MAP[n.status] || 'FINISHED',
    episodes: n.num_episodes || (airing ? airing.episode : null),
    nextAiringEpisode: airing ? { episode: airing.nextEpisode, airingAt: airing.airingAt } : null,
    averageScore: n.mean ? Math.round(n.mean * 10) : 0,
    seasonYear: n.start_season?.year || (n.start_date ? parseInt(n.start_date.slice(0, 4)) : null),
    startDate,
    genres: (n.genres || []).map(g => g.name),
    description: n.synopsis || '',
    isAdult: n.rating === 'rx',
    duration: n.average_episode_duration ? Math.round(n.average_episode_duration / 60) : null,
  };
}

/**
 * Calculates offset and limit for pagination.
 */
function getPagination(page, defaultLimit = 20) {
  const parsedPage = Math.min(Math.max(1, parseInt(page) || 1), 500); // Cap at 500 pages
  return {
    limit: defaultLimit,
    offset: (parsedPage - 1) * defaultLimit,
  };
}

/**
 * Determines the current anime season based on the date.
 */
function getCurrentSeason() {
  const date = new Date();
  const year = date.getFullYear();
  const month = date.getMonth(); // 0-11
  let season = 'winter';
  if (month >= 3 && month <= 5) season = 'spring';
  else if (month >= 6 && month <= 8) season = 'summer';
  else if (month >= 9 && month <= 11) season = 'fall';
  return { year, season };
}

/**
 * Picks the best artwork URLs from an AniZip `images` array.
 * AniZip returns [{ coverType: 'Poster'|'Banner'|'Fanart'|'Clearlogo', url }, ...].
 * @param {Array} rawImages - AniZip `images` array
 * @returns {{ poster: string|null, banner: string|null, fanart: string|null }|null}
 */
function distillAnizipArtwork(rawImages) {
  if (!Array.isArray(rawImages) || rawImages.length === 0) return null;
  const byType = (t) => {
    const found = rawImages.find(i => i && i.coverType === t && typeof i.url === 'string' && i.url);
    return found ? found.url : null;
  };
  const poster = byType('Poster') || byType('Fanart') || byType('Banner') || null;
  const fanart = byType('Fanart') || byType('Banner') || byType('Poster') || null;
  const banner = byType('Banner') || fanart || poster || null;
  if (!poster && !banner && !fanart) return null;
  return { poster, banner, fanart };
}

/**
 * Reduces a raw AniZip `episodes` object to a sorted array of regular episodes.
 *
 * AniZip keys regular episodes as "1".."N" and specials/extras as "S1".. / "O1".
 * Only numeric keys are kept, and the result is capped at `episodeCount` because
 * movies list alternate cuts as extra numeric keys (e.g. mal 199 has keys 1-10
 * but episodeCount 1).
 *
 * Note: `id` is always the LOCAL episode number (the object key). Never use
 * `absoluteEpisodeNumber` as the id — it breaks the megaplay stream URL.
 *
 * @param {object} rawEpisodes - AniZip `episodes` map
 * @param {number} [episodeCount] - AniZip `episodeCount` used to cap extras
 * @returns {Array|null} episodes, or null when there are none
 */
function distillAnizip(rawEpisodes, episodeCount) {
  if (!rawEpisodes || typeof rawEpisodes !== 'object') return null;

  let ids = Object.keys(rawEpisodes)
    .filter(k => /^[0-9]+$/.test(k))
    .map(Number)
    .sort((a, b) => a - b);

  if (ids.length === 0) return null;
  if (Number.isInteger(episodeCount) && episodeCount > 0) {
    ids = ids.slice(0, episodeCount);
  }
  if (ids.length === 0) return null;

  return ids.map(id => {
    const ep = rawEpisodes[String(id)] || {};
    return {
      id,
      title: ep.title?.en || ep.title?.ja || ep.title?.['x-jat'] || '',
      image: typeof ep.image === 'string' ? ep.image : '',
      airedAt: ep.airDate || ep.airdate || null,
      absoluteEpisodeNumber: Number.isInteger(ep.absoluteEpisodeNumber) ? ep.absoluteEpisodeNumber : null,
      runtime: Number.isFinite(ep.runtime) ? ep.runtime : (Number.isFinite(ep.length) ? ep.length : null),
    };
  });
}

/**
 * Builds the final episode list from up to three sources.
 *
 * The episode set (ids, order, count) comes from the first available source:
 * anikoto > anizip > mal. `airedAt` is deliberately taken from the chosen
 * source only — anikoto reports null (always visible), so enriching it with
 * AniZip dates could hide currently-playable episodes in the player's
 * future-date filter.
 *
 * @param {{anikoto?: Array, anizip?: Array, mal?: Array}} sources
 * @returns {Array} normalized episode objects
 */
function buildEpisodeList({ anikoto = null, anizip = null, mal = null } = {}) {
  const chosen = [['anikoto', anikoto], ['anizip', anizip], ['mal', mal]]
    .find(([, list]) => Array.isArray(list) && list.length > 0);
  if (!chosen) return [];
  const [skeletonName, skeleton] = chosen;

  const indexById = (list) => {
    const map = new Map();
    if (Array.isArray(list)) for (const ep of list) map.set(String(ep.id), ep);
    return map;
  };
  const anikotoById = skeletonName === 'anikoto' ? null : indexById(anikoto);
  const anizipById = skeletonName === 'anizip' ? null : indexById(anizip);

  return skeleton.map((base) => {
    const key = String(base.id);
    const ak = skeletonName === 'anikoto' ? base : anikotoById?.get(key);
    const az = skeletonName === 'anizip' ? base : anizipById?.get(key);
    const anikotoTitle = ak?.title ? String(ak.title).trim() : '';
    const anizipTitle = az?.title ? String(az.title).trim() : '';

    return {
      id: base.id,
      title: anikotoTitle || anizipTitle || base.title || `Episode ${base.id}`,
      // AniZip has the episode artwork. Prefer it even when Anikoto supplies
      // the episode skeleton, while retaining the provider image as a
      // fallback for episodes AniZip does not cover.
      image: typeof az?.image === 'string' && az.image
        ? az.image
        : (typeof base.image === 'string' ? base.image : ''),
      airedAt: base.airedAt ?? null,
      embed_id: ak?.embed_id ?? base.embed_id ?? null,
      absoluteEpisodeNumber: az?.absoluteEpisodeNumber ?? base.absoluteEpisodeNumber ?? null,
      runtime: az?.runtime ?? base.runtime ?? null,
    };
  });
}

module.exports = {
  getAiringEpisode,
  normalize,
  getPagination,
  getCurrentSeason,
  distillAnizipArtwork,
  distillAnizip,
  buildEpisodeList,
  STATUS_MAP,
};
