import { formatChf } from '@/lib/boardingPath';

const HEADING_ID = 'boarding-fee-comparison';
const TIERS = ['value', 'mid', 'top'];

/*
  Below 980px a four-column row does not fit 375px at the 13px floor: the
  row labels are full sentences and the fee is an unbreakable "CHF 155 000".
  Each row label sits on its own line; the three cells sit under it. Display
  is restored to a real table at 980px. Roles stay on the elements so the
  row/column relationships survive the mobile display change.
*/
const TABLE = 'block w-full text-left text-[13px] min-[980px]:table min-[980px]:text-[15px]';
const GROUP = 'block min-[980px]:table-header-group';
const BODY = 'block min-[980px]:table-row-group';
const ROW = 'grid grid-cols-3 min-[980px]:table-row';
const CELL =
  'block px-2 py-2.5 text-center min-[980px]:table-cell min-[980px]:px-4';
const ROW_LABEL =
  'col-span-3 block px-2 py-2.5 text-left font-semibold min-[980px]:table-cell min-[980px]:px-4';

const ROWS = [
  { key: 'ib', checks: true },
  { key: 'counsellor', checks: true },
  { key: 'weekends', checks: true },
  { key: 'campus', values: ['campusValue', 'campusMid', 'campusTop'] },
  { key: 'clubs', values: ['clubsValue', 'clubsMid', 'clubsTop'] },
  { key: 'fee', fee: true },
];

function Check({ label }) {
  return (
    <>
      <svg viewBox="0 0 20 20" aria-hidden="true" className="inline h-4 w-4 text-jade">
        <path
          d="M4.5 10.5 8 14l7.5-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span className="sr-only">{label}</span>
    </>
  );
}

function cellText(row, tier, strings, fees) {
  if (row.checks) return <Check label={strings.yes} />;
  if (row.fee) {
    return <span className="tabular-nums">{formatChf(fees[tier])}</span>;
  }
  const index = TIERS.indexOf(tier);
  return strings.cells[row.values[index]];
}

export default function FeeComparison({ strings, fees }) {
  return (
    <div>
      <h3 id={HEADING_ID} className="mb-4 font-display text-xl">
        {strings.heading}
      </h3>
      <table role="table" aria-labelledby={HEADING_ID} className={TABLE}>
        <thead role="rowgroup" className={GROUP}>
          <tr role="row" className={ROW}>
            <td role="cell" className="hidden min-[980px]:table-cell" />
            {TIERS.map((tier) => (
              <th
                key={tier}
                role="columnheader"
                scope="col"
                className={`${CELL} font-semibold leading-snug ${tier === 'value' ? 'text-blue' : ''}`}
              >
                {strings.cols[tier]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody role="rowgroup" className={BODY}>
          {ROWS.map((row) => (
            <tr key={row.key} role="row" className={`${ROW} border-t border-night/10`}>
              <th role="rowheader" scope="row" className={ROW_LABEL}>
                {strings.rows[row.key]}
              </th>
              {TIERS.map((tier) => (
                <td
                  key={tier}
                  role="cell"
                  className={`${CELL} ${tier === 'value' ? 'bg-parchment' : ''}`}
                >
                  {cellText(row, tier, strings, fees)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-3 text-xs text-night/70">{strings.source}</p>
    </div>
  );
}
