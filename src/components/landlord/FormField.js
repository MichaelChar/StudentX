'use client';

/*
  Propylaea form field — label + input, used across landlord auth pages.
*/
export default function FormField({
  label,
  id,
  type = 'text',
  value,
  onChange,
  required,
  placeholder,
  rightAction,
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label htmlFor={id} className="label-caps text-night/70">
          {label}
        </label>
        {rightAction}
      </div>
      <input
        id={id}
        type={type}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-night/15 bg-white rounded-sm px-3 py-2.5 text-sm text-night focus:outline-none focus:border-blue focus:ring-2 focus:ring-blue/10"
      />
    </div>
  );
}
