/**
 * Host commission math for landlord-facing reservation amounts.
 *
 * Host commission = 5% of total stay value, plus 24% Greek VAT on the
 * commission.
 *
 * What the platform holds: **the student's first month's rent**, released to
 * the landlord minus commission **1 business day after move-in** (the student
 * has that window to signal a problem).
 *
 * What the platform does NOT touch: the security deposit and months 2+ of
 * rent. Both are settled directly between landlord and tenant. Commission is
 * never taken from a deposit — a deposit is the tenant's money held against
 * damage and returnable in full, so skimming it would leave the landlord
 * short of their return obligation at end of tenancy.
 *
 * Why durations are capped at 12 months (schema CHECK, migration 100):
 * commission as a share of the first month is `months × 0.05 × 1.24`, i.e.
 * 6.2%/month — 74.4% at 12 months. Break-even is ~16.1 months, past which
 * the payout would go negative. The cap keeps the model solvent.
 */

export const HOST_COMMISSION_RATE = 0.05;
export const COMMISSION_VAT_RATE = 0.24;

function money(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/**
 * @param {{ totalStayValue: number }} args
 * @returns {{
 *   total_stay_value: number,
 *   commission_rate: number,
 *   vat_rate: number,
 *   commission_net: number,
 *   commission_vat: number,
 *   commission_gross: number,
 * }}
 */
export function hostCommission({ totalStayValue }) {
  const total = money(totalStayValue);
  const commissionNet = money(total * HOST_COMMISSION_RATE);
  const commissionVat = money(commissionNet * COMMISSION_VAT_RATE);
  const commissionGross = money(commissionNet + commissionVat);
  return {
    total_stay_value: total,
    commission_rate: HOST_COMMISSION_RATE,
    vat_rate: COMMISSION_VAT_RATE,
    commission_net: commissionNet,
    commission_vat: commissionVat,
    commission_gross: commissionGross,
  };
}

/**
 * Landlord net from the held first month's rent, after platform commission.
 *
 * Released 1 business day after move-in.
 *
 * @param {{ firstMonthRent: number, totalStayValue: number }} args
 * @returns {{
 *   first_month_rent: number,
 *   total_stay_value: number,
 *   commission_rate: number,
 *   vat_rate: number,
 *   commission_net: number,
 *   commission_vat: number,
 *   commission_gross: number,
 *   you_receive: number,
 * }}
 */
export function landlordFirstMonthReceive({ firstMonthRent, totalStayValue }) {
  const rent = money(firstMonthRent);
  const fees = hostCommission({ totalStayValue });
  return {
    first_month_rent: rent,
    ...fees,
    you_receive: money(rent - fees.commission_gross),
  };
}
