// Id + claim-token minting for the pending pipeline. Uses Web Crypto, available
// both on the Cloudflare Worker runtime and in Node 22 (dev/tests).

export const newPendingLandlordId = () => 'pl_' + crypto.randomUUID();
export const newPendingListingId = () => 'pli_' + crypto.randomUUID();

/** 64 hex chars (256 bits) of CSPRNG — the magic claim-link secret. */
export function newClaimToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
