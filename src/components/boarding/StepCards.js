'use client';

import { useEffect, useRef } from 'react';
import { animate, inView, stagger } from 'motion';

export default function StepCards({ steps }) {
  const listRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    // Already on screen (e.g. reload mid-page): leave it alone rather than blink it out.
    if (list.getBoundingClientRect().top < window.innerHeight) return undefined;
    const items = list.querySelectorAll('li');
    animate(items, { opacity: 0, transform: 'translateY(16px)' }, { duration: 0 });
    return inView(list, () => {
      animate(
        items,
        { opacity: [0, 1], transform: ['translateY(16px)', 'none'] },
        { duration: 0.45, delay: stagger(0.15), ease: [0.455, 0.03, 0.515, 0.955] },
      );
    }, { amount: 0.35 });
  }, []);

  return (
    <ol ref={listRef} className="mt-7 grid gap-[18px] min-[980px]:grid-cols-3">
      {steps.map((step) => (
        <li key={step.n} className="rounded-3xl bg-blue px-[22px] pt-6 pb-[22px] text-white">
          <span className="mb-[18px] block font-display text-[2.4rem] leading-none">
            {step.n}
          </span>
          <h3 className="mb-2 font-display text-xl">{step.title}</h3>
          <p className="text-[15px] text-white">{step.body}</p>
        </li>
      ))}
    </ol>
  );
}
