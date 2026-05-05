import { useEffect } from 'react';

const DEFAULT_TITLE = 'Itinera — Planificateur de voyage intelligent avec IA';
const DEFAULT_DESC = 'Planifie ton prochain voyage en quelques secondes avec l\'IA : itinéraire complet, hôtels, vols, météo, budget, activités et carte interactive. Gratuit, sans inscription.';

function setMeta(name, content, attr = 'name') {
  let el = document.querySelector(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export default function useDocumentTitle(trip) {
  useEffect(() => {
    if (!trip?.destination?.city) {
      document.title = DEFAULT_TITLE;
      setMeta('description', DEFAULT_DESC);
      setMeta('og:title', DEFAULT_TITLE, 'property');
      setMeta('og:description', DEFAULT_DESC, 'property');
      return;
    }
    const city = trip.destination.city;
    const dates = trip.destination.dates || '';
    const title = `Voyage à ${city}${dates ? ' — ' + dates : ''} · Itinera`;
    const desc = `Itinéraire complet pour ${city} généré par l'IA : ${trip.activities?.length || 0} activités, budget ${trip.budget?.total || '?'}€, hôtel et vol inclus.`;
    document.title = title;
    setMeta('description', desc);
    setMeta('og:title', title, 'property');
    setMeta('og:description', desc, 'property');
    setMeta('twitter:title', title);
    setMeta('twitter:description', desc);
  }, [trip]);
}
