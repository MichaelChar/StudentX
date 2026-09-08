// Site-agnostic listing ingest: bare fetch() + Cloudflare Workers AI extraction.
// No external API keys, no paid scraping service. Every external dependency
// (fetch, the AI binding, the Supabase service client) is passed in, so the
// whole pipeline is unit-testable with mocks.

import {
  PROPERTY_TYPE_ENUM,
  parseExtractionJson,
  resolvePhotoUrl,
  photoExtFromUrl,
  sourceTagFromUrl,
  toIntOrNull,
} from '@/lib/pendingMappers';

export const EXTRACTION_MODEL = '@cf/meta/llama-3.1-8b-instruct';
export const PENDING_BUCKET = 'pending-photos';
const MAX_HTML_CHARS = 24000; // ~6000 tokens for Llama 3.1 8B
const MIN_HTML_BYTES = 2048; // bodies shorter than this are treated as bot-challenge/empty
const MAX_PHOTOS = 12;
const FETCH_TIMEOUT_MS = 15000;

// Realistic latest-Chrome headers. el-GR first because the target sites are Greek.
export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'el-GR,el;q=0.9,en-US;q=0.8,en;q=0.7',
  'Accept-Encoding': 'gzip, deflate, br',
  'Upgrade-Insecure-Requests': '1',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
};

// Exact extraction contract from the spec. The model must return ONLY JSON.
export const EXTRACTION_SYSTEM_PROMPT = `You are a real-estate listing extraction service. Given the HTML body of a single listing page, extract the listing data and return ONLY valid JSON (no commentary, no markdown fences). Use this exact schema:

{
  "address": string | null,
  "neighborhood": string | null,
  "beds": integer | null,
  "baths": integer | null,
  "sqm": integer | null,
  "price_eur_month": integer | null,
  "property_type": "studio" | "1-bed" | "2-bed" | "3-bed" | "room" | "other",
  "description": string,
  "photo_urls": [string],
  "contact_phone": string | null,
  "contact_email": string | null
}

Rules:
- Return null for any field you cannot confidently determine
- photo_urls must be absolute URLs (resolve any relative paths against the page origin)
- price_eur_month must be in EUR per month — convert weekly/daily prices to monthly if needed
- description should be a clean, paragraph-form summary in English (translate if necessary)
- Strictly valid JSON. No trailing commas. No commentary outside the JSON object.`;

// A response is "blocked" (bot challenge / error / empty) when we should give up
// and mark the listing needs_manual_entry rather than feed garbage to the model.
export function isBlockedResponse(status, body) {
  if (status === 403 || status === 429 || status >= 500) return true;
  if (!body || body.length < MIN_HTML_BYTES) return true;
  const lower = body.slice(0, 4000).toLowerCase();
  const markers = [
    'just a moment',
    'cf-browser-verification',
    '/cdn-cgi/challenge-platform',
    'attention required',
    'captcha-delivery',
    'please enable javascript and cookies',
    'verifying you are human',
  ];
  return markers.some((m) => lower.includes(m));
}

/*
  SSRF guard (#248).

  The original issue was written against `src/lib/importers/index.js`, the
  spiti.gr/xe.gr URL importer, which was deleted in #367. The surface did not
  go away with it — it moved here, and in one respect got wider: that importer
  had a two-host allowlist, and this pipeline is deliberately SITE-AGNOSTIC, so
  an allowlist is not available as a mitigation.

  Two call paths fetch remote URLs, and the second is the one that matters:

    fetchListingHtml       an admin pastes the URL
    downloadPhotosToBucket the URLs come from the SCRAPED PAGE, chosen by an
                           LLM reading attacker-controlled HTML

  So a hostile listing page can hand us `<img src="http://169.254.169.254/...">`
  and the Worker would fetch it. Admin-gating the routes does not help, because
  the admin never sees or approves these URLs.

  What this blocks: loopback, private RFC1918, link-local (which includes the
  169.254.169.254 cloud metadata endpoint), and anything not http(s). What it
  deliberately does NOT do is resolve DNS — a hostname pointing at a private
  address still passes. Blocking that properly needs resolution before connect,
  which the Workers runtime does not expose. This raises the bar from "trivial"
  to "needs a DNS record you control"; it is not a complete defence and should
  not be described as one.
*/
export function isDisallowedHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;

  const v4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0 || a === 127 || a === 10) return true;
    if (a === 169 && b === 254) return true; // link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
  }

  // IPv6 literals arrive bracketed from URL.hostname
  if (h === '[::1]' || h === '::1') return true;
  if (h.startsWith('[fc') || h.startsWith('[fd') || h.startsWith('[fe80')) return true;
  if (h.startsWith('fc') || h.startsWith('fd') || h.startsWith('fe80')) return true;
  return false;
}

