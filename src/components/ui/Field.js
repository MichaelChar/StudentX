/*
  Propylaea bilingual field — renders a Greek small-caps label above an English
  small-caps label, with the value/content below. Used on listing detail
  (Ενοίκιο / RENT, Εγγύηση / DEPOSIT, etc).
*/
export default function Field({
  labelGreek,
  labelEnglish,
  children,
  className = '',
}) {
  return (
    <div className={`flex flex-col gap-0.5 ${className}`}>
      {labelGreek && (
        <span className="font-display italic text-night/60 text-sm leading-tight">
          {labelGreek}
        </span>
      )}
      {labelEnglish && (
        <span className="label-caps text-night/80">{labelEnglish}</span>
      )}
      <div className="mt-1 font-display text-2xl text-night leading-snug">
        {children}
      </div>
    </div>
  );
}
