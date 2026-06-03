/*
  Field — a small-caps label above the value/content below. Used on listing
  detail (RENT, DEPOSIT, etc).
*/
export default function Field({
  labelEnglish,
  children,
  className = '',
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {labelEnglish && (
        <span className="label-caps text-night/80">{labelEnglish}</span>
      )}
      <div className="mt-1 font-display text-2xl text-night leading-snug">
        {children}
      </div>
    </div>
  );
}