/** http(s) only, and not pointed at a private/loopback/link-local host. */
export function isFetchableUrl(raw) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return false;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
  return !isDisallowedHost(u.hostname);
}

const MAX_HTML_BYTES = 2 * 1024 * 1024; // 2 MB — a listing page is far smaller
const MAX_PHOTO_BYTES = 8 * 1024 * 1024; // 8 MB — a generous single photo
const MAX_REDIRECTS = 2;

// Fetch with browser headers + a hard timeout. Never throws — failures resolve to
// { ok: false, reason }, so the caller can mark needs_manual_entry and move on.
export async function fetchListingHtml(url, fetchImpl = fetch) {
  if (!isFetchableUrl(url)) return { ok: false, reason: 'blocked_host' };

  let res;
  let current = String(url);
  try {
    /*
      `redirect: 'manual'` so each hop is re-checked. Following automatically
      would let a public URL redirect to a private one — the classic bypass of
      a front-door host check.
    */
    for (let hop = 0; ; hop += 1) {
      res = await fetchImpl(current, {
        headers: BROWSER_HEADERS,
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (res.status < 300 || res.status >= 400) break;
      const loc = res.headers.get?.('location');
      if (!loc) break;
      if (hop >= MAX_REDIRECTS) return { ok: false, reason: 'too_many_redirects' };
      current = new URL(loc, current).toString();
      if (!isFetchableUrl(current)) return { ok: false, reason: 'blocked_redirect' };
    }
  } catch {
    return { ok: false, reason: 'fetch_failed' };
  }

  let body = '';
  try {
    // Bounded read: a hostile or merely enormous page must not exhaust the
    // Worker's memory. arrayBuffer() so the cap is in BYTES, before decoding.
    const buf = await res.arrayBuffer();
    if (buf.byteLength > MAX_HTML_BYTES) {
      return { ok: false, reason: 'too_large', status: res.status };
    }
    body = new TextDecoder('utf-8').decode(buf);
  } catch {
    return { ok: false, reason: 'read_failed', status: res.status };
  }
  if (isBlockedResponse(res.status, body)) {
    return { ok: false, reason: 'blocked', status: res.status };
  }
  return { ok: true, html: body, finalUrl: res.url || url, status: res.status };
}

// Strip script/style/noscript/nav/header/footer/comments + best-effort
// aria-hidden icons, collapse whitespace, truncate to the model budget. Keeps
// <head> meta (og:image/title) and <img>/<a> so photo URLs survive.
export function preprocessHtml(html) {
  if (!html || typeof html !== 'string') return '';
  let s = html;
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ');
  s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');
  s = s.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ');
  // visual chrome (NB: \b means <header> matches but <head> does not)
  s = s.replace(/<(nav|footer|header)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ');
  // common aria-hidden icon wrappers
  s = s.replace(/<svg\b[^>]*aria-hidden=["']true["'][\s\S]*?<\/svg>/gi, ' ');
  s = s.replace(/<i\b[^>]*aria-hidden=["']true["'][^>]*>[\s\S]*?<\/i>/gi, ' ');
  s = s.replace(/[ \t\f\v\r]+/g, ' ');
  s = s.replace(/(\s*\n\s*){2,}/g, '\n');
  s = s.trim();
  if (s.length > MAX_HTML_CHARS) s = s.slice(0, MAX_HTML_CHARS);
  return s;
}

// Run the model and parse its JSON. Throws only if the AI binding itself throws
// (e.g. unavailable) — the caller distinguishes that (status 'error') from a
// parseable-but-empty result (needs_manual_entry).
export async function extractListingFields(ai, htmlText) {
  const result = await ai.run(EXTRACTION_MODEL, {
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: htmlText },
    ],
    max_tokens: 1024,
    temperature: 0.1,
  });
  const text = typeof result === 'string' ? result : result?.response ?? '';
  return parseExtractionJson(text);
}

// Download each photo and upload to pending-photos/pending/<listingId>/photo-N.ext.
// Failures skip that photo (never fatal). Returns [{ path, url }].
export async function downloadPhotosToBucket({ supabase, listingId, photoUrls, fetchImpl = fetch, max = MAX_PHOTOS }) {
  const out = [];
  for (let i = 0; i < photoUrls.length && out.length < max; i++) {
    const src = photoUrls[i];
    try {
      // These URLs came out of the scraped page, not from the admin — see the
      // SSRF note above. Skip rather than fail: one bad photo must not sink
      // the whole ingest.
      if (!isFetchableUrl(src)) continue;
      const r = await fetchImpl(src, {
        headers: BROWSER_HEADERS,
        redirect: 'manual',
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!r.ok) continue;
      const ct = r.headers.get('content-type') || '';
      if (ct && !ct.startsWith('image/')) continue;
      const buf = await r.arrayBuffer();
      if (!buf || buf.byteLength === 0) continue;
      if (buf.byteLength > MAX_PHOTO_BYTES) continue;
      const ext = photoExtFromUrl(src);
      const path = `pending/${listingId}/photo-${out.length}.${ext}`;
      const { error } = await supabase.storage
        .from(PENDING_BUCKET)
        .upload(path, buf, { contentType: ct || `image/${ext}`, upsert: true });
      if (error) continue;
      const { data } = supabase.storage.from(PENDING_BUCKET).getPublicUrl(path);
      out.push({ path, url: data.publicUrl });
    } catch {
      continue;
    }
  }
  return out;
}

/**
 * Full ingest for one URL. Returns a pending_listings row object (WITHOUT id /
 * pending_landlord_id — the caller owns those) plus its status. Side effect:
 * downloaded photos are uploaded to pending-photos under `id`.
 *
 * status:
 *   - 'pending'             extraction succeeded
 *   - 'needs_manual_entry'  fetch blocked / body too short / unparseable JSON
 *   - 'error'              the AI binding threw (e.g. not available in this env)
 */
export async function buildPendingListing({ url, ai, supabase, id, fetchImpl = fetch }) {
  const base = { source_url: url, source_type: sourceTagFromUrl(url), photos_json: [] };

  const fetched = await fetchListingHtml(url, fetchImpl);
  if (!fetched.ok) return { ...base, status: 'needs_manual_entry' };

  const text = preprocessHtml(fetched.html);
  if (text.length < 200) return { ...base, status: 'needs_manual_entry' };

  let extracted;
  try {
    extracted = await extractListingFields(ai, text);
  } catch {
    return { ...base, status: 'error' };
  }
  if (!extracted || typeof extracted !== 'object') {
    return { ...base, status: 'needs_manual_entry' };
  }

  const origin = fetched.finalUrl || url;
  const photoUrls = Array.isArray(extracted.photo_urls)
    ? extracted.photo_urls.map((u) => resolvePhotoUrl(u, origin)).filter(Boolean)
    : [];
  const photos = await downloadPhotosToBucket({ supabase, listingId: id, photoUrls, fetchImpl });

  const propertyType = PROPERTY_TYPE_ENUM.includes(extracted.property_type) ? extracted.property_type : 'other';

  return {
    ...base,
    status: 'pending',
    address: typeof extracted.address === 'string' ? extracted.address.slice(0, 500) : null,
    neighborhood: typeof extracted.neighborhood === 'string' ? extracted.neighborhood.slice(0, 200) : null,
    beds: toIntOrNull(extracted.beds),
    baths: toIntOrNull(extracted.baths),
    sqm: toIntOrNull(extracted.sqm),
    price_eur_month: toIntOrNull(extracted.price_eur_month),
    property_type: propertyType,
    description: typeof extracted.description === 'string' ? extracted.description.slice(0, 4000) : null,
    photos_json: photos,
    contact_phone_extracted: typeof extracted.contact_phone === 'string' ? extracted.contact_phone.slice(0, 100) : null,
    contact_email_extracted: typeof extracted.contact_email === 'string' ? extracted.contact_email.slice(0, 200) : null,
  };
}
