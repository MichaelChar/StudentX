'use client';

import { useId, useState } from 'react';
import { useTranslations } from 'next-intl';

import Button from '@/components/ui/Button';
import Chip from '@/components/ui/Chip';
import Divider from '@/components/ui/Divider';
import Icon from '@/components/ui/Icon';
import Popover from '@/components/ui/Popover';
import SegmentedControl from '@/components/ui/SegmentedControl';

/*
  CommuteFilterChip — faculty + max-walk-time filter control.

  Pure UI. Not mounted anywhere yet: the results chip row still has no
  commute control, and wiring this there is a separate PR so this file
  stays reviewable on its own. The parent owns `faculties` and `value`;
  this component does not fetch, does not write the URL, and does not
  touch sort_by.

  Built on Chip + Popover, so selected-fill (`night`, never `blue`),
  Escape, outside-click, and focus-leaving-closes come free. Do not
  reimplement those here.

  Walk time is disabled until a faculty is chosen because "within 15
  minutes" is meaningless without "of what". Greying the control is not
  enough — the reason is printed under it.

  Groups follow the order the array arrives in. Re-sorting by university
  name would shuffle AUTH/IHU/UoM whenever the API order changed, and
  the parent already has an order.

  Chip label truncation is CSS ellipsis, not a shortened faculty name.
  There is no short-name field on `/api/faculties`, and stripping
  "Faculty of " would be a guess.

  SegmentedControl keys on `opt.value`, so "Any" cannot be `null` (React
  treats `key={null}` as no key). `'any'` is an internal sentinel and
  is mapped back to `maxMinutes: null` before onChange.
*/

const WALK_MINUTES = [10, 15, 20, 30];
const ANY_MINUTES = 'any';

const FACULTY_ROW =
  'flex w-full items-center justify-between gap-3 rounded-control px-2 py-2 ' +
  'text-left text-sm font-sans text-night ' +
  'transition-colors hover:bg-parchment active:bg-parchment/70 ' +
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue';

function groupFaculties(faculties) {
  const groups = [];
  const indexByUniversity = new Map();
  for (const faculty of faculties) {
    const university = faculty.university;
    let group = indexByUniversity.get(university);
    if (!group) {
      group = { university, faculties: [] };
      indexByUniversity.set(university, group);
      groups.push(group);
    }
    group.faculties.push(faculty);
  }
  return groups;
}

function chipLabel(t, selectedFaculty, maxMinutes) {
  if (!selectedFaculty) return t('commuteChip');
  if (maxMinutes == null) return selectedFaculty.name;
  return t('commuteChipSummary', {
    faculty: selectedFaculty.name,
    minutes: maxMinutes,
  });
}

export default function CommuteFilterChip({
  faculties = [],
  value,
  onChange,
}) {
  const t = useTranslations('propylaea.results');
  const headingId = useId();
  const facultyLabelId = useId();
  const [open, setOpen] = useState(false);

  const facultyId = value?.facultyId ?? null;
  const maxMinutes = value?.maxMinutes ?? null;
  const hasFaculty = facultyId != null;
  const selectedFaculty = faculties.find((faculty) => faculty.id === facultyId);
  const label = chipLabel(t, selectedFaculty, maxMinutes);
  const loading = faculties.length === 0;
  const groups = loading ? [] : groupFaculties(faculties);

  const minuteOptions = [
    ...WALK_MINUTES.map((minutes) => ({
      value: minutes,
      label: t('commuteMinutesOption', { minutes }),
    })),
    { value: ANY_MINUTES, label: t('commuteAnyMinutes') },
  ];

  function emit(nextFacultyId, nextMaxMinutes) {
    onChange?.({ facultyId: nextFacultyId, maxMinutes: nextMaxMinutes });
  }

  function handleClear() {
    emit(null, null);
    setOpen(false);
  }

  return (
    <Popover
      trigger={
        <Chip
          selected={hasFaculty}
          className="max-w-56 overflow-hidden"
          title={selectedFaculty ? label : undefined}
        >
          <span className="min-w-0 truncate">{label}</span>
          <Icon
            name="chevronDown"
            className={`h-3.5 w-3.5 shrink-0 transition-transform ${
              open ? 'rotate-180' : ''
            }`}
          />
        </Chip>
      }
      open={open}
      onOpenChange={setOpen}
      role="dialog"
      placement="bottom-start"
      aria-labelledby={headingId}
      className="w-80 max-h-[min(28rem,70vh)] overflow-y-auto"
    >
      <p
        id={headingId}
        className="px-2 pt-1 pb-2 font-display text-sm font-semibold text-night"
      >
        {t('commuteHeading')}
      </p>

      <p id={facultyLabelId} className="px-2 pb-1 label-caps text-night/45">
        {t('commuteFacultyLabel')}
      </p>

      {loading ? (
        <p className="px-2 py-2 text-sm text-night/50">{t('commuteLoading')}</p>
      ) : (
        <div role="group" aria-labelledby={facultyLabelId}>
          {groups.map((group, i) => (
            <div key={group.university || `uni-${i}`}>
              {group.university ? (
                <p className="px-2 pt-1.5 pb-0.5 label-caps text-night/45">
                  {group.university}
                </p>
              ) : null}
              {group.faculties.map((faculty) => {
                const isSelected = faculty.id === facultyId;
                return (
                  <button
                    key={faculty.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => emit(faculty.id, maxMinutes)}
                    className={`${FACULTY_ROW} ${
                      isSelected ? 'bg-parchment font-medium' : ''
                    }`}
                  >
                    <span className="min-w-0 truncate">{faculty.name}</span>
                    {isSelected ? (
                      <Icon name="check" className="h-4 w-4 shrink-0" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <Divider decorative className="my-2" />

      <div className="px-2">
        <p className="pb-1.5 label-caps text-night/45">
          {t('commuteMaxWalkLabel')}
        </p>
        <SegmentedControl
          options={minuteOptions}
          value={maxMinutes == null ? ANY_MINUTES : maxMinutes}
          onChange={(next) =>
            emit(facultyId, next === ANY_MINUTES ? null : next)
          }
          size="sm"
          label={t('commuteMaxWalkLabel')}
          disabled={!hasFaculty}
          className="w-full [&>button]:flex-1"
        />
        {hasFaculty ? null : (
          <p className="mt-1.5 text-xs text-night/50">
            {t('commutePickFacultyFirst')}
          </p>
        )}
      </div>

      <Divider decorative className="my-2" />

      <div className="px-1">
        <Button variant="tertiary" size="sm" onClick={handleClear}>
          {t('commuteClear')}
        </Button>
      </div>
    </Popover>
  );
}
