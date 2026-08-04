/**
 * Host commission math for landlord-facing reservation amounts.
 *
 * Host commission = 5% of total stay value, plus 24% Greek VAT on the
 * commission. "You receive" on the deposit is deposit − commission (gross).
 * Platform holds the deposit and releases it 1 day after move-in (student
 * has that window to signal unhappiness).
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
 * Landlord net from the deposit after platform commission.
 *
 * @param {{ deposit: number, totalStayValue: number }} args
 * @returns {{
 *   deposit: number,
 *   total_stay_value: number,
 *   commission_rate: number,
 *   vat_rate: number,
 *   commission_net: number,
 *   commission_vat: number,
 *   commission_gross: number,
 *   you_receive: number,
 * }}
 */
export function landlordDepositReceive({ deposit, totalStayValue }) {
  const dep = money(deposit);
  const fees = hostCommission({ totalStayValue });
  return {
    deposit: dep,
    ...fees,
    you_receive: money(dep - fees.commission_gross),
  };
}
