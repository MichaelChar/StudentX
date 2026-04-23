/**
 * Parser for spiti.gr listing pages.
 * Extraction strategy: JSON-LD first, then og: meta tags, then HTML fallback.
 */

/**
 * Extract the first JSON-LD block of type RealEstateListing / Product / Thing.
 */
function extractJsonLd(html) {
  const matches = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const m of matches) {
    try {
      const data = JSON.parse(m[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item && (item['@type'] === 'RealEstateListing' || item['@type'] === 'Apartment' || item['@type'] === 'Product' || item['offers'] || item['name'])) {
          return item;
        }
      }
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return null;
}

function extractMeta(html, property) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${property}["']`, 'i'));
  return m ? m[1].trim() : null;
}

function extractAllMetaValues(html, property) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']+)["']`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(html)) !== null) results.push(m[1].trim());
  return results;
}

/**
 * Extract sqm from text like "85 τ.μ." or "85τμ"
 */
function extractSqm(text) {
  if (!text) return null;
  const m = text.match(/(\d+)\s*(?:τ\.?μ\.?|τμ|m²)/i);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Parse a spiti.gr listing HTML page.
 * @param {string} html
 * @param {string} url  The source URL
 * @returns {object}  Partial listing fields
 */
export function parseSpitiGr(html, url) {
  const result = { source_url: url };

  const ld = extractJsonLd(html);

  // Title
  result.title =
    (ld && (ld.name || ld.headline)) ||
    extractMeta(html, 'og:title') ||
    null;
  if (result.title) {
    // Strip site name suffix if present (e.g. " | spiti.gr")
    result.title = result.title.replace(/\s*[|–—]\s*spiti\.gr\s*$/i, '').trim();
  }

  // Description
  result.description =
    (ld && ld.description) ||
    extractMeta(html, 'og:description') ||
    extractMeta(html, 'description') ||
    null;

  // Price
  let price = null;
  if (ld && ld.offers) {
    const offers = Array.isArray(ld.offers) ? ld.offers[0] : ld.offers;
    price = offers?.price ?? null;
  }
  if (!price) {
    // Fallback: look for €NNN or NNN€ pattern in text
    const m = html.match(/[€]\s*(\d[\d.,]*)|(\d[\d.,]*)\s*[€]/);
    if (m) price = parseFloat((m[1] || m[2]).replace(',', '.'));
  }
  result.monthly_price = price ? String(price) : null;

  // Address / neighborhood
  let address = null;
  let neighborhood = null;
  if (ld && ld.address) {
    const addr = ld.address;
    if (typeof addr === 'string') {
      address = addr;
    } else {
      address = [addr.streetAddress, addr.addressLocality, addr.addressRegion]
        .filter(Boolean).join(', ');
      neighborhood = addr.addressLocality || null;
    }
  }
  if (!address) address = extractMeta(html, 'og:street-address') || null;
  result.address = address;
  result.neighborhood = neighborhood;

  // sqm
  let sqm = null;
  if (ld && (ld.floorSize || ld.size)) {
    const fs = ld.floorSize || ld.size;
    sqm = typeof fs === 'object' ? fs.value : parseInt(fs, 10);
  }
  if (!sqm) {
    sqm = extractSqm(html.slice(0, 20000)); // only scan first 20k chars
  }
  result.sqm = sqm ? String(sqm) : null;

  // Photos — og:image values + gallery img srcs
  const ogImages = extractAllMetaValues(html, 'og:image');
  // Also grab gallery images from spiti.gr typical markup
  const galleryMatches = [...html.matchAll(/src=["'](https:\/\/[^"']*spiti[^"']*\.(jpg|jpeg|png|webp)[^"']*)/gi)];
  const galleryUrls = galleryMatches.map((m) => m[1]);

  const allPhotos = [...new Set([...ogImages, ...galleryUrls])].filter(
    (u) => !u.includes('logo') && !u.includes('icon')
  );
  result.photos = allPhotos.slice(0, 20); // cap at 20

  return result;
}
