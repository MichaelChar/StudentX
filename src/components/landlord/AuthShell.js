'use client';

/*
  Auth shell — centered form layout for login/signup/reset pages.
  The brand panel was stripped as part of the Stripe-modern rebrand;
  the floating Navbar pill carries the auth links.
*/
export default function AuthShell({ eyebrow, title, subtitle, children }) {
  return (
    <main className="min-h-screen bg-stone flex items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        {eyebrow && <p className="label-caps text-yellow mb-3">{eyebrow}</p>}
        {title && (
          <h1 className="font-display text-3xl md:text-4xl text-night leading-tight">
            {title}
          </h1>
        )}
        {subtitle && (
          <p className="mt-3 text-night/60 text-base leading-relaxed">
            {subtitle}
          </p>
        )}
        <div className="mt-8">{children}</div>
      </div>
    </main>
  );
}
