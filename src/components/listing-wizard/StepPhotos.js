'use client';

import Image from 'next/image';
import { useTranslations } from 'next-intl';
import { variantUrl } from '@/lib/photoVariants';
import { MIN_PHOTOS, PHOTO_LIMIT } from '@/lib/listingWizardRules';
import Icon from '@/components/ui/Icon';

const inputClass =
  'w-full border border-night/15 bg-white rounded-control px-3 py-2.5 text-sm text-night focus-visible:border-blue focus-visible:ring-2 focus-visible:ring-blue/10';
const labelClass = 'label-caps text-night/70 mb-1.5 block';

export default function StepPhotos({
  form,
  setField,
  fileInputRef,
  uploading,
  photoError,
  dragIndex,
  dragOverIndex,
  setDragIndex,
  setDragOverIndex,
  onFiles,
  onRemove,
  onReorder,
}) {
  const t = useTranslations('landlord.listingWizard.photos');
  const photos = form.photos || [];
  const external = form.external_photo_urls || [];
  const total = photos.length + external.length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-night/70">{t('lede', { min: MIN_PHOTOS, max: PHOTO_LIMIT })}</p>
        <p className="mt-1 text-xs text-night/50">
          {t('count', { current: total, min: MIN_PHOTOS, max: PHOTO_LIMIT })}
        </p>
      </div>

      {photos.length > 0 && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {photos.map((url, i) => {
              const isDragging = dragIndex === i;
              const isDragOver =
                dragOverIndex === i && dragIndex !== null && dragIndex !== i;
              return (
                <div
                  key={url}
                  draggable
                  onDragStart={(e) => {
                    setDragIndex(i);
                    e.dataTransfer.effectAllowed = 'move';
                    try {
                      e.dataTransfer.setData('text/plain', String(i));
                    } catch {
                      /* Firefox */
                    }
                  }}
                  onDragOver={(e) => {
                    if (dragIndex === null || dragIndex === i) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (dragOverIndex !== i) setDragOverIndex(i);
                  }}
                  onDragLeave={() => {
                    if (dragOverIndex === i) setDragOverIndex(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragIndex !== null && dragIndex !== i) {
                      onReorder(dragIndex, i);
                    }
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`relative group aspect-[4/3] rounded-photo overflow-hidden bg-parchment cursor-grab active:cursor-grabbing transition-opacity ${
                    i === 0 ? 'col-span-2' : ''
                  } ${isDragging ? 'opacity-40' : ''} ${
                    isDragOver ? 'ring-2 ring-yellow ring-offset-2' : ''
                  }`}
                >
                  <Image
                    src={variantUrl(url, i === 0 ? 'card' : 'thumb')}
                    alt={t('photoAlt', { n: i + 1 })}
                    fill
                    className="object-cover pointer-events-none"
                    sizes={
                      i === 0
                        ? '(max-width: 640px) 100vw, 66vw'
                        : '(max-width: 640px) 50vw, 33vw'
                    }
                  />
                  {i === 0 && (
                    <span className="absolute top-2 left-2 bg-yellow text-white text-xs font-semibold uppercase tracking-wider px-2 py-1 rounded-control">
                      {t('main')}
                    </span>
                  )}
                  <div className="absolute bottom-2 left-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => onReorder(i, i - 1)}
                      disabled={i === 0}
                      className="bg-white/95 hover:bg-white active:bg-white/80 transition-colors text-night rounded-control w-9 h-9 flex items-center justify-center disabled:opacity-40"
                      aria-label={t('moveLeft')}
                    >
                      <Icon name="chevronRight" className="w-4 h-4 rotate-180" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onReorder(i, i + 1)}
                      disabled={i === photos.length - 1}
                      className="bg-white/95 hover:bg-white active:bg-white/80 transition-colors text-night rounded-control w-9 h-9 flex items-center justify-center disabled:opacity-40"
                      aria-label={t('moveRight')}
                    >
                      <Icon name="chevronRight" className="w-4 h-4" />
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={() => onRemove(url)}
                    className="absolute top-2 right-2 bg-white/95 hover:bg-white active:bg-white/80 transition-colors text-night rounded-control w-9 h-9 flex items-center justify-center"
                    aria-label={t('remove')}
                  >
                    <Icon name="x" className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
          {photos.length > 1 && (
            <p className="text-xs text-night/50">{t('reorderHint')}</p>
          )}
        </>
      )}

      {external.length > 0 && (
        <div>
          <p className="text-xs font-medium text-night/60 mb-2">
            {t('imported', { count: external.length })}
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {external.map((url, i) => (
              <div
                key={url}
                className="relative aspect-[4/3] rounded-photo overflow-hidden bg-parchment"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={t('importedAlt', { n: i + 1 })}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {total < PHOTO_LIMIT && (
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="sr-only"
            id="wizard-photo-upload"
            onChange={(e) => onFiles(e.target.files)}
            disabled={uploading}
          />
          <label
            htmlFor="wizard-photo-upload"
            className={`inline-flex items-center gap-2 px-4 py-2.5 border border-dashed border-night/20 rounded-control text-sm text-night/60 hover:border-blue hover:text-night cursor-pointer transition-colors ${
              uploading ? 'opacity-50 pointer-events-none' : ''
            }`}
          >
            <Icon name="plus" className="w-4 h-4" />
            {uploading ? t('uploading') : t('addPhotos')}
          </label>
          <p className="mt-1.5 text-xs text-night/50">{t('hint')}</p>
        </div>
      )}

      {photoError && <p className="text-sm text-red-700">{photoError}</p>}

      <div>
        <label className={labelClass} htmlFor="wiz-video">
          {t('videoLabel')}
        </label>
        <input
          id="wiz-video"
          type="url"
          value={form.video_url}
          onChange={(e) => setField('video_url', e.target.value)}
          className={inputClass}
          placeholder={t('videoPlaceholder')}
        />
        <p className="mt-1 text-xs text-night/50">{t('videoTip')}</p>
      </div>
    </div>
  );
}
