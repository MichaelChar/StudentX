/**
 * Sanitize a user-supplied `?next=` redirect target down to a safe,
 * same-origin path. Returns the path unchanged when it is a plain
 * root-relative path, or '' for anything that could navigate off-origin.
 *
 * The naive `raw.startsWith('/')` guard this replaces is NOT enough — a
 * browser resolves all of the following to a CROSS-origin destination even
 * though every one starts with '/', so handing them to
 * `window.location.assign()` (or threading them back through a `?next=`
 * link) is an open-redirect / phishing primitive:
 *
 *   - protocol-relative:   "//evil.com/x"        -> https://evil.com/x
 *   - backslash-smuggled:  a leading slash then a backslash, which the
 *     WHATWG URL parser normalizes to "//" -> cross-origin
 *   - whitespace-smuggled: a tab/newline between the slashes, which the
 *     browser strips and then re-parses as protocol-relative
 *
 * We therefore require: a single leading '/', whose next character is
 * neither '/' (code 47) nor '\\' (code 92), and which contains no C0
 * control characters or DEL. Valid in-app paths (with query + hash) pass
 * through byte-for-byte.
 */
export function safeNextPath(raw) {
  if (typeof raw !== 'string' || raw === '') return '';
  if (raw[0] !== '/') return ''; // must be root-relative
  // Reject protocol-relative ('//…') and backslash-smuggled (slash then
  // code-92 backslash) second characters — both resolve cross-origin.
  if (raw[1] === '/' || raw.charCodeAt(1) === 92) return '';
  // Reject C0 control chars (<= 0x1f) and DEL (0x7f): browsers strip
  // tab/newline/CR from URLs and re-parse, which can turn a split value
  // into a protocol-relative URL.
  for (let i = 0; i < raw.length; i += 1) {
    const code = raw.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return '';
  }
  return raw;
}
