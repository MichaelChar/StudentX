'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';

import ListingGallery from '@/components/listing/ListingGallery';
import Pill from '@/components/ui/Pill';
import Card from '@/components/ui/Card';
import Icon from '@/components/ui/Icon';
import { formatPropertyType } from '@/lib/propertyType';

/*
  Preview-as-student overlay for the landlord listing form.

  Renders the listing exactly as a student sees it on the public detail
  page (src/app/[locale]/property/[city]/listing/[id]/page.js), built
  ENTIRELY from the current UNSAVED form state — no save, no network
  write. The landlord clicks "Preview as student" in ListingForm and
  this opens a full-screen modal mirroring the detail page's section
  order: gallery → hero stripe → rent/deposit/type grid → description →
  amenities, plus a static inquiry rail.

  Reuse vs replicate:
  - ListingGallery (client component) is reused verbatim, so the photo
    strip + lightbox match production exactly.
  - The UI primitives (Card, Pill, Icon) and
    formatPropertyType are reused.
  - The detail page itself is a SERVER component and its inquiry rail
    (ContactRail/ContactGate) fires live inquiry network calls and needs
    request-scoped auth, so the page structure and a *static* inquiry
    rail are replicated here rather than imported.

  Accessibility mirrors the app's modal convention (ConfirmDialog /
  ListingLightbox): Esc closes, backdrop click closes, body scroll is
  locked, focus moves to the close button on open and is restored on
  unmount, and Tab is trapped within the dialog.
*/

