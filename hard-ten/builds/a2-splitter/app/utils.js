export function money(value, currency) {
  let amount = BigInt(value); const sign = amount < 0n ? '−' : ''; if (amount < 0n) amount = -amount;
  const whole = (amount / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}${currency} ${whole}.${String(amount % 100n).padStart(2, '0')}`;
}
export function date(value) { return new Intl.DateTimeFormat('en', { month:'short', day:'numeric', year:'numeric' }).format(new Date(value)); }
