// ============================================================
//  AnimeTM — Shared Utilities
// ============================================================

export const starSVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="#facc15"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>`;
export const playSVG = `<svg class="play-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>`;

// Inline SVG poster fallback (no external file dependency)
export const FALLBACK_POSTER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300" fill="%23201f1f"><rect width="200" height="300"/><text x="100" y="140" text-anchor="middle" fill="%23555" font-size="48" font-family="sans-serif">🎬</text><text x="100" y="180" text-anchor="middle" fill="%23777" font-size="16" font-family="sans-serif" font-weight="bold">NO IMAGE</text></svg>');

export const FALLBACK_EPISODE_COUNT = 12;
export const HERO_ROTATION_MS = 20000;
export const STREAM_BASE_URL = 'https://megaplay.buzz';
export const YOUTUBE_BASE_URL = 'https://www.youtube.com/watch?v=';

export function stripTags(value) {
    return String(value || '').replace(/<[^>]*>/g, '').trim();
}

export function escapeHTML(value) {
    const div = document.createElement('div');
    div.textContent = String(value || '');
    return div.innerHTML;
}

export function escapeAttr(value) {
    return escapeHTML(value)
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .replace(/\(/g, '&#40;')
        .replace(/\)/g, '&#41;');
}

export function escapeForInlineJS(value) {
    return String(value || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/"/g, '\\"')
        .replace(/`/g, '\\`')
        .replace(/\r/g, '')
        .replace(/\n/g, '\\n')
        .replace(/</g, '\\x3C')
        .replace(/>/g, '\\x3E')
        .replace(/;/g, '\\x3B')
        .replace(/=/g, '\\x3D');
}

export function normalizeId(value) {
    const id = Number.parseInt(value, 10);
    return Number.isFinite(id) ? id : 0;
}

export function safeUrl(url, fallback = '') {
    if (!url) return fallback;
    try {
        const parsed = new URL(url, window.location.href);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.href;
        }
    } catch (error) {
        return fallback;
    }
    return fallback;
}

export function getImageUrl(item) {
    return safeUrl(
        item?.coverImage?.extraLarge ||
        item?.coverImage?.large ||
        item?.image ||
        FALLBACK_POSTER,
        FALLBACK_POSTER
    );
}

export function truncate(str, len) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
}

export function getTypeLabel(item) {
    return item?.format || 'TV';
}

export function getEpisodeCount(item) {
     if (item?.nextAiringEpisode?.episode) return (item.nextAiringEpisode.episode - 1) + ' Ep';
     if (item?.episodes) return item.episodes + ' Ep';
     return 'Ongoing';
}

export function getTitle(item) {
     return item?.title?.english || item?.title?.romaji || 'Unknown';
}

export function getTitleSafe(item) {
     return escapeHTML(getTitle(item));
}

// Raw (unescaped) title for use in double-quoted HTML attributes via escapeAttr.
export function getTitleAttr(item) {
     return escapeAttr(getTitle(item));
}

export function slugify(text) {
    return String(text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
}

export function showModalAlert(message) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-alert-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal-alert-content';

    const text = document.createElement('p');
    text.textContent = message;
    modal.appendChild(text);

    const btn = document.createElement('button');
    btn.textContent = 'OK';
    btn.className = 'modal-alert-btn';
    btn.addEventListener('click', () => overlay.remove());
    modal.appendChild(btn);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
}

// ─── Toast notification system ──────────────────────────
let toastContainer = null;
function ensureToastContainer() {
    if (!toastContainer) {
        toastContainer = document.createElement('div');
        toastContainer.className = 'toast-container';
        document.body.appendChild(toastContainer);
    }
    return toastContainer;
}

export function showToast(message, type = 'error', duration = 4000) {
    const container = ensureToastContainer();
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.animation = 'toastOut 0.3s ease forwards';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// ─── Body scroll lock with scrollbar compensation ─────
// Keyed locks so overlapping overlays (detail + search + player) stay locked
// until every owner has released; re-locking an owner that already holds is a no-op.
const activeLocks = new Set();

export function lockBodyScroll(owner = 'default') {
    if (activeLocks.has(owner)) return;
    activeLocks.add(owner);
    if (activeLocks.size === 1) {
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.documentElement.style.setProperty('--scrollbar-width', scrollbarWidth + 'px');
        document.body.classList.add('scroll-lock');
    }
}

export function unlockBodyScroll(owner = 'default') {
    if (!activeLocks.delete(owner)) return;
    if (activeLocks.size === 0) {
        document.body.classList.remove('scroll-lock');
        document.documentElement.style.removeProperty('--scrollbar-width');
    }
}

// ─── Focus trapping utility ────────────────────────────
let activeFocusTrap = null;

export function trapFocus(element) {
    if (activeFocusTrap) releaseFocusTrap();
    activeFocusTrap = element;
    const focusable = element.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    const firstFocusable = focusable[0];
    if (firstFocusable) firstFocusable.focus();

    function handleKeydown(e) {
        if (e.key !== 'Tab') return;
        const focusableElements = element.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        if (focusableElements.length === 0) return;
        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
    document.addEventListener('keydown', handleKeydown);
    activeFocusTrap._handler = handleKeydown;
    return firstFocusable;
}

export function releaseFocusTrap() {
    if (activeFocusTrap) {
        document.removeEventListener('keydown', activeFocusTrap._handler);
        activeFocusTrap = null;
    }
}

// ─── Create section error element ──────────────────────
export function createErrorElement(message = 'Failed to load content.', onRetry = null) {
    const el = document.createElement('div');
    el.className = 'section-error';
    el.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>
        <p>${escapeHTML(message)}</p>
    `;
    if (onRetry) {
        const btn = document.createElement('button');
        btn.className = 'retry-btn';
        btn.textContent = 'Retry';
        btn.addEventListener('click', onRetry);
        el.appendChild(btn);
    }
    return el;
}

// ─── AbortController helper for API calls ──────────────
let activeAbortControllers = new Map();

export function getAbortSignal(key) {
    if (activeAbortControllers.has(key)) {
        activeAbortControllers.get(key).abort();
    }
    const controller = new AbortController();
    activeAbortControllers.set(key, controller);
    return controller.signal;
}

export function clearAbortController(key) {
    activeAbortControllers.delete(key);
}
