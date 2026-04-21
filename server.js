// ============================================================
//  AnimeTM — MAL API Proxy Server
//  Runs on http://localhost:3001
//  Forwards all requests to MAL API with Client ID auth
// ============================================================

const express = require('express');
const cors = require('cors');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(compression());

// Serve static files from root directory
app.use(express.static(__dirname));

// Root route
app.get('/', (_, res) => {
  res.sendFile(__dirname + '/index.html');
});

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://localhost:3001,http://localhost:5173,http://127.0.0.1:3000,http://127.0.0.1:5500,http://localhost:5500').split(',').map(o => o.trim()).filter(Boolean);
app.use(cors({
  origin: (origin, callback) => {
    // Allow all local dev origins, null (file://), hosting domains, or anything in the list
    if (!origin
      || origin.startsWith('http://localhost')
      || origin.startsWith('http://127.0.0.1')
      || origin.endsWith('.onrender.com')
      || origin.endsWith('.netlify.app')
      || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Origin not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use((err, req, res, next) => {
  if (err.message && err.message.includes('Origin not allowed')) {
    return res.status(403).json({ error: 'CORS not allowed' });
  }
  next(err);
});

const MAL_BASE = 'https://api.myanimelist.net/v2';
const MAL_CLIENT_ID = process.env.MAL_CLIENT_ID || '6114d00ca681b7701d1e15fe11a4987e';

if (!MAL_CLIENT_ID) {
  console.error('\n  ❌  FATAL: MAL_CLIENT_ID environment variable is missing.');
  console.error('      Please set it before running the server.\n');
  process.exit(1);
}

const FETCH_TIMEOUT = 10000;
const CACHE_MAX_SIZE = 200;
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 100;

const STANDARD_FIELDS = [
  'id', 'title', 'main_picture', 'alternative_titles',
  'start_date', 'synopsis', 'mean', 'rank', 'popularity',
  'num_episodes', 'status', 'genres', 'media_type',
  'start_season', 'average_episode_duration', 'rating', 'source'
].join(',');

const RELATION_FIELDS = 'related_anime{relation_type,node{id,title,main_picture,alternative_titles,start_date,mean,num_episodes,status,genres,media_type,start_season,rating}}';

// ─── Middleware ───────────────────────────────────────────────
app.use(cors()); // Allow all origins
app.use(express.json());

// ─── MAL fetch helper ─────────────────────────────────────────
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const ipRequests = new Map();

function rateLimit(req, res, next) {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const record = ipRequests.get(ip);
  if (record && now - record.windowStart < RATE_LIMIT_WINDOW) {
    if (record.count >= RATE_LIMIT_MAX) {
      return res.status(429).json({ error: 'Too many requests. Please slow down.' });
    }
    record.count++;
  } else {
    ipRequests.set(ip, { windowStart: now, count: 1 });
  }
  next();
}

app.use(express.json({ limit: '100kb' }));

app.use((req, res, next) => {
  if (req.method === 'GET') {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string' && req.query[key].length > 2000) {
        return res.status(400).json({ error: 'Query parameter too long' });
      }
    }
  }
  next();
});

app.use(rateLimit);

function evictCache() {
  if (cache.size >= CACHE_MAX_SIZE) {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, val] of cache) {
      if (val.timestamp < oldestTime) {
        oldestTime = val.timestamp;
        oldestKey = key;
      }
    }
    if (oldestKey) cache.delete(oldestKey);
  }
}

async function malFetch(path, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `${MAL_BASE}${path}${qs ? '?' + qs : ''}`;
  const cacheKey = url;

  if (cache.has(cacheKey)) {
    const cached = cache.get(cacheKey);
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return cached.data;
    }
  }

  evictCache();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT);

  try {
    const res = await fetch(url, {
      headers: {
        'X-MAL-CLIENT-ID': MAL_CLIENT_ID,
        'Accept': 'application/json',
      },
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const txt = await res.text();
      throw new Error(`MAL API returned ${res.status}: ${txt}`);
    }

    const data = await res.json();
    cache.set(cacheKey, { data, timestamp: Date.now() });
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('MAL API request timed out');
    }
    throw error;
  }
}

// ─── Normaliser ───────────────────────────────────────────────
function normalize(raw) {
  if (!raw) return null;
  const n = raw.node || raw;

  const STATUS_MAP = {
    currently_airing: 'RELEASING',
    finished_airing: 'FINISHED',
    not_yet_aired: 'NOT_YET_RELEASED',
  };

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
    episodes: n.num_episodes || null,
    averageScore: n.mean ? Math.round(n.mean * 10) : 0,
    meanScore: n.mean ? Math.round(n.mean * 10) : 0,
    seasonYear: n.start_season?.year || (n.start_date ? parseInt(n.start_date.slice(0, 4)) : null),
    genres: (n.genres || []).map(g => g.name),
    description: n.synopsis || '',
    isAdult: n.rating === 'rx',
    duration: n.average_episode_duration ? Math.round(n.average_episode_duration / 60) : null,
  };
}

