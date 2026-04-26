'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

import InquiryForm from '@/components/InquiryForm';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import Pill from '@/components/ui/Pill';
import Icon from '@/components/ui/Icon';

/*
  Sticky inquiry rail for the listing detail page. The rest of the page
  is server-rendered for SEO/FCP; this isolates the only piece that needs
  client state — the inquiry modal toggle.
*/
export default function ContactRail({ listing }) {
  const t = useTranslations('propylaea.listing');
  const tListing = useTranslations('listing');
  const tInquiry = useTranslations('inquiry');
  const [open, setOpen] = useState(false);

  return (
    <>
      <aside>
        <div className="lg:sticky lg:top-24">
          <Card tone="white" className="p-6">
            <p className="font-display text-3xl text-blue">
              {listing.monthly_price != null ? (
                <>
                  €{listing.monthly_price}
                  <span className="text-base text-night/50">/mo</span>
                </>
              ) : (
                <span className="text-base text-night/50">
                  {tListing('priceOnRequest')}
                </span>
              )}
            </p>
            <div className="mt-2">
              <Pill variant="programme">{t('authMedicalProgramme')}</Pill>
            </div>
            <p className="mt-5 text-night/70 text-sm leading-relaxed">
              {t('directTagline')}
            </p>
            <div className="mt-5">
              <Button
                variant="gold"
                onClick={() => setOpen(true)}
                className="w-full justify-center"
              >
                {t('sendInquiry')}
              </Button>
            </div>
            <p className="mt-3 label-caps text-night/50 text-center">
              {t('replyWithin24h')}
            </p>
          </Card>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-night/60"
            onClick={() => setOpen(false)}
          />
          <Card
            tone="white"
            className="relative z-10 w-full max-w-lg p-6 md:p-8"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="font-display text-2xl text-night">
                {tInquiry('sendMessage')}
              </p>
              <button
                onClick={() => setOpen(false)}
                className="p-1 text-night/60 hover:text-night"
                aria-label={tInquiry('close')}
              >
                <Icon name="x" className="w-5 h-5" />
              </button>
            </div>
            <InquiryForm listingId={listing.listing_id} defaultOpen />
          </Card>
        </div>
      )}
    </>
  );
}
