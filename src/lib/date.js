export function fmtDate(iso, lang = 'fr') {
  if (!iso) return '';
  const locale = lang === 'en' ? 'en-US' : 'fr-FR';
  return new Date(iso + 'T00:00:00').toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' });
}

export function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  return Math.max(1, Math.ceil((new Date(d2 + 'T00:00:00') - new Date(d1 + 'T00:00:00')) / 86400000));
}
