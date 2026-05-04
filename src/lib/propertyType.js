const LABELS = {
  el: {
    'Studio': 'Γκαρσονιέρα',
    '1-Bedroom': 'Δυάρι',
    '2-Bedroom': '2 υπνοδ.',
    'Room in shared apartment': 'Συγκατοίκηση',
  },
  en: {
    'Studio': 'Studio',
    '1-Bedroom': '1-bed',
    '2-Bedroom': '2-bed',
    'Room in shared apartment': 'Private room',
  },
};

export function formatPropertyType(value, locale = 'el') {
  if (!value) return value;
  return LABELS[locale]?.[value] ?? value;
}