export default function ListingPreview({ form, amenities = [], onClose }) {
  const t = useTranslations('landlord.listingForm');
  const dialogRef = useRef(null);
  const closeBtnRef = useRef(null);

  // Lock body scroll, wire Esc + focus trap, restore focus on unmount.
  // Mirrors the ConfirmDialog / ListingLightbox pattern.
  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeBtnRef.current?.focus();

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key !== 'Tab') return;
      const node = dialogRef.current;
      if (!node) return;
      const focusable = node.querySelectorAll(
        'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [onClose]);

  // Map the form state into the flattened shape the detail layout reads.
  // (See src/lib/transformListing.js for the canonical field set.)
  const title = (form.title || '').trim();
  const address = (form.address || '').trim();
  const neighborhood = (form.neighborhood || '').trim();
  const description = (form.description || '').trim();

  const monthlyPrice =
    form.monthly_price !== '' && form.monthly_price != null
      ? Number(form.monthly_price)
      : null;
  const deposit =
    form.deposit !== '' && form.deposit != null ? Number(form.deposit) : null;
  const hasPrice = monthlyPrice != null && !Number.isNaN(monthlyPrice);
  const hasDeposit = deposit != null && !Number.isNaN(deposit) && deposit > 0;

  const propertyTypeLabel = form.property_type
    ? formatPropertyType(form.property_type, 'en')
    : null;

  // Resolve selected amenity ids → names using the form's loaded amenity
  // list (the same list ListingForm renders the checkboxes from).
  const amenityNames = (form.amenity_ids || [])
    .map((id) => amenities.find((a) => a.amenity_id === id)?.name)
    .filter(Boolean);

  // Gallery wants http-prefixed URLs (mirrors the detail page's filter).
  // Own uploads (card variant public URLs) + imported external photos.
  const photos = [...(form.photos || []), ...(form.external_photo_urls || [])].filter(
    (url) => typeof url === 'string' && url.startsWith('http'),
  );

  const headline = title || address || t('previewUntitled');

  return (
    <div className="fixed inset-0 z-[60] overflow-y-auto bg-stone">
      {/* Top bar — preview banner + close. Sticky so the close action
          stays reachable while the landlord scrolls the long preview. */}
      <div className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-night/10 bg-blue px-5 py-3 text-white">
        <div className="flex items-center gap-2.5 min-w-0">
          <Icon name="search" className="w-4 h-4 shrink-0" />
          <p className="label-caps text-white/90 truncate">{t('previewBanner')}</p>
        </div>
        <button
          ref={closeBtnRef}
          type="button"
          onClick={onClose}
          aria-label={t('previewClose')}
          className="inline-flex items-center gap-1.5 shrink-0 rounded-sm bg-white/15 px-3 py-1.5 text-xs font-sans font-semibold uppercase tracking-[0.08em] hover:bg-white/25 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Icon name="x" className="w-4 h-4" />
          {t('previewClose')}
        </button>
      </div>

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={t('previewBanner')}
        className="mx-auto max-w-6xl px-5 pt-8 pb-16 md:py-12"
      >
        {/* Photo gallery — reuses the production gallery + lightbox */}
        <section className="mb-10">
          {photos.length > 0 ? (
            <ListingGallery photos={photos} title={headline} />
          ) : (
            <div className="aspect-[16/9] rounded-sm bg-parchment flex items-center justify-center">
              <Icon name="photo" className="w-16 h-16 text-night/20" />
            </div>
          )}
        </section>

        {/* Main content — left column + static inquiry rail */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-10">
          <div>
            {/* Hero stripe — neighborhood, title, address */}
            <div className="flex flex-col md:flex-row md:items-start gap-5 mb-8">
              <div className="flex-1">
                <p className="label-caps text-night/50">
                  {neighborhood ? `${neighborhood} · Thessaloniki` : 'Thessaloniki'}
                </p>
                <h1 className="mt-1 font-display text-4xl md:text-5xl text-night leading-tight text-balance">
                  {headline}
                </h1>
                {address && (
                  <p className="mt-2 label-caps text-night/60">{address}</p>
                )}
              </div>
            </div>

            {/* Rent / deposit / type grid */}
            <Card tone="parchment" border={false} className="p-6 md:p-8 mb-10">
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                <PreviewField
                  label={t('monthlyRentLabel')}
                  value={
                    hasPrice ? (
                      <>
                        €{monthlyPrice}
                        <span className="text-base text-night/50">/mo</span>
                      </>
                    ) : (
                      <span className="text-base text-night/50">—</span>
                    )
                  }
                />
                <PreviewField
                  label={t('depositLabel')}
                  value={hasDeposit ? `€${deposit}` : '—'}
                />
                <PreviewField
                  label={t('propertyTypeLabel')}
                  value={propertyTypeLabel || '—'}
                />
              </dl>
            </Card>

            {/* Description */}
            {description && (
              <section className="mb-10">
                <p className="label-caps text-night/80 mb-4">
                  {t('descriptionLabel')}
                </p>
                <p className="text-night/80 leading-relaxed text-lg font-sans whitespace-pre-line">
                  {description}
                </p>
              </section>
            )}

            {/* Amenities */}
            {amenityNames.length > 0 && (
              <section className="mb-10">
                <p className="label-caps text-night/80 mb-4">
                  {t('amenitiesSection')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {amenityNames.map((name) => (
                    <Pill key={name} variant="amenity">
                      {name}
                    </Pill>
                  ))}
                </div>
              </section>
            )}

          </div>

          {/* Static inquiry rail — replicates ContactRail's card visually.
              Render-only: the Inquire button is inert in preview. */}
          <aside>
            <div className="lg:sticky lg:top-20">
              <Card tone="white" className="p-6">
                <p className="font-display text-3xl text-blue">
                  {hasPrice ? (
                    <>
                      €{monthlyPrice}
                      <span className="text-base text-night/50">/mo</span>
                    </>
                  ) : (
                    <span className="text-base text-night/50">—</span>
                  )}
                </p>
                <p className="mt-5 text-night/70 text-sm leading-relaxed">
                  {t('previewDirectTagline')}
                </p>
                <div className="mt-5">
                  <button
                    type="button"
                    disabled
                    aria-disabled="true"
                    className="w-full justify-center inline-flex items-center bg-yellow text-white font-display font-semibold px-6 py-3 rounded-lg opacity-60 cursor-not-allowed"
                  >
                    {t('previewInquire')}
                  </button>
                </div>
                <p className="mt-3 label-caps text-night/50 text-center">
                  {t('previewInquireNote')}
                </p>
              </Card>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

function PreviewField({ label, value }) {
  return (
    <div>
      <dt>
        <span className="label-caps text-night/80 block">{label}</span>
      </dt>
      <dd className="mt-2 font-display text-2xl text-night leading-tight">
        {value}
      </dd>
    </div>
  );
}
