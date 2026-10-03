'use client';

import { useState } from 'react';
import HeaderSearch from '@/components/property/HeaderSearch';
import DateRangePicker from '@/components/property/DateRangePicker';

/*
  The homepage's search bar — parity Feature 1's EXPANDED state, which the spec
  places on the homepage ("Homepage → bar renders expanded, full width"); the
  results pages show the collapsed pill. HeaderSearch owns the routing: Search
  goes to the chosen city's results with the picked dates in the query.
*/
export default function HomeSearch() {
  const [dates, setDates] = useState({ moveIn: '', moveOut: '', flexDays: 0 });
  return (
    <HeaderSearch
      wide
      city="thessaloniki"
      dates={dates}
      onDatesChange={setDates}
      renderDatePanel={({ value, onChange }) => (
        <DateRangePicker value={value} onChange={onChange} />
      )}
      className="w-full max-w-[40rem]"
    />
  );
}
