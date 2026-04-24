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
function decodeHtmlEntities(str) {
  return str.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
}

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
  const entity = ld?.mainEntity || {};

  // Title
  result.title =
    (ld && (ld.name || ld.headline)) ||
    (entity.name || entity.headline) ||
    extractMeta(html, 'og:title') ||
    null;
  if (result.title) {
    // Strip site name suffix if present (e.g. " | spiti.gr")
    result.title = result.title.replace(/\s*[|–—]\s*spiti\.gr\s*$/i, '').trim();
  }

  // Description
  result.description =
    (ld && ld.description) ||
    (entity.description) ||
    extractMeta(html, 'og:description') ||
    extractMeta(html, 'description') ||
    null;

  // Price — check offers on both top-level and entity
  let price = null;
  const offers = ld?.offers || entity?.offers;
  if (offers) {
    const offer = Array.isArray(offers) ? offers[0] : offers;
    price = offer?.price ?? null;
  }
  if (!price) {
    // Fallback: extract from title pattern like "1.000 €"
    const titleText = (result.title || '') + ' ' + extractMeta(html, 'og:title');
    const titleMatch = titleText.match(/(\d[\d.]*)\s*€|€\s*(\d[\d.]*)/);
    if (titleMatch) {
      price = parseFloat((titleMatch[1] || titleMatch[2]).replace(/\./g, '').replace(',', '.'));
    }
  }
  if (!price) {
    // Broader HTML fallback — require 3+ digits to avoid false matches
    const m = html.match(/(\d{3}[\d.,]*)\s*€|€\s*(\d{3}[\d.,]*)/);
    if (m) price = parseFloat((m[1] || m[2]).replace(/\./g, '').replace(',', '.'));
  }
  result.monthly_price = price ? String(price) : null;

  // Address / neighborhood — check both top-level and entity.address
  let address = null;
  let neighborhood = null;
  const addrObj = ld?.address || entity?.address;
  if (addrObj) {
    if (typeof addrObj === 'string') {
      address = addrObj;
    } else {
      const street = addrObj.streetAddress || '';
      const locality = addrObj.addressLocality || '';
      const region = addrObj.addressRegion || '';
      if (street && (street.includes(locality) || street.includes(region))) {
        address = street;
      } else {
        address = [street, locality, region].filter(Boolean).join(', ');
      }
      neighborhood = locality || null;
    }
  }
  if (!address) address = extractMeta(html, 'og:street-address') || null;
  result.address = address;
  result.neighborhood = neighborhood;

  // sqm — check both top-level and entity
  let sqm = null;
  const floorSize = ld?.floorSize || ld?.size || entity?.floorSize || entity?.size;
  if (floorSize) {
    sqm = typeof floorSize === 'object' ? floorSize.value : parseInt(floorSize, 10);
  }
  if (!sqm) {
    sqm = extractSqm(result.title || '');
  }
  if (!sqm) {
    sqm = extractSqm(html.slice(0, 20000));
  }
  result.sqm = sqm ? String(sqm) : null;

  // Floor — from entity if available
  if (entity.floorLevel) {
    const floorMatch = String(entity.floorLevel).match(/(\d+)/);
    result.floor = floorMatch ? String(floorMatch[1]) : null;
  }

  // Photos — prefer JSON-LD image array, then og:image, then gallery scrape
  let ldImages = [];
  const imageField = ld?.image || entity?.image;
  if (imageField) {
    ldImages = (Array.isArray(imageField) ? imageField : [imageField])
      .map((u) => decodeHtmlEntities(u));
  }

  const ogImages = extractAllMetaValues(html, 'og:image').map(decodeHtmlEntities);
  const galleryMatches = [...html.matchAll(/src=["'](https:\/\/[^"']*spiti[^"']*\.(jpg|jpeg|png|webp)[^"']*)/gi)];
  const galleryUrls = galleryMatches.map((m) => decodeHtmlEntities(m[1]));

  const allPhotos = [...new Set([...ldImages, ...ogImages, ...galleryUrls])].filter(
    (u) => !u.includes('logo') && !u.includes('icon')
  );
  result.photos = allPhotos.slice(0, 20);

  return result;
}