// ─── Routes ───────────────────────────────────────────────────

// GET /api/spotlight  — top airing for hero + top10
app.get('/api/spotlight', async (req, res) => {
  try {
    const date = new Date();
    const year = date.getFullYear();
    const month = date.getMonth(); // 0-11
    let season = 'winter';
    if (month >= 2 && month <= 4) season = 'spring';
    else if (month >= 5 && month <= 7) season = 'summer';
    else if (month >= 8 && month <= 10) season = 'fall';

    const data = await malFetch(`/anime/season/${year}/${season}`, {
      sort: 'anime_score',
      limit: 10,
      fields: STANDARD_FIELDS,
    });
    res.json((data?.data ?? []).map(normalize));
  } catch (e) {
    console.error('[/api/spotlight]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/trending?page=1
app.get('/api/trending', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const data = await malFetch('/anime/ranking', {
      ranking_type: 'bypopularity',
      limit,
      offset: (page - 1) * limit,
      fields: STANDARD_FIELDS,
    });
    res.json((data?.data ?? []).map(normalize));
  } catch (e) {
    console.error('[/api/trending]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/recent?page=1  — recent / this season
app.get('/api/recent', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 24;
    const data = await malFetch('/anime/ranking', {
      ranking_type: 'airing',
      limit,
      offset: (page - 1) * limit,
      fields: STANDARD_FIELDS,
    });
    res.json((data?.data ?? []).map(normalize));
  } catch (e) {
    console.error('[/api/recent]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/search?q=naruto&page=1
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json([]);
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const data = await malFetch('/anime', {
      q,
      limit,
      offset: (page - 1) * limit,
      fields: STANDARD_FIELDS,
    });
    res.json((data?.data ?? []).map(normalize));
  } catch (e) {
    console.error('[/api/search]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/browse?category=airing&page=1
app.get('/api/browse', async (req, res) => {
  const catMap = {
    movie: 'movie',
    tv: 'tv',
    airing: 'airing',
    bypopularity: 'bypopularity',
  };
  try {
    const cat = catMap[req.query.category] ?? 'bypopularity';
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 24;
    const data = await malFetch('/anime/ranking', {
      ranking_type: cat,
      limit,
      offset: (page - 1) * limit,
      fields: STANDARD_FIELDS,
    });
    res.json({
      results: (data?.data ?? []).map(normalize),
      hasNextPage: !!data?.paging?.next,
    });
  } catch (e) {
    console.error('[/api/browse]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/anime/:id  — full details
app.get('/api/anime/:id', async (req, res) => {
  try {
    const data = await malFetch(`/anime/${req.params.id}`, {
      fields: STANDARD_FIELDS + ',' + RELATION_FIELDS,
    });
    res.json(normalize(data));
  } catch (e) {
    console.error('[/api/anime/:id]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/anime/:id/episodes
app.get('/api/anime/:id/episodes', async (req, res) => {
  const animeId = req.params.id;
  try {
    const data = await malFetch(`/anime/${animeId}`, { fields: 'num_episodes,status,alternative_titles' });
    let total = data?.num_episodes || 0;
    const status = data?.status;

    // Special handling for One Piece (MAL ID: 21)
    if (animeId === '21') {
      // One Piece has ~1100+ episodes on MAL but usually more on streaming.
      // We take the max of MAL count and a safe buffer if it's currently airing.
      if (status === 'currently_airing') {
        // If MAL reports a count, we add a small buffer for the very latest episodes
        // that might not be synced to MAL yet.
        total = Math.max(total, 1150);
      }
    }

    // Generic fallback for currently airing anime with 0 episodes in MAL
    if (status === 'currently_airing' && total === 0) {
      total = 1000; // Large buffer for ongoing shows with unknown length
    }

    // Default fallback
    if (total === 0) total = 12;

    res.json(
      Array.from({ length: total }, (_, i) => ({
        id: i + 1,
        title: `Episode ${i + 1}`,
        image: '',
      }))
    );
  } catch (e) {
    console.error('[/api/anime/:id/episodes]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// GET /api/anime/:id/seasons
app.get('/api/anime/:id/seasons', async (req, res) => {
  try {
    const data = await malFetch(`/anime/${req.params.id}`, { fields: RELATION_FIELDS });
    const valid = new Set(['prequel', 'sequel', 'alternative_version', 'parent_story', 'side_story']);
    const list = (data?.related_anime ?? [])
      .filter(r => valid.has(r.relation_type) && r.node)
      .map(r => normalize(r.node));
    res.json(list);
  } catch (e) {
    console.error('[/api/anime/:id/seasons]', e.message);
    res.status(502).json({ error: e.message });
  }
});

// ─── Health check ─────────────────────────────────────────────
app.get('/api/health', (_, res) => res.json({ status: 'ok', timestamp: Date.now() }));

// ─── Global Error Handler ──────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[Global Error]', err.stack);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

// ─── Start ────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n  ✅  AnimeTM Proxy running → http://localhost:${PORT}`);
  console.log(`  📡  Forwarding MAL API requests with Client ID\n`);
});
