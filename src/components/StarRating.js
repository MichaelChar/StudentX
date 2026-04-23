'use client';

/**
 * StarRating — renders 5 stars.
 * - interactive=true: clicking sets the rating (calls onChange)
 * - interactive=false (default): read-only display of `value`
 */
export default function StarRating({ value = 0, onChange, interactive = false, size = 'md' }) {
  const sizeCls = size === 'sm' ? 'w-4 h-4' : size === 'lg' ? 'w-7 h-7' : 'w-5 h-5';

  return (
    <div className="flex items-center gap-0.5" role={interactive ? 'radiogroup' : undefined} aria-label={`Rating: ${value} out of 5`}>
      {[1, 2, 3, 4, 5].map((star) => {
        const filled = star <= value;
        if (interactive) {
          return (
            <button
              key={star}
              type="button"
              onClick={() => onChange?.(star)}
              aria-label={`${star} star${star !== 1 ? 's' : ''}`}
              className={`cursor-pointer transition-colors ${filled ? 'text-gold' : 'text-gray-300 hover:text-gold/60'}`}
            >
              <StarIcon className={sizeCls} filled={filled} />
            </button>
          );
        }
        return (
          <span key={star} className={filled ? 'text-gold' : 'text-gray-300'}>
            <StarIcon className={sizeCls} filled={filled} />
          </span>
        );
      })}
    </div>
  );
}

function StarIcon({ className, filled }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 1.5} aria-hidden="true">
      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
  );
}
