'use client';

import { useRef, useState } from 'react';

/*
  EncryptButton — scramble-on-hover submit button, re-skinned to the brand
  palette (night surface, iris sweep). The label passed via `text` is the
  scramble target: on hover the characters cycle through CHARS and resolve
  back to `text`. Used on the auth-form submit buttons.

  Disabled state renders dimmed + non-interactive and never scrambles, so a
  loading-state variable can be threaded straight through as `disabled`.
*/
const CYCLES_PER_LETTER = 2;
const SHUFFLE_TIME = 50;
const CHARS = '!@#$%^&*():{};|,.<>/?';

// Inlined padlock (repo convention: no react-icons).
function LockIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

export default function EncryptButton({
  text = 'Submit',
  type = 'submit',
  disabled = false,
  className = '',
  ...rest
}) {
  const intervalRef = useRef(null);
  const [display, setDisplay] = useState(text);

  const stopScramble = () => {
    clearInterval(intervalRef.current || undefined);
    setDisplay(text);
  };

  const scramble = () => {
    if (disabled) return;
    let pos = 0;
    intervalRef.current = setInterval(() => {
      const scrambled = text
        .split('')
        .map((char, index) => {
          if (pos / CYCLES_PER_LETTER > index) return char;
          return CHARS[Math.floor(Math.random() * CHARS.length)];
        })
        .join('');
      setDisplay(scrambled);
      pos++;
      if (pos >= text.length * CYCLES_PER_LETTER) stopScramble();
    }, SHUFFLE_TIME);
  };

  return (
    // Motion replaced with CSS (#260) to keep `motion/react` off the auth-page
    // bundle: the scale press is Tailwind transform utilities, the gradient
    // sweep is the `.encrypt-sweep` keyframe in globals.css (reduced-motion
    // aware). The scramble effect is plain setInterval — untouched.
    <button
      type={type}
      disabled={disabled}
      onMouseEnter={scramble}
      onMouseLeave={stopScramble}
      className={`group relative overflow-hidden rounded-lg border-[1px] border-night bg-night px-4 py-2 font-mono font-medium uppercase text-stone/80 transition-[color,transform] hover:text-white enabled:hover:scale-[1.025] enabled:active:scale-[0.975] disabled:cursor-not-allowed disabled:opacity-60 ${className}`}
      {...rest}
    >
      <div className="relative z-10 flex items-center justify-center gap-2">
        <LockIcon />
        <span>{display}</span>
      </div>
      <span
        aria-hidden="true"
        className="encrypt-sweep absolute inset-0 z-0 scale-125 bg-gradient-to-t from-blue/0 from-40% via-blue/100 to-blue/0 to-60% opacity-0 transition-opacity group-hover:opacity-100"
      />
    </button>
  );
}
