const LABELS = {
  en: {
    'Studio': 'Studio',
    '1-Bedroom': '1-bed',
    '2-Bedroom': '2-bed',
    'Room in shared apartment': 'Private room',
  },
};

export function formatPropertyType(value, locale = 'en') {
  if (!value) return value;
  return LABELS[locale]?.[value] ?? value;
}
