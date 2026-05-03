import { parseSpitiGr } from './spiti.js';
import { parseXeGr } from './xe.js';

const SUPPORTED_DOMAINS = ['spiti.gr', 'xe.gr'];

/**
 * Returns true if the URL is from a supported portal.
 */
export function isSupportedUrl(url) {
  try {
    const { hostname } = new URL(url);
    return SUPPORTED_DOMAINS.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

/**
 * Fetch a listing page and extract structured data.
 *
 * @param {string} url  The listing URL (must be spiti.gr or xe.gr)
 * @returns {{ data: object }|{ error: string, partial?: object }}
 */
export async function importListing(url) {
  if (!isSupportedUrl(url)) {
    return { error: 'Only spiti.gr and xe.gr URLs are supported' };
  }

  let html;
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (compatible; StudentXBot/1.0; +https://studentx.uk)',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'el,en;q=0.9',
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      return { error: `Could not reach that page (HTTP ${res.status}). Please check the URL and try again.` };
    }

    html = await res.text();
  } catch (err) {
    if (err.name === 'TimeoutError' || err.name === 'AbortError') {
      return { error: 'The request timed out. Please check the URL and try again.' };
    }
    const errCode = err.code || err.cause?.code || '';
    const errMsg = err.message || err.cause?.message || '';
    if (errCode === 'CERT_HAS_EXPIRED' || errCode === 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' || errMsg.includes('certificate')) {
      return { error: `Could not securely connect to ${new URL(url).hostname} (SSL certificate issue). You can still fill in the form manually.` };
    }
    return { error: 'Could not reach that page. Please check the URL and try again.' };
  }

  const { hostname } = new URL(url);

  let data;
  if (hostname === 'spiti.gr' || hostname.endsWith('.spiti.gr')) {
    data = parseSpitiGr(html, url);
  } else {
    data = parseXeGr(html, url);
  }

  // Check if we extracted at least something useful
  const hasUsefulData = data.title || data.monthly_price || data.address || data.description;
  if (!hasUsefulData) {
    return {
      error: 'We could not read listing data from this page. You can still fill in the form manually.',
      partial: data,
    };
  }

  return { data };
}
