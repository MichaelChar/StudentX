// Where the unified /login page sends someone once bootstrap has told it which
// kind of account they have.
//
// `?next=` is honoured unless it points into the OTHER role's area. Before the
// unification a landlord only ever arrived here from a landlord page and a
// student from a student page, so each login page could trust its `next`.
// With one page, a landlord can follow a student-area link (say, a favourites
// gate) and sign in — sending them on to /student/* would only bounce them
// off requireStudent's wrong-role guard. Their home is the better landing.

export const STUDENT_HOME = '/student/account';
export const LANDLORD_HOME = '/property/thessaloniki/landlord/dashboard';

// Path prefix, followed by end, '/', '?' or '#'.
const STUDENT_AREA = /^\/student(?:[/?#]|$)/;
const LANDLORD_AREA = /^\/property\/[^/?#]+\/landlord(?:[/?#]|$)/;

/**
 * @param {'student'|'landlord'} role resolved account type
 * @param {string} safeNext already sanitized by safeNextPath ('' when absent)
 * @returns {string} internal path to navigate to
 */
export function postLoginDestination(role, safeNext) {
  if (role === 'landlord') {
    return safeNext && !STUDENT_AREA.test(safeNext) ? safeNext : LANDLORD_HOME;
  }
  return safeNext && !LANDLORD_AREA.test(safeNext) ? safeNext : STUDENT_HOME;
}
