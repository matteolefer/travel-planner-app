import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { useTranslation } from 'react-i18next';
import {
  Sun, Cloud, CloudRain, CloudSnow, Plane, Building2, MapPin,
  Wallet, CheckSquare2, FileText, Moon, RotateCcw, Sparkles,
  Loader2, X, Star, Clock, Key, ChevronRight,
  Bookmark, Trash2, Menu, Settings, Plus, Columns,
  LayoutGrid, LayoutList, Globe,
} from 'lucide-react';
import { generateTrip, chat as chatAi, getSuggestions, surpriseMeCity, regenerateActivity, classifyAiError } from './api/ai.js';
import { fetchRealWeather } from './api/weather.js';
import { getAmadeusToken, fetchRealFlight } from './api/flights.js';
import { fetchExchangeRates } from './api/exchange.js';
import { fmtDate, daysBetween } from './lib/date.js';
import { decodeShareLink } from './lib/share.js';
import { CITY_AIRPORT_MAP, getCityAirportCode } from './lib/airports.js';
import { loadSavedTrips, ssGet, ssSet } from './lib/storage.js';
import useDocumentTitle from './hooks/useDocumentTitle.js';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const CURRENCIES       = ['EUR', 'USD', 'GBP', 'JPY', 'THB', 'MAD', 'AED', 'CHF', 'CAD'];
const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£', JPY: '¥', THB: '฿', MAD: 'DH', AED: 'AED', CHF: 'Fr', CAD: 'C$' };

const SYSTEM_PROMPTS = {
  fr: `Tu es un expert en voyage. Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de backticks) avec cette structure exacte :
{
  "destination": { "city": "", "country": "", "dates": "Ex: 15-22 Mars 2026", "highlights": ["À ne pas manquer 1", "À ne pas manquer 2", "À ne pas manquer 3"] },
  "weather": { "temp": "22°C", "condition": "Ensoleillé", "forecast": [{"day": "Lun", "temp": 18}, {"day": "Mar", "temp": 20}, {"day": "Mer", "temp": 22}, {"day": "Jeu", "temp": 21}, {"day": "Ven", "temp": 19}] },
  "flight": { "airline": "", "departure": "10:30", "arrival": "14:45", "flightNumber": "", "date": "2026-03-15", "from": "CDG", "fromCity": "Paris", "to": "", "toCity": "" },
  "hotel": { "name": "", "stars": 4, "address": "", "checkIn": "", "checkOut": "", "pricePerNight": 120, "lat": 0.0, "lng": 0.0 },
  "activities": [{ "day": 1, "emoji": "", "name": "", "time": "", "tag": "culture", "description": "", "duration": "2h", "price": "15€", "address": "", "travelTimeFromPrev": "~15 min à pied", "lat": 48.8566, "lng": 2.3522 }],
  "budget": { "total": 1500, "perDay": [{ "day": 1, "housing": 0, "food": 0, "transport": 0, "activities": 0 }], "summary": { "housing": 0, "food": 0, "transport": 0, "activities": 0, "other": 0 } },
  "packingList": { "essentials": ["Passeport", "Carte bancaire", "Assurance voyage"], "clothes": ["T-shirts légers", "Short", "Maillot de bain"], "gear": ["Crème solaire SPF50", "Adaptateur prise", "Gourde"], "health": ["Médicaments perso", "Anti-moustiques"] },
  "practicalInfo": { "visa": "", "vaccines": "", "plug": "", "currency": "", "timezone": "", "safety": "", "safetyLevel": 3, "warnings": "" },
  "notes": "",
  "transport": { "mode": "avion", "duration": "3h30", "price": "250€", "from": "Paris", "to": "Tokyo" }
}
Les tags doivent être exactement "culture", "food", "nature" ou "divertissement". Adapte la météo à la saison des dates fournies. Considère les préférences utilisateur (nombre de voyageurs, style, rythme, budget) pour adapter le contenu. Les catégories de packingList doivent être adaptées à la destination ET la saison (hiver = manteau, tropique = anti-moustiques, etc). Pour le budget, fournis une répartition détaillée par jour (housing, food, transport, activities) dans perDay et un résumé par catégorie dans summary. Pour l'étape 1 (voyage direct), transport doit être null. Pour les étapes suivantes, renseigne le transport depuis la ville précédente. IMPORTANT: Pour chaque activité et hôtel, les coordonnées lat/lng doivent être précises et non nulles (ex: Paris = 48.8566, 2.3522). Ne jamais renvoyer lat: 0 ou lng: 0.`,
  en: `You are a travel expert. Reply ONLY with valid JSON (no markdown, no backticks) using this exact structure:
{
  "destination": { "city": "", "country": "", "dates": "Ex: Mar 15-22, 2026", "highlights": ["Must see 1", "Must see 2", "Must see 3"] },
  "weather": { "temp": "22°C", "condition": "Sunny", "forecast": [{"day": "Mon", "temp": 18}, {"day": "Tue", "temp": 20}, {"day": "Wed", "temp": 22}, {"day": "Thu", "temp": 21}, {"day": "Fri", "temp": 19}] },
  "flight": { "airline": "", "departure": "10:30", "arrival": "14:45", "flightNumber": "", "date": "2026-03-15", "from": "CDG", "fromCity": "Paris", "to": "", "toCity": "" },
  "hotel": { "name": "", "stars": 4, "address": "", "checkIn": "", "checkOut": "", "pricePerNight": 120, "lat": 0.0, "lng": 0.0 },
  "activities": [{ "day": 1, "emoji": "", "name": "", "time": "", "tag": "culture", "description": "", "duration": "2h", "price": "15€", "address": "", "travelTimeFromPrev": "~15 min walk", "lat": 48.8566, "lng": 2.3522 }],
  "budget": { "total": 1500, "perDay": [{ "day": 1, "housing": 0, "food": 0, "transport": 0, "activities": 0 }], "summary": { "housing": 0, "food": 0, "transport": 0, "activities": 0, "other": 0 } },
  "packingList": { "essentials": ["Passport", "Credit card", "Travel insurance"], "clothes": ["Light T-shirts", "Shorts", "Swimsuit"], "gear": ["Sunscreen SPF50", "Plug adapter", "Water bottle"], "health": ["Personal meds", "Mosquito repellent"] },
  "practicalInfo": { "visa": "", "vaccines": "", "plug": "", "currency": "", "timezone": "", "safety": "", "safetyLevel": 3, "warnings": "" },
  "notes": "",
  "transport": { "mode": "plane", "duration": "3h30", "price": "250€", "from": "Paris", "to": "Tokyo" }
}
Tags must be exactly "culture", "food", "nature" or "divertissement". Adapt weather to the season of the given dates. Consider user preferences (number of travelers, style, pace, budget) to adapt content. PackingList categories must be adapted to both destination AND season (winter = coat, tropics = mosquito repellent, etc). For budget, provide a detailed daily breakdown (housing, food, transport, activities) in perDay and a category summary in summary. For step 1 (direct trip), transport must be null. For subsequent steps, fill in transport from the previous city. IMPORTANT: For each activity and hotel, lat/lng coordinates must be precise and non-null (e.g. Paris = 48.8566, 2.3522). Never return lat: 0 or lng: 0.`,
};

function getSystemPrompt(lang = 'fr') { return SYSTEM_PROMPTS[lang] || SYSTEM_PROMPTS.fr; }

const BUDGET_COLORS = { housing: '#8B5CF6', food: '#EC4899', transport: '#10B981', activities: '#F59E0B', other: '#6B7280' };
const TAG_STYLES    = {
  culture:       { bg: 'rgba(59,130,246,0.12)',  color: '#3B82F6' },
  food:          { bg: 'rgba(245,158,11,0.12)',  color: '#D97706' },
  nature:        { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  divertissement: { bg: 'rgba(168,85,247,0.12)',  color: '#A855F7' },
};

// ─── UTILS (message builder only — date/airport/storage/share moved to src/lib) ─

function buildUserMessage(dest, dateDepart, dateRetour, depCity = 'Paris (CDG)', prefs = {}, stepContext = null, lang = 'fr') {
  const { travelers = 'Solo', style = 'Confort', pace = 'Chargé', maxBudget = 5000 } = prefs;
  if (lang === 'en') {
    let msg = `Plan a trip to ${dest} departing from ${depCity}`;
    if (dateDepart && dateRetour) {
      const days = daysBetween(dateDepart, dateRetour);
      msg += ` from ${fmtDate(dateDepart, 'en')} to ${fmtDate(dateRetour, 'en')}. Generate ${days * 2} to ${days * 3} activities spread over ${days} days (field "day" from 1 to ${days}), and check-in/check-out dates must match the trip dates.`;
    } else {
      msg += `. Generate 5-6 varied activities with the "day" field set to 1.`;
    }
    msg += ` Preferences: ${travelers} traveler(s), style ${style}, pace ${pace}, max budget ${maxBudget}€.`;
    if (stepContext) msg = `Step ${stepContext.stepN}/${stepContext.total} of the trip. Coming from ${stepContext.prevCity}. ` + msg;
    return msg;
  }
  let msg = `Planifie un voyage à ${dest} au départ de ${depCity}`;
  if (dateDepart && dateRetour) {
    const days = daysBetween(dateDepart, dateRetour);
    msg += ` du ${fmtDate(dateDepart, 'fr')} au ${fmtDate(dateRetour, 'fr')}. Génère ${days * 2} à ${days * 3} activités réparties sur ${days} jours (champ "day" de 1 à ${days}), et les dates de check-in/check-out correspondent aux dates du voyage.`;
  } else {
    msg += `. Génère 5-6 activités variées avec le champ "day" à 1.`;
  }
  msg += ` Préférences: ${travelers} voyageur(s), style ${style}, rythme ${pace}, budget max ${maxBudget}€.`;
  if (stepContext) msg = `Étape ${stepContext.stepN}/${stepContext.total} du voyage. L'utilisateur vient de ${stepContext.prevCity}. ` + msg;
  return msg;
}

// fetchSuggestions est désormais fourni par src/api/ai.js (getSuggestions) —
// supporte le proxy serveur et la clé user en mode hybride.

// ─── SMALL HELPERS ────────────────────────────────────────────────────────────

function WeatherIcon({ condition, size = 28 }) {
  const lc = (condition || '').toLowerCase();
  if (lc.includes('neige') || lc.includes('snow'))                           return <CloudSnow size={size} color="#93C5FD" />;
  if (lc.includes('pluie') || lc.includes('rain') || lc.includes('orage'))   return <CloudRain size={size} color="#60A5FA" />;
  if (lc.includes('nuage') || lc.includes('cloud') || lc.includes('couvert')) return <Cloud    size={size} color="#9CA3AF" />;
  return <Sun size={size} color="#FBBF24" />;
}

function Skeleton({ w = '100%', h = '18px', r = '8px', style = {} }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />;
}

function Stars({ n = 0 }) {
  return (
    <div style={{ display: 'flex', gap: 2 }}>
      {Array.from({ length: n }).map((_, i) => <Star key={i} size={11} fill="#FBBF24" color="#FBBF24" />)}
    </div>
  );
}

function LiveBadge() {
  return (
    <div className="live-badge">
      <span className="live-dot" />
      Live
    </div>
  );
}

function RealBadge() {
  const { t } = useTranslation();
  return <div className="real-badge">{t('cards.realFlight')} ✓</div>;
}

// ─── DONUT CHART ──────────────────────────────────────────────────────────────

function DonutChart({ summary }) {
  const [go, setGo] = useState(false);
  useEffect(() => { const id = requestAnimationFrame(() => setGo(true)); return () => cancelAnimationFrame(id); }, []);
  const entries    = Object.entries(summary || {}).filter(([, v]) => v > 0);
  const totalSpent = entries.reduce((s, [, v]) => s + v, 0);
  const r = 32, circ = 2 * Math.PI * r;
  const cx = 44, cy = 44;
  let cumLen = 0;

  return (
    <svg width="88" height="88" viewBox="0 0 88 88">
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--border)" strokeWidth="11" />
      {totalSpent > 0 && entries.map(([key, val]) => {
        const seg    = (val / totalSpent) * circ;
        const offset = circ / 4 - cumLen;
        cumLen += seg;
        return (
          <circle key={key} cx={cx} cy={cy} r={r} fill="none"
            stroke={BUDGET_COLORS[key] || '#ccc'} strokeWidth="11"
            strokeDasharray={go ? `${seg} ${circ - seg}` : `0 ${circ}`} strokeDashoffset={offset}
            style={{ transition: 'stroke-dasharray 0.8s ease-out' }} />
        );
      })}
    </svg>
  );
}

// ─── TOAST ────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className="toast">
      <span>{message}</span>
      <button className="toast-close" onClick={onClose}><X size={14} /></button>
    </div>
  );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────────

function ProgressBar({ data, checked }) {
  const { t } = useTranslation();
  const cardKeys    = ['destination', 'weather', 'flight', 'hotel', 'activities', 'budget'];
  const filledCards = data ? cardKeys.filter(k => {
    if (k === 'destination') return !!data.destination?.city;
    if (k === 'activities')  return data.activities?.length > 0;
    return !!data[k];
  }).length : 0;

  const cardPct  = (filledCards / cardKeys.length) * 50;
  const packingItems = data ? [
    ...(data.packingList?.essentials || []),
    ...(data.packingList?.clothes || []),
    ...(data.packingList?.gear || []),
    ...(data.packingList?.health || []),
  ] : [];
  const total    = packingItems.length;
  const done     = Object.values(checked).filter(Boolean).length;
  const checkPct = total > 0 ? (done / total) * 50 : 0;
  const pct      = Math.round(cardPct + checkPct);

  return (
    <div className="progress-section">
      <div className="progress-header">
        <span className="progress-label">{t('progress.ready', { pct })}</span>
        <span className="progress-steps">{t('progress.steps', { done, total })}</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────

function Sidebar({ open, trips, onLoad, onDelete, onClose }) {
  const { t } = useTranslation();
  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">{t('sidebar.title')}</span>
          <button className="sidebar-close icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        {trips.length === 0 ? (
          <div className="sidebar-empty">
            <Bookmark size={28} color="var(--text-sec)" style={{ opacity: 0.4 }} />
            <p>{t('sidebar.empty')}</p>
          </div>
        ) : (
          <ul className="sidebar-list">
            {trips.map(trip => (
              <li key={trip.id} className="sidebar-item" onClick={() => { onLoad(trip); onClose(); }}>
                <div className="sidebar-item-info">
                  <span className="sidebar-city">{trip.city}</span>
                  <span className="sidebar-dates">{trip.dates}</span>
                </div>
                <button className="sidebar-delete" title={t('sidebar.delete')}
                  onClick={e => { e.stopPropagation(); onDelete(trip.id); }}>
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </>
  );
}

// ─── SHARE CARD (Visual export) ────────────────────────────────────────────────

function ShareCard({ data, dest, photoUrl }) {
  if (!data) return null;
  const city = data.destination?.city || dest;
  const topActivities = data.activities?.slice(0, 3) || [];
  const budget = data.budget?.total || '?';
  const { t } = useTranslation();
  const dates = data.destination?.dates || t('cards.tbd');
  const [wikiPhoto, setWikiPhoto] = React.useState(photoUrl || null);

  React.useEffect(() => {
    if (wikiPhoto || !city) return;
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`)
      .then(r => r.json())
      .then(d => {
        const url = d.originalimage?.source || d.thumbnail?.source;
        if (url) setWikiPhoto(url);
        else setWikiPhoto(`https://picsum.photos/seed/${city.length * 7}/800/600`);
      })
      .catch(() => setWikiPhoto(`https://picsum.photos/seed/${city.length * 7}/800/600`));
  }, [city, wikiPhoto]);

  return (
    <div
      style={{
        width: 400,
        height: 600,
        background: '#FFFEF2',
        borderRadius: '20px',
        overflow: 'hidden',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}
    >
      {/* Top section - Photo */}
      <div
        style={{
          flex: '0 0 55%',
          backgroundImage: wikiPhoto ? `linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.4) 100%), url(${wikiPhoto})` : 'linear-gradient(135deg, #FFD60A 0%, #FF5C39 100%)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          display: 'flex',
          alignItems: 'flex-end',
          padding: '24px',
          color: '#fff',
        }}
      >
        <div>
          <h1 style={{ fontSize: '32px', fontWeight: '700', margin: '0 0 8px', fontFamily: "'Syne', sans-serif", color: '#fff' }}>
            {city}
          </h1>
          <p style={{ fontSize: '12px', margin: '0', opacity: 0.9 }}>
            {dates}
          </p>
        </div>
      </div>

      {/* Middle section - Activities */}
      <div style={{ flex: '1', padding: '20px', overflowY: 'auto' }}>
        {topActivities.length > 0 && (
          <div>
            <p style={{ fontSize: '11px', fontWeight: '600', textTransform: 'uppercase', color: '#64748B', margin: '0 0 12px' }}>
              {t('share.activities')}
            </p>
            {topActivities.map((act, i) => (
              <div key={i} style={{ marginBottom: '12px', paddingBottom: '12px', borderBottom: i < topActivities.length - 1 ? '1px solid rgba(10,22,40,0.1)' : 'none' }}>
                <div style={{ fontSize: '12px', fontWeight: '600', color: '#0A1628', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span>{act.emoji}</span>
                  <span>{act.name}</span>
                </div>
                <div style={{ fontSize: '10px', color: '#64748B', marginTop: '2px' }}>
                  {act.time} · {act.tag}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom section - Budget + Logo */}
      <div
        style={{
          flex: '0 0 auto',
          padding: '16px 20px',
          borderTop: '1px solid rgba(10,22,40,0.1)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          background: '#FFF',
        }}
      >
        <div>
          <p style={{ fontSize: '10px', fontWeight: '600', color: '#64748B', margin: '0 0 4px', textTransform: 'uppercase' }}>
            {t('share.totalBudget')}
          </p>
          <p style={{ fontSize: '20px', fontWeight: '700', color: '#FF5C39', margin: '0' }}>
            {budget}€
          </p>
        </div>
        <div style={{ fontSize: '24px', fontWeight: '700', color: '#FF5C39', fontFamily: "'Syne', sans-serif" }}>
          ✈️
        </div>
      </div>
    </div>
  );
}

// ─── DESTINATION CARD ─────────────────────────────────────────────────────────

function DestinationCard({ data, loading }) {
  const { t } = useTranslation();
  const city    = data?.destination?.city;
  const [wikiPhoto, setWikiPhoto] = React.useState(null);
  const getSeed = (str) => str.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 1000;

  React.useEffect(() => {
    if (!city) { setWikiPhoto(null); return; }
    fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(city)}`)
      .then(r => r.json())
      .then(d => {
        const url = d.originalimage?.source || d.thumbnail?.source;
        if (url) setWikiPhoto(url);
        else setWikiPhoto(`https://picsum.photos/seed/${getSeed(city)}/800/600`);
      })
      .catch(() => setWikiPhoto(`https://picsum.photos/seed/${getSeed(city)}/800/600`));
  }, [city]);

  const photoUrl = wikiPhoto || (city ? `https://picsum.photos/seed/${getSeed(city)}/800/600` : null);
  const bgStyle = city
    ? {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.62) 100%),
          url(${photoUrl})`,
        backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
      }
    : { background: 'linear-gradient(135deg, #FFD60A 0%, #FF5C39 100%)' };

  return (
    <div className="bento-card destination-card fade-in" style={bgStyle}>
      {loading ? (
        <div className="dest-inner">
          <Skeleton w="55%" h="22px" style={{ marginBottom: 10, opacity: 0.4 }} />
          <Skeleton w="80%" h="48px" r="10px" style={{ marginBottom: 10, opacity: 0.4 }} />
          <Skeleton w="45%" h="18px" style={{ opacity: 0.4 }} />
        </div>
      ) : city ? (
        <div className="dest-inner">
          <div className="dest-badge">{data.destination.country}</div>
          <h2 className="dest-city">{city}</h2>
          <p className="dest-dates"><Clock size={13} style={{ marginRight: 5 }} />{data.destination.dates}</p>
          {data.destination.highlights && data.destination.highlights.length > 0 && (
            <div className="dest-highlights">
              {data.destination.highlights.map((h, i) => (
                <div key={i} className="dest-highlight">✨ {h}</div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="dest-placeholder">
          <Plane size={52} color="rgba(255,255,255,0.25)" />
          <p>{t('cards.destPlaceholder')}</p>
        </div>
      )}
    </div>
  );
}

// ─── WEATHER CARD ─────────────────────────────────────────────────────────────

function WeatherCard({ data, loading, isLive, enriching = false }) {
  const { t } = useTranslation();
  const w    = data?.weather;
  const maxT = w?.forecast?.length ? Math.max(...w.forecast.map(f => f.temp || f)) : 1;

  return (
    <div className="bento-card fade-in" style={{ animationDelay: '60ms' }}>
      <div className="card-label-row">
        <div className="card-label">{t('cards.weather')}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {enriching && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />}
          {isLive && <LiveBadge />}
        </div>
      </div>
      {loading ? (
        <>
          <Skeleton w="56px" h="56px" r="50%" style={{ margin: '8px auto 10px' }} />
          <Skeleton w="60%" h="36px" r="8px" style={{ margin: '0 auto 10px' }} />
          <div style={{ display: 'flex', gap: 4, marginTop: 8 }}>
            {[1,2,3,4,5].map(i => <Skeleton key={i} h="36px" r="5px" style={{ flex: 1 }} />)}
          </div>
        </>
      ) : w?.temp ? (
        <>
          <div className="weather-main">
            <WeatherIcon condition={w.condition} />
            <div className="weather-temp">{w.temp}</div>
          </div>
          <div className="weather-cond">{w.condition}</div>
          <div className="forecast-row">
            {w.forecast?.map((f, i) => {
              const temp = typeof f === 'number' ? f : (f.temp || 0);
              const day = typeof f === 'object' ? (f.day || '') : '';
              return (
                <div key={i} className="forecast-col">
                  <div className="forecast-wrap">
                    <div className="forecast-bar" style={{ height: `${Math.max(6, (temp / maxT) * 44)}px` }} />
                  </div>
                  {day && <span style={{fontSize: '10px', color: 'var(--text-sec)'}}>{day}</span>}
                  <span className="forecast-val">{temp}°</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="card-empty"><Sun size={30} color="var(--text-sec)" /><span>{t('cards.weather')}</span></div>
      )}
    </div>
  );
}

// ─── FLIGHT CARD ──────────────────────────────────────────────────────────────

function FlightCard({ data, loading, isReal, enriching = false }) {
  const { t, i18n } = useTranslation();
  const fl = data?.flight;

  return (
    <div className="bento-card fade-in" style={{ animationDelay: '120ms' }}>
      <div className="card-label-row">
        <div className="card-label">{t('cards.flight')}</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {enriching && <Loader2 size={14} style={{ animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />}
          {isReal && <RealBadge />}
        </div>
      </div>
      {loading ? (
        <>
          <Skeleton w="75%" h="18px" style={{ marginBottom: 8 }} />
          <Skeleton w="50%" h="22px" style={{ marginBottom: 14 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Skeleton w="38px" h="38px" r="8px" />
            <Skeleton h="6px" style={{ flex: 1 }} r="3px" />
            <Skeleton w="38px" h="38px" r="8px" />
          </div>
        </>
      ) : fl?.airline ? (
        <>
          <div className="fl-airline">{fl.airline}</div>
          <div className="fl-number">
            ✈ {fl.flightNumber}
            {fl.price && <span className="fl-price">{fl.price}</span>}
          </div>
          {fl.date && <div style={{fontSize: '12px', color: 'var(--text-sec)', marginBottom: '8px'}}>{fmtDate(fl.date, i18n.language)}</div>}
          <div className="fl-route">
            <div className="fl-point">
              <div className="fl-time">{fl.departure}</div>
              <div className="fl-code">{fl.from}</div>
              {fl.fromCity && <div className="fl-city">{fl.fromCity}</div>}
            </div>
            <div className="fl-line"><Plane size={13} className="fl-plane-icon" /></div>
            <div className="fl-point" style={{ textAlign: 'right' }}>
              <div className="fl-time">{fl.arrival}</div>
              <div className="fl-code">{fl.to}</div>
              {fl.toCity && <div className="fl-city">{fl.toCity}</div>}
            </div>
          </div>
          <button
            className="btn-secondary"
            onClick={() => {
              window.open(`https://www.google.com/travel/explore?q=flights+from+${fl.from}+to+${fl.to}`, '_blank');
            }}
            style={{ marginTop: '10px', fontSize: '12px' }}
          >
            {t('cards.searchFlights')}
          </button>
        </>
      ) : (
        <div className="card-empty"><Plane size={30} color="var(--text-sec)" /><span>{t('cards.flightEmpty')}</span></div>
      )}
    </div>
  );
}

// ─── HOTEL CARD ───────────────────────────────────────────────────────────────

function HotelCard({ data, loading }) {
  const { t } = useTranslation();
  const h = data?.hotel;

  return (
    <div className="bento-card hotel-card fade-in" style={{ animationDelay: '180ms' }}>
      <div className="card-label">{t('cards.hotel')}</div>
      {loading ? (
        <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
          <div style={{ flex: 1 }}>
            <Skeleton w="75%" h="22px" style={{ marginBottom: 8 }} />
            <Skeleton w="50%" h="14px" style={{ marginBottom: 8 }} />
            <Skeleton w="90%" h="13px" />
          </div>
          <Skeleton w="90px" h="62px" r="12px" />
        </div>
      ) : h?.name ? (
        <div className="hotel-content">
          <div className="hotel-info">
            <h3 className="hotel-name">{h.name}</h3>
            <Stars n={h.stars} />
            <p className="hotel-addr"><MapPin size={11} style={{ marginRight: 4 }} />{h.address}</p>
          </div>
          <div className="hotel-dates">
            <div>
              <div className="date-lbl">{t('cards.checkIn')}</div>
              <div className="date-val">{h.checkIn}</div>
            </div>
            <div className="hotel-price-box">
              <div className="hotel-price">{h.pricePerNight}€</div>
              <div className="per-night">{t('cards.perNight')}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="date-lbl">{t('cards.checkOut')}</div>
              <div className="date-val">{h.checkOut}</div>
            </div>
          </div>
          {h.checkIn && h.checkOut && (() => {
            const nights = daysBetween(h.checkIn, h.checkOut);
            return nights > 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-sec)', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <div>{t('cards.nights', { count: nights, total: h.pricePerNight * nights })}</div>
              </div>
            ) : null;
          })()}
          {data?.destination?.city && (
            <button
              className="btn-secondary"
              onClick={() => {
                const parseDate = (dateStr) => {
                  if (!dateStr) return '';
                  dateStr = dateStr.trim();
                  if (dateStr.includes('-')) {
                    return dateStr;
                  }
                  const parts = dateStr.split('/').map(p => p.trim());
                  if (parts.length === 3 && parts[2].length === 4) {
                    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                  }
                  return '';
                };
                const params = new URLSearchParams({
                  ss: data.destination.city,
                  checkin: parseDate(h.checkIn) || '',
                  checkout: parseDate(h.checkOut) || '',
                  no_rooms: '1',
                  group_adults: '1'
                });
                window.open(`https://www.booking.com/searchresults.html?${params.toString()}`, '_blank');
              }}
              style={{ marginTop: '10px', fontSize: '12px' }}
            >
              {t('cards.viewBooking')}
            </button>
          )}
        </div>
      ) : (
        <div className="card-empty"><Building2 size={30} color="var(--text-sec)" /><span>{t('cards.hotelEmpty')}</span></div>
      )}
    </div>
  );
}

// ─── PRACTICAL INFO CARD ───────────────────────────────────────────────────────

function PracticalInfoCard({ data, loading }) {
  const { t } = useTranslation();
  const info = data?.practicalInfo;
  const [expanded, setExpanded] = useState(null);

  const items = [
    { key: 'visa', icon: '🛂', label: t('cards.visa'), value: info?.visa },
    { key: 'vaccines', icon: '💉', label: t('cards.vaccines'), value: info?.vaccines },
    { key: 'plug', icon: '🔌', label: t('cards.plug'), value: info?.plug },
    { key: 'currency', icon: '💱', label: t('cards.currency'), value: info?.currency },
    { key: 'timezone', icon: '🕐', label: t('cards.timezone'), value: info?.timezone },
    { key: 'safety', icon: '🛡️', label: t('cards.safety'), value: info?.safety },
  ];

  const getSafetyColor = (level) => {
    if (level <= 2) return '#EF4444';
    if (level === 3) return '#F59E0B';
    return '#10B981';
  };

  if (loading) {
    return (
      <div className="bento-card practical-card fade-in" style={{ animationDelay: '240ms' }}>
        <div className="card-label">{t('cards.practicalInfo')}</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} w="80px" h="60px" r="8px" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bento-card practical-card fade-in" style={{ animationDelay: '240ms' }}>
      <div className="card-label">{t('cards.practicalInfo')}</div>
      {info ? (
        <>
          <div className="practical-icons">
            {items.map(({ key, icon, label, value }) => (
              <button
                key={key}
                className="practical-icon-btn"
                title={label}
                onMouseEnter={() => setExpanded(key)}
                onMouseLeave={() => setExpanded(null)}
                onClick={() => setExpanded(expanded === key ? null : key)}
              >
                <span className="prac-emoji">{icon}</span>
                {expanded === key && value && <div className="prac-tooltip">{value}</div>}
              </button>
            ))}
          </div>
          {info.safetyLevel !== undefined && (
            <div className="safety-indicator">
              <div style={{ display: 'flex', gap: 4 }}>
                {[1, 2, 3, 4, 5].map(i => (
                  <div
                    key={i}
                    className="safety-bar"
                    style={{
                      backgroundColor: i <= info.safetyLevel ? getSafetyColor(info.safetyLevel) : 'var(--border)',
                    }}
                  />
                ))}
              </div>
              <span className="safety-label">{info.safetyLevel}/5</span>
            </div>
          )}
          {info.warnings && (
            <div className="warnings-box">
              <span style={{ fontSize: '11px', color: 'var(--text-sec)' }}>⚠️ {info.warnings}</span>
            </div>
          )}
        </>
      ) : (
        <div className="card-empty"><FileText size={30} color="var(--text-sec)" /><span>{t('cards.practicalEmpty')}</span></div>
      )}
    </div>
  );
}

// ─── ACTIVITIES CARD ──────────────────────────────────────────────────────────

function ActivitiesCard({ data, loading, onDayClick, ratings, setRatings, customActivities, setCustomActivities, deletedIndices, setDeletedIndices, dayActivityOrder, setDayActivityOrder }) {
  const { t } = useTranslation();
  const acts   = data?.activities || [];
  const days   = [...new Set(acts.map(a => a.day || 1))].sort((a, b) => a - b);
  const [activeDay, setActiveDay] = useState(1);
  const [fading, setFading]       = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [regenerating, setRegenerating] = useState(null);
  const [addingDay, setAddingDay] = useState(null);
  const [formData, setFormData] = useState({ name: '', time: '', tag: 'culture' });
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);

  useEffect(() => { setActiveDay(days[0] || 1); }, [acts.length]);

  const switchDay = (d) => {
    if (d === activeDay) return;
    setFading(true);
    setTimeout(() => { setActiveDay(d); setFading(false); onDayClick?.(d); }, 180);
  };

  const handleDelete = (idx) => {
    setDeletedIndices(new Set([...deletedIndices, idx]));
  };

  const handleRegenerate = async (act) => {
    setRegenerating(`${act.day}-${act.name}`);
    try {
      const userKey = sessionStorage.getItem('mistral_key') || null;
      const newAct = await regenerateActivity({
        day: act.day,
        time: act.time,
        tag: act.tag,
        name: act.name,
        userKey,
      });
      newAct.day = act.day;
      setCustomActivities(p => [...p, newAct]);
      setDeletedIndices(new Set([...deletedIndices].filter(i => i !== acts.indexOf(act))));
    } catch (e) {
      console.error('Regenerate failed:', e);
    } finally {
      setRegenerating(null);
    }
  };

  const handleAddActivity = async () => {
    if (!formData.name.trim() || !formData.time.trim()) return;
    const newActivity = { ...formData, day: activeDay, emoji: '✏️', lat: null, lng: null, geocoding: true };
    setCustomActivities(p => [...p, newActivity]);
    setFormData({ name: '', time: '', tag: 'culture' });
    setAddingDay(null);

    // Geocode the activity
    const destCity = data?.destination?.city;
    if (destCity) {
      try {
        const query = `${formData.name} ${destCity}`;
        const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=1`);
        const results = await res.json();
        if (results.length > 0) {
          const { lat, lon } = results[0];
          setCustomActivities(p => p.map(a =>
            a.name === formData.name ? { ...a, lat: parseFloat(lat), lng: parseFloat(lon), geocoding: false } : a
          ));
        } else {
          setCustomActivities(p => p.map(a =>
            a.name === formData.name ? { ...a, geocoding: false } : a
          ));
        }
      } catch (err) {
        console.error('[geocode] Error:', err);
        setCustomActivities(p => p.map(a =>
          a.name === formData.name ? { ...a, geocoding: false } : a
        ));
      }
    }
  };

  const setRating = (actKey, stars) => {
    setRatings(p => ({ ...p, [actKey]: stars }));
  };

  const makeActivityId = (type, idx) => `${type}:${idx}`;
  const getActivityType = (act) => {
    const origIdx = acts.findIndex(a => a === act);
    if (origIdx !== -1) return { type: 'orig', index: origIdx };
    const custIdx = customActivities.findIndex(a => a === act);
    if (custIdx !== -1) return { type: 'custom', index: custIdx };
    return null;
  };

  const getAllActivityItemsForDay = () => {
    const all = [
      ...acts
        .map((act, idx) => ({ act, id: makeActivityId('orig', idx), type: 'orig', index: idx }))
        .filter(item => !deletedIndices.has(item.index)),
      ...customActivities
        .map((act, idx) => ({ act, id: makeActivityId('custom', idx), type: 'custom', index: idx }))
        .filter(item => item.act.day === activeDay)
    ];
    const saved = dayActivityOrder[activeDay];
    if (!saved || saved.length === 0) return all;
    const map = new Map(all.map(item => [item.id, item]));
    const ordered = saved.map(id => map.get(id)).filter(Boolean);
    const missing = all.filter(item => !saved.includes(item.id));
    return [...ordered, ...missing];
  };

  const handleDragStart = (e, id) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, id) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(id);
  };

  const handleDrop = (e, dropId) => {
    e.preventDefault();
    if (!draggedId) return;
    const allItems = getAllActivityItemsForDay();
    const dragIdx = allItems.findIndex(item => item.id === draggedId);
    const dropIdx = allItems.findIndex(item => item.id === dropId);
    if (dragIdx === -1 || dropIdx === -1 || dragIdx === dropIdx) {
      setDraggedId(null);
      setDragOverIndex(null);
      return;
    }
    const newOrder = allItems.map(item => item.id);
    const [dragged] = newOrder.splice(dragIdx, 1);
    newOrder.splice(dropIdx, 0, dragged);
    setDayActivityOrder(p => ({ ...p, [activeDay]: newOrder }));
    setDraggedId(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverIndex(null);
  };

  const TAG_FILTER_OPTIONS = [
    { value: 'all',           label: t('filters.all') },
    { value: 'culture',       label: t('filters.culture') },
    { value: 'food',          label: t('filters.food') },
    { value: 'nature',        label: t('filters.nature') },
    { value: 'divertissement', label: t('filters.entertainment') },
  ];

  const allActivityItems = getAllActivityItemsForDay();
  const filteredItems = allActivityItems
    .filter(item => (item.act.day || 1) === activeDay)
    .filter(item => activeFilter === 'all' || item.act.tag === activeFilter);
  const filtered = filteredItems.map(item => item.act);
  const deletedActs = acts.filter((a, idx) => deletedIndices.has(idx) && (a.day || 1) === activeDay);

  return (
    <>
      <div className="bento-card acts-card fade-in" style={{ animationDelay: '240ms' }}>
        <div className="card-label">{t('cards.activities')}</div>
        {!loading && days.length > 1 && (
          <div className="day-tabs">
            {days.map(d => (
              <button key={d} className={`day-tab ${d === activeDay ? 'active' : ''}`} onClick={() => switchDay(d)}>
                J{d}
              </button>
            ))}
          </div>
        )}
        {!loading && acts.length > 0 && (
          <div className="act-filters">
            {TAG_FILTER_OPTIONS.map(({ value, label }) => (
              <button
                key={value}
                className={`act-filter-pill ${value === activeFilter ? 'active' : ''}`}
                onClick={() => setActiveFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[1,2,3,4,5].map(i => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <Skeleton w="36px" h="36px" r="10px" />
                <div style={{ flex: 1 }}>
                  <Skeleton w="70%" h="14px" style={{ marginBottom: 5 }} />
                  <Skeleton w="45%" h="11px" />
                </div>
              </div>
            ))}
          </div>
        ) : acts.length > 0 ? (
          <div className={`acts-list ${fading ? 'fading' : ''}`}>
            {filteredItems.map((item, i) => {
              const act    = item.act;
              const id     = item.id;
              const actType = { type: item.type, index: item.index };
              const tagKey = (act.tag || '').toLowerCase();
              const ts     = TAG_STYLES[tagKey] || TAG_STYLES.culture;
              const actKey = `${act.day}-${act.name}`;
              const rating = ratings[actKey] || 0;
              const isBeingDragged = draggedId === id;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, id)}
                  onDragOver={(e) => handleDragOver(e, id)}
                  onDrop={(e) => handleDrop(e, id)}
                  onDragEnd={handleDragEnd}
                  className="act-item-wrap"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    opacity: isBeingDragged ? 0.5 : 1,
                    borderTop: dragOverIndex === id ? '2px dashed var(--accent)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div className="act-item-row">
                    <div className="act-item" style={{ cursor: 'pointer' }} onClick={() => setSelectedActivity(act)}>
                      <div className="act-emoji" style={{ position: 'relative' }}>
                        {act.emoji}
                        {act.geocoding && <Loader2 size={12} style={{ position: 'absolute', bottom: 0, right: 0, animation: 'spin 1s linear infinite', color: 'var(--accent)' }} />}
                      </div>
                      <div className="act-info">
                        <div className="act-name">{act.name}</div>
                        <div className="act-meta">
                          <span className="act-time"><Clock size={10} style={{ marginRight: 3 }} />{act.time}</span>
                          <span className="act-tag" style={{ background: ts.bg, color: ts.color }}>{act.tag}</span>
                        </div>
                      </div>
                      <div className="act-stars" onClick={e => e.stopPropagation()}>
                        {[1,2,3,4,5].map(star => (
                          <button
                            key={star}
                            className="star-btn"
                            onClick={() => setRating(actKey, rating === star ? 0 : star)}
                          >
                            <Star size={14} fill={star <= rating ? 'currentColor' : 'none'} color={star <= rating ? '#F59E0B' : 'var(--border)'} />
                          </button>
                        ))}
                      </div>
                      <button className="act-maps-btn" onClick={(e) => { e.stopPropagation(); window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(act.name + ', ' + data?.destination?.city)}`, '_blank'); }} title={t('cards.viewMaps')}><MapPin size={14} /></button>
                    </div>
                    <button
                      className="act-delete"
                      onClick={() => {
                        if (actType?.type === 'orig') {
                          handleDelete(actType.index);
                        } else if (actType?.type === 'custom') {
                          setCustomActivities(p => p.filter((_, idx) => idx !== actType.index));
                          const newOrder = { ...dayActivityOrder };
                          delete newOrder[activeDay];
                          setDayActivityOrder(newOrder);
                        }
                      }}
                      title={t('sidebar.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {act.travelTimeFromPrev && <div className="act-travel-time">🚶 {act.travelTimeFromPrev}</div>}
                </div>
              );
            })}
            {deletedActs.map((act, i) => (
              <div key={`regen-${i}`} className="act-regenerate fade-in" style={{ animationDelay: `${filteredItems.length * 60 + i * 60}ms` }}>
                {regenerating === `${act.day}-${act.name}` ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <button onClick={() => handleRegenerate(act)} className="regen-btn">
                    <RotateCcw size={14} />
                    {t('cards.regenerate')}
                  </button>
                )}
              </div>
            ))}
            {addingDay === activeDay ? (
              <div className="act-form fade-in">
                <input
                  type="text"
                  placeholder={t('cards.activityName')}
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="form-input"
                />
                <input
                  type="text"
                  placeholder={t('cards.activityTime')}
                  value={formData.time}
                  onChange={e => setFormData(p => ({ ...p, time: e.target.value }))}
                  className="form-input"
                />
                <select
                  value={formData.tag}
                  onChange={e => setFormData(p => ({ ...p, tag: e.target.value }))}
                  className="form-input"
                >
                  <option value="culture">Culture</option>
                  <option value="food">Food</option>
                  <option value="nature">Nature</option>
                </select>
                <div className="form-buttons">
                  <button onClick={handleAddActivity} className="btn-primary">{t('cards.add')}</button>
                  <button onClick={() => setAddingDay(null)} className="btn-secondary">{t('cards.cancel')}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingDay(activeDay)} className="act-add-btn">
                <Plus size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="card-empty"><MapPin size={30} color="var(--text-sec)" /><span>{t('cards.activitiesEmpty')}</span></div>
        )}
      </div>
      {selectedActivity && (
        <div className="act-modal-overlay" onClick={() => setSelectedActivity(null)}>
          <div className="activity-modal" onClick={e => e.stopPropagation()}>
            <button className="act-modal-close" onClick={() => setSelectedActivity(null)}>
              <X size={18} />
            </button>
            <button className="modal-maps-btn" onClick={() => window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(selectedActivity.name + ', ' + data?.destination?.city)}`, '_blank')} title={t('cards.viewMaps')}>
              <MapPin size={16} />
            </button>
            <div className="modal-emoji">{selectedActivity.emoji}</div>
            <h2 className="modal-title">{selectedActivity.name}</h2>
            <div className="rating-modal">
              {[1,2,3,4,5].map(star => (
                <button
                  key={star}
                  className="star-btn-lg"
                  onClick={() => setRating(`${selectedActivity.day}-${selectedActivity.name}`, ratings[`${selectedActivity.day}-${selectedActivity.name}`] === star ? 0 : star)}
                >
                  <Star size={20} fill={star <= (ratings[`${selectedActivity.day}-${selectedActivity.name}`] || 0) ? 'currentColor' : 'none'} color={star <= (ratings[`${selectedActivity.day}-${selectedActivity.name}`] || 0) ? '#F59E0B' : 'var(--border)'} />
                </button>
              ))}
            </div>
            <div className="modal-content">
              {selectedActivity.description && (
                <div className="modal-section">
                  <div className="modal-section-title">{t('modal.description')}</div>
                  <p>{selectedActivity.description}</p>
                </div>
              )}
              {selectedActivity.duration && (
                <div className="modal-section">
                  <div className="modal-section-title">{t('modal.duration')}</div>
                  <p>{selectedActivity.duration}</p>
                </div>
              )}
              {selectedActivity.price && (
                <div className="modal-section">
                  <div className="modal-section-title">{t('modal.estimatedPrice')}</div>
                  <p>{selectedActivity.price}</p>
                </div>
              )}
              {selectedActivity.address && (
                <div className="modal-section">
                  <div className="modal-section-title">{t('modal.address')}</div>
                  <p>{selectedActivity.address}</p>
                </div>
              )}
              {selectedActivity.time && (
                <div className="modal-section">
                  <div className="modal-section-title">{t('modal.schedule')}</div>
                  <p>{selectedActivity.time}</p>
                </div>
              )}
              {selectedActivity.tag && (
                <div className="modal-section">
                  <div className="modal-section-title">{t('modal.category')}</div>
                  <span className="act-tag" style={{ background: TAG_STYLES[selectedActivity.tag]?.bg, color: TAG_STYLES[selectedActivity.tag]?.color }}>
                    {selectedActivity.tag}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── BUDGET CARD ──────────────────────────────────────────────────────────────

function BudgetCard({ data, loading, highlightedDay = null, isOver = false, travelers = 'Solo', actualSpending = {}, setActualSpending = () => {} }) {
  const { t } = useTranslation();
  const [currency, setCurrency] = useState('EUR');
  const [rates,    setRates]    = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [editValue, setEditValue] = useState('');

  const bud        = data?.budget;
  const summary    = bud?.summary || {};
  const totalSpent = Object.values(summary).reduce((a, b) => a + b, 0);
  const rate       = (currency !== 'EUR' && rates?.[currency]) ? rates[currency] : 1;
  const sym        = CURRENCY_SYMBOLS[currency] || currency;
  const conv       = (v) => currency === 'EUR' ? v : Math.round(v * rate);

  const travelersMap = { 'Solo': 1, 'Couple': 2, 'Famille': 4, 'Groupe': 6 };
  const nbTravelers = travelersMap[travelers] || 1;
  const perPersonBudget = bud?.total ? Math.round(bud.total / nbTravelers) : 0;

  const handleCurrencyChange = async (e) => {
    const c = e.target.value;
    setCurrency(c);
    if (c !== 'EUR' && !rates) {
      try { setRates(await fetchExchangeRates()); }
      catch { /* silently ignore — amounts stay in EUR */ }
    }
  };

  const handleExportBudgetCSV = () => {
    const budgetLabels = { housing: t('budgetLabels.housing'), food: t('budgetLabels.food'), transport: t('budgetLabels.transport'), activities: t('budgetLabels.activities'), other: t('budgetLabels.other') };
    const rows = [[t('modal.category'), `${t('cards.estimated')} (€)`, `${t('cards.actual')} (€)`]];
    Object.entries(summary).forEach(([k, v]) => {
      const actual = actualSpending[k] || 0;
      rows.push([budgetLabels[k], v.toString(), actual.toString()]);
    });
    rows.push(['TOTAL', bud.total.toString(), Object.values(actualSpending).reduce((a, b) => a + b, 0).toString()]);
    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `budget-${data?.destination?.city || 'voyage'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`bento-card fade-in ${isOver ? 'budget-over' : ''}`} style={{ animationDelay: '300ms' }}>
      <div className="card-label-row">
        <div className="card-label">{t('cards.budget')} {isOver && <span className="budget-badge">⚠️ {t('cards.budgetOver')}</span>}</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {bud?.total && (
            <>
              <button className="icon-btn" title={t('cards.exportCSV')} onClick={handleExportBudgetCSV} style={{ fontSize: '12px', padding: '4px 8px' }}>📥 CSV</button>
              <select className="currency-select" value={currency} onChange={handleCurrencyChange}>
                {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </>
          )}
        </div>
      </div>
      {loading ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <Skeleton w="88px" h="88px" r="50%" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            {[1,2,3,4].map(i => <Skeleton key={i} h="13px" w={`${90 - i * 10}%`} />)}
          </div>
        </div>
      ) : bud?.total ? (
        <>
          <div className="budget-wrap">
            <div className="budget-chart-area">
              <DonutChart summary={summary} />
              <div className="budget-center">
                <div className="budget-spent">{conv(totalSpent)}{sym}</div>
                <div className="budget-of">{t('cards.estimated')}</div>
                <div style={{fontSize: '10px', color: 'var(--text-sec)', marginTop: '4px'}}>{t('cards.budgetMax')} {conv(bud.total)}{sym}</div>
                {nbTravelers > 1 && <div style={{fontSize: '10px', color: 'var(--text-sec)', marginTop: '2px'}}>{conv(perPersonBudget)}{sym}{t('cards.perPerson')}</div>}
              </div>
            </div>
            <div className="budget-legend">
              {Object.entries(summary).filter(([, v]) => v > 0).map(([k, v]) => {
                const actual = actualSpending[k] || 0;
                const isEditing = editingCategory === k;
                const handleConfirm = () => {
                  setActualSpending(p => ({ ...p, [k]: parseFloat(editValue) || 0 }));
                  setEditingCategory(null);
                };
                return (
                  <div key={k} className="legend-row" style={{ cursor: 'pointer' }} onClick={() => {
                    if (!isEditing) {
                      setEditingCategory(k);
                      setEditValue(actual.toString());
                    }
                  }}>
                    <div className="legend-dot" style={{ background: BUDGET_COLORS[k] }} />
                    <span className="legend-lbl">{t(`budgetLabels.${k}`)}</span>
                    <span className="legend-val">{conv(v)}{sym}</span>
                    {isEditing ? (
                      <input
                        type="number"
                        className="legend-input"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') handleConfirm(); }}
                        onBlur={handleConfirm}
                        autoFocus
                        onClick={(e) => e.stopPropagation()}
                        style={{ marginLeft: '8px', padding: '4px 6px', fontSize: '12px', width: '70px' }}
                      />
                    ) : (
                      actual > 0 && <span className="legend-actual"> | {conv(actual)}{sym} {t('cards.actual')}</span>
                    )}
                  </div>
                );
              })}
              {currency !== 'EUR' && rates?.[currency] && (
                <div className="rate-info">1 EUR = {rates[currency].toFixed(2)} {currency}</div>
              )}
            </div>
          </div>
          {bud?.perDay && bud.perDay.length > 0 && (
            <div className="budget-daily-wrap">
              <div className="daily-header">{t('cards.dailyExpenses')}</div>
              <div className="daily-table">
                <table>
                  <thead>
                    <tr>
                      <th>{t('cards.day')}</th>
                      <th>{t('budgetLabels.housing')}</th>
                      <th>{t('budgetLabels.food')}</th>
                      <th>{t('budgetLabels.transport')}</th>
                      <th>{t('budgetLabels.activities')}</th>
                      <th>{t('cards.total')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bud.perDay.map(day => {
                      const dayTotal = (day.housing || 0) + (day.food || 0) + (day.transport || 0) + (day.activities || 0);
                      const isHighlighted = highlightedDay === day.day;
                      return (
                        <tr key={day.day} className={isHighlighted ? 'highlighted-day' : ''}>
                          <td className="day-num">J{day.day}</td>
                          <td>{conv(day.housing || 0)}{sym}</td>
                          <td>{conv(day.food || 0)}{sym}</td>
                          <td>{conv(day.transport || 0)}{sym}</td>
                          <td>{conv(day.activities || 0)}{sym}</td>
                          <td className="day-total">{conv(dayTotal)}{sym}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="card-empty"><Wallet size={30} color="var(--text-sec)" /><span>{t('cards.budgetEmpty')}</span></div>
      )}
    </div>
  );
}

// ─── PACKING LIST CARD ────────────────────────────────────────────────────────────

function PackingListCard({ data, loading, checked, onToggle, customPackingItems = {}, setCustomPackingItems = () => {} }) {
  const { t } = useTranslation();
  const packingList = data?.packingList || {};
  const [expanded, setExpanded] = useState({ essentials: true, clothes: true, gear: true, health: true });
  const [addingCategory, setAddingCategory] = useState(null);
  const [addItemValue, setAddItemValue] = useState('');
  const keyRef = useRef('');
  useEffect(() => { keyRef.current = JSON.stringify(packingList); }, [packingList]);

  const allItems = Object.values(packingList).flat().concat(Object.values(customPackingItems).flat());
  const packedCount = allItems.filter(item => !!checked[item]).length;
  const totalCount = allItems.length;

  const categories = [
    { key: 'essentials', label: `✋ ${t('cards.essentials')}`, icon: '🛂' },
    { key: 'clothes', label: `👕 ${t('cards.clothes')}`, icon: '👔' },
    { key: 'gear', label: `🎒 ${t('cards.gear')}`, icon: '⚙️' },
    { key: 'health', label: `💊 ${t('cards.health')}`, icon: '🏥' },
  ];

  const toggleCategory = (key) => {
    setExpanded(p => ({ ...p, [key]: !p[key] }));
  };

  return (
    <div className="bento-card fade-in" style={{ animationDelay: '360ms' }}>
      <div className="card-label"><CheckSquare2 size={13} style={{ marginRight: 5 }} />{t('cards.packingList')}</div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[1,2,3,4,5].map(i => <Skeleton key={i} h="18px" w={`${50 + i * 8}%`} />)}
        </div>
      ) : totalCount > 0 ? (
        <>
          <div className="packing-counter">{t('cards.itemsReady', { done: packedCount, total: totalCount })}</div>
          <div className="packing-categories">
            {categories.map(({ key, label, icon }) => {
              const baseItems = packingList[key] || [];
              const customItems = customPackingItems[key] || [];
              const allCatItems = [...baseItems, ...customItems];
              if (allCatItems.length === 0) return null;
              const isAdding = addingCategory === key;
              const handleAddItem = () => {
                if (!addItemValue.trim()) return;
                setCustomPackingItems(p => ({
                  ...p,
                  [key]: [...(p[key] || []), addItemValue.trim()]
                }));
                setAddItemValue('');
                setAddingCategory(null);
              };
              return (
                <div key={key} className="packing-category">
                  <button className="category-header" onClick={() => toggleCategory(key)}>
                    <span className="cat-icon">{icon}</span>
                    <span className="cat-label">{label}</span>
                    <span className="cat-count">{allCatItems.filter(i => !!checked[i]).length}/{allCatItems.length}</span>
                    <ChevronRight size={14} className={`chevron ${expanded[key] ? 'open' : ''}`} />
                  </button>
                  {expanded[key] && (
                    <div className="category-items">
                      {allCatItems.map((item, i) => {
                        const on = !!checked[item];
                        return (
                          <button key={i} className={`check-item ${on ? 'done' : ''}`} onClick={() => onToggle(item)}>
                            <div className={`checkbox ${on ? 'checked' : ''}`}>{on && <span>✓</span>}</div>
                            <span className="check-txt">{item}</span>
                          </button>
                        );
                      })}
                      {isAdding ? (
                        <div style={{ display: 'flex', gap: 6, padding: '6px 0' }}>
                          <input
                            type="text"
                            value={addItemValue}
                            onChange={(e) => setAddItemValue(e.target.value)}
                            onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }}
                            onBlur={handleAddItem}
                            autoFocus
                            placeholder={t('cards.newItem')}
                            style={{ flex: 1, padding: '6px 8px', fontSize: '12px', border: '1px solid var(--accent)', borderRadius: '4px' }}
                          />
                        </div>
                      ) : (
                        <button className="check-item" onClick={() => setAddingCategory(key)} style={{ color: 'var(--accent)', justifyContent: 'center' }}>
                          <Plus size={14} /> {t('cards.add')}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="card-empty"><CheckSquare2 size={30} color="var(--text-sec)" /><span>{t('cards.packingEmpty')}</span></div>
      )}
    </div>
  );
}

// ─── NOTES CARD ───────────────────────────────────────────────────────────────

function NotesCard({ data, loading, onChange }) {
  const { t } = useTranslation();
  const [val, setVal] = useState('');
  useEffect(() => { setVal(data?.notes || ''); }, [data?.notes]);

  return (
    <div className="bento-card fade-in" style={{ animationDelay: '420ms' }}>
      <div className="card-label"><FileText size={13} style={{ marginRight: 5 }} />{t('cards.notes')}</div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <Skeleton key={i} h="14px" w={`${80 - i * 15}%`} />)}
        </div>
      ) : (
        <textarea
          className="notes-area"
          value={val}
          onChange={e => { setVal(e.target.value); onChange(e.target.value); }}
          placeholder={t('cards.notesPlaceholder')}
        />
      )}
    </div>
  );
}

// ─── MAP CARD ───────────────────────────────────────────────────────────────────

function MapCard({ data, dark, allStepsData = [] }) {
  const { t, i18n } = useTranslation();
  const mapDiv = useRef(null);
  const mapRef = useRef(null);

  useEffect(() => {
    if (!mapDiv.current || !window.L) return;
    if (!mapDiv.current._leaflet_id) {
      mapRef.current = window.L.map(mapDiv.current, { zoomControl: true });
    }
    const L = window.L;
    const map = mapRef.current;
    map.eachLayer(l => map.removeLayer(l));

    const tileUrl = dark
      ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
      : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
    L.tileLayer(tileUrl, { attribution: '© CartoDB', maxZoom: 19 }).addTo(map);

    const bounds = [];
    const markerCluster = window.L.markerClusterGroup({ maxClusterRadius: 60 });

    const allActivities = allStepsData.length > 1
      ? allStepsData.flatMap(s => s?.activities || [])
      : (data?.activities || []);

    const hotel = data?.hotel;
    if (hotel?.lat && hotel?.lng) {
      const icon = L.divIcon({ className: '', html: '<div class="map-marker hotel-marker">🏠</div>', iconSize: [32, 32], iconAnchor: [16, 16] });
      L.marker([hotel.lat, hotel.lng], { icon })
        .bindPopup(`<b>${hotel.name}</b><br>${hotel.address || ''}`)
        .addTo(markerCluster);
      bounds.push([hotel.lat, hotel.lng]);
    }
    allActivities.forEach(act => {
      if (!act.lat || !act.lng) return;
      const c = { culture: '#3B82F6', food: '#D97706', nature: '#059669', divertissement: '#A855F7' }[act.tag] || '#3B82F6';
      const icon = L.divIcon({ className: '', html: `<div class="map-marker act-marker" style="background:${c}">${act.emoji || '📍'}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
      L.marker([act.lat, act.lng], { icon })
        .bindPopup(`<b>${act.name}</b><br>${act.time || ''}<br>${act.tag}`)
        .addTo(markerCluster);
      bounds.push([act.lat, act.lng]);
    });
    map.addLayer(markerCluster);

    // Multi-step: draw polylines and step markers
    if (allStepsData.length > 1) {
      const hotelCoords = allStepsData
        .map(s => s?.hotel?.lat && s?.hotel?.lng ? [s.hotel.lat, s.hotel.lng] : null)
        .filter(Boolean);
      if (hotelCoords.length > 1) {
        L.polyline(hotelCoords, { color: '#3B82F6', weight: 2, dashArray: '6 6', opacity: 0.7 }).addTo(map);
        allStepsData.forEach((stepData, si) => {
          if (!stepData?.hotel?.lat || !stepData?.hotel?.lng) return;
          const icon = L.divIcon({ className: '', html: `<div class="map-marker hotel-marker" style="font-size:11px;font-weight:700">${si+1}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
          L.marker([stepData.hotel.lat, stepData.hotel.lng], { icon }).addTo(map)
            .bindPopup(`<b>${t('timeline.step', { n: si+1 })}: ${stepData.destination?.city}</b><br>${stepData.hotel.name}`);
          bounds.push([stepData.hotel.lat, stepData.hotel.lng]);
        });
      }
    }

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
    else map.setView([20, 0], 2);
    setTimeout(() => map.invalidateSize(), 100);
  }, [data, dark, allStepsData, t]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return (
    <div className="bento-card map-card fade-in" style={{ animationDelay: '480ms' }}>
      <div className="card-label"><MapPin size={13} style={{ marginRight: 5 }} />{t('cards.map')}</div>
      <div ref={mapDiv} className="map-container" />
    </div>
  );
}

// ─── SUGGESTIONS BAR ────────────────────────────────────────────────────────────

function SuggestionsBar({ suggestions, onSelect }) {
  const { t } = useTranslation();
  if (!suggestions.length) return null;
  return (
    <div className="suggestions-bar">
      <span className="suggestions-label"><Sparkles size={12} />{t('suggestions.label')}</span>
      <div className="suggestions-cards">
        {suggestions.map((s, i) => (
          <button key={i} className="suggestion-card" onClick={() => onSelect(s.city)} style={{ animationDelay: `${i * 80}ms` }}>
            <span className="sug-emoji">{s.emoji}</span>
            <div className="sug-info">
              <div className="sug-city">{s.city}</div>
              <div className="sug-reason">{s.reason}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── PREFERENCES PANEL ────────────────────────────────────────────────────────

function PreferencesPanel({ travelers, setTravelers, style, setStyle, pace, setPace, maxBudget, setMaxBudget }) {
  const { t } = useTranslation();
  const travelerOptions = [
    { value: 'Solo', label: t('prefs.solo') },
    { value: 'Couple', label: t('prefs.couple') },
    { value: 'Famille', label: t('prefs.family') },
    { value: 'Groupe', label: t('prefs.group') },
  ];
  const styleOptions = [
    { value: 'Backpacker', label: t('prefs.backpacker') },
    { value: 'Confort', label: t('prefs.comfort') },
    { value: 'Luxe', label: t('prefs.luxury') },
  ];
  const paceOptions = [
    { value: 'Chargé', label: t('prefs.busy') },
    { value: 'Tranquille', label: t('prefs.relaxed') },
  ];
  return (
    <div className="preferences-panel">
      <div className="pref-row">
        <label className="pref-label">{t('prefs.travelers')}</label>
        <div className="pref-pills">
          {travelerOptions.map(o => (
            <button key={o.value} className={`pref-pill ${travelers === o.value ? 'active' : ''}`} onClick={() => setTravelers(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>

      <div className="pref-row">
        <label className="pref-label">{t('prefs.style')}</label>
        <div className="pref-pills">
          {styleOptions.map(o => (
            <button key={o.value} className={`pref-pill ${style === o.value ? 'active' : ''}`} onClick={() => setStyle(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>

      <div className="pref-row">
        <label className="pref-label">{t('prefs.pace')}</label>
        <div className="pref-pills">
          {paceOptions.map(o => (
            <button key={o.value} className={`pref-pill ${pace === o.value ? 'active' : ''}`} onClick={() => setPace(o.value)}>{o.label}</button>
          ))}
        </div>
      </div>

      <div className="pref-row">
        <label className="pref-label">{t('prefs.budgetMax')} <span className="pref-value">{maxBudget}€</span></label>
        <input type="range" className="pref-slider" min="500" max="10000" step="100" value={maxBudget} onChange={e => setMaxBudget(Number(e.target.value))} />
      </div>
    </div>
  );
}

// ─── INSPIRATIONS SECTION ─────────────────────────────────────────────────────

function InspirationCard({ onSelect }) {
  const { t } = useTranslation();
  const inspirations = [
    { emoji: '🎒', title: t('inspirations.backpackAsia'), duration: t('inspirations.weeks', { n: 3 }), price: '1500€', destination: 'Bangkok', days: 21, travelers: 'Solo', style: 'Backpacker', pace: 'Chargé' },
    { emoji: '🚗', title: t('inspirations.roadtripUSA'), duration: t('inspirations.weeks', { n: 2 }), price: '1800€', destination: 'Los Angeles', days: 14, travelers: 'Couple', style: 'Confort', pace: 'Chargé' },
    { emoji: '🏙️', title: t('inspirations.cityBreak'), duration: t('inspirations.days', { n: 5 }), price: '800€', destination: 'Paris', days: 5, travelers: 'Couple', style: 'Confort', pace: 'Tranquille' },
    { emoji: '💑', title: t('inspirations.honeymoon'), duration: t('inspirations.days', { n: 10 }), price: '3000€', destination: 'Maldives', days: 10, travelers: 'Couple', style: 'Luxe', pace: 'Tranquille' },
    { emoji: '🏔️', title: t('inspirations.trekSA'), duration: t('inspirations.weeks', { n: 3 }), price: '2200€', destination: 'Cusco', days: 21, travelers: 'Solo', style: 'Backpacker', pace: 'Chargé' },
    { emoji: '🌍', title: t('inspirations.tourMed'), duration: t('inspirations.weeks', { n: 2 }), price: '2500€', destination: 'Barcelona', days: 14, travelers: 'Groupe', style: 'Confort', pace: 'Chargé' },
  ];

  const gradients = [
    'linear-gradient(135deg, #FFD60A 0%, #FF5C39 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  ];

  return (
    <div className="inspirations-section">
      <h3 className="inspirations-title">{t('inspirations.title')}</h3>
      <div className="inspirations-carousel">
        {inspirations.map((insp, idx) => (
          <button key={idx} className="inspiration-card" style={{ background: gradients[idx] }} onClick={() => onSelect(insp)}>
            <div className="insp-emoji">{insp.emoji}</div>
            <div className="insp-content">
              <div className="insp-title">{insp.title}</div>
              <div className="insp-meta">
                <span className="insp-duration">{insp.duration}</span>
                <span className="insp-price">{insp.price}</span>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── SETTINGS MODAL ───────────────────────────────────────────────────────────

function SettingsModal({ keys, onSave, onClose }) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState({ ...keys });
  const set = (k, v) => setDraft(p => ({ ...p, [k]: v }));

  const fields = [
    { key: 'mistral',       label: 'Mistral AI',         type: 'password', ph: 'Clé API Mistral…',          required: true  },
    { key: 'ow',            label: 'OpenWeather',         type: 'password', ph: 'Clé OpenWeather (optionnel)', required: false },
    { key: 'amadeusId',     label: 'Amadeus Client ID',   type: 'text',     ph: 'Client ID (optionnel)',       required: false },
    { key: 'amadeusSecret', label: 'Amadeus Secret',      type: 'password', ph: 'Secret (optionnel)',          required: false },
  ];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-box settings-box" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <Settings size={16} /><span>{t('settings.title')}</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="modal-hint">{t('settings.hint')}</p>

        <div className="settings-fields">
          {fields.map(f => (
            <div key={f.key} className="settings-field">
              <label className="settings-label">
                {f.label}
                {f.required && <span className="settings-required">*</span>}
              </label>
              <input
                type={f.type}
                className="modal-input"
                style={{ marginBottom: 0 }}
                value={draft[f.key] || ''}
                onChange={e => set(f.key, e.target.value)}
                placeholder={f.ph}
              />
            </div>
          ))}
        </div>

        <div className="modal-actions" style={{ marginTop: 20 }}>
          <button className="modal-cancel" onClick={onClose}>{t('settings.cancel')}</button>
          <button className="modal-save" onClick={() => onSave(draft)}>
            {t('settings.save')} <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MULTI-STEP COMPONENTS ────────────────────────────────────────────────────

const TRANSPORT_EMOJI = { avion: '✈️', train: '🚂', bus: '🚌', bateau: '⛴️', voiture: '🚗' };

function StepTimeline({ steps, activeIdx, onStepClick }) {
  const { t } = useTranslation();
  return (
    <div className="step-timeline fade-in">
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          <button className={`timeline-step${i === activeIdx ? ' active' : ''}${step.data ? ' planned' : ''}`}
            onClick={() => onStepClick(i)}>
            <div className="timeline-circle">
              {step.loading ? <Loader2 size={14} className="spin" /> : step.data ? '🏁' : '📍'}
            </div>
            <div className="timeline-label">{step.data?.destination?.city || step.dest || t('timeline.step', { n: i+1 })}</div>
          </button>
          {i < steps.length - 1 && (
            <div className="timeline-connector">
              <div className="timeline-line" />
              {steps[i + 1]?.data?.transport && (
                <div className="timeline-transport">
                  <span>{TRANSPORT_EMOJI[steps[i+1].data.transport.mode] || '🛣️'}</span>
                  <span>{steps[i+1].data.transport.duration}</span>
                  <span>{steps[i+1].data.transport.price}</span>
                </div>
              )}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function ExtraStepRow({ index, step, onChange, onRemove, disabled }) {
  const { t } = useTranslation();
  return (
    <div className="extra-step-row">
      <span className="step-label-pill">{t('timeline.step', { n: index + 2 })}</span>
      <input className="search-input" placeholder={t('search.destination')} value={step.dest}
        onChange={e => onChange('dest', e.target.value)} disabled={disabled} />
      <div className="search-divider" />
      <input type="date" className="date-input" value={step.dateDepart}
        onChange={e => onChange('dateDepart', e.target.value)} disabled={disabled} />
      <div className="search-divider" />
      <input type="date" className="date-input" value={step.dateRetour}
        onChange={e => onChange('dateRetour', e.target.value)} disabled={disabled} />
      <button className="icon-btn" style={{ marginLeft: 4 }} onClick={onRemove} disabled={disabled}><X size={14} /></button>
    </div>
  );
}

function ChatPanel({ messages, loading, onSendMessage, onClose, open }) {
  const { t } = useTranslation();
  const [input, setInput] = React.useState('');
  const messagesEnd = React.useRef(null);

  React.useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (input.trim()) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className={`chat-panel ${open ? 'open' : ''}`}>
      <div className="chat-header">
        <div className="chat-title">{t('chat.title')}</div>
        <button className="chat-close" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="chat-messages">
        {messages.map((msg, i) => (
          <div key={i} className={`chat-message ${msg.role}`}>
            <div className="chat-content">{msg.content}</div>
          </div>
        ))}
        {loading && <div className="chat-message assistant"><Loader2 size={14} className="spin" /></div>}
        <div ref={messagesEnd} />
      </div>
      <div className="chat-input">
        <input
          type="text"
          placeholder={t('chat.placeholder')}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && handleSend()}
          disabled={loading}
        />
        <button onClick={handleSend} disabled={loading || !input.trim()}>📤</button>
      </div>
    </div>
  );
}

function TimelineView({ data, destination }) {
  const { t } = useTranslation();
  if (!data?.activities?.length) return <div style={{padding: '20px', textAlign: 'center', color: 'var(--text-sec)'}}>{t('timeline.noActivities')}</div>;

  const days = [...new Set(data.activities.map(a => a.day || 1))].sort((a, b) => a - b);

  return (
    <div className="timeline-view">
      <div className="timeline-title">{destination}</div>
      {days.map(day => (
        <div key={day} className="timeline-day">
          <div className="timeline-day-header">{t('timeline.day', { n: day })}</div>
          {data.activities.filter(a => (a.day || 1) === day).map((act, i) => (
            <div key={`${day}-${i}`} className="timeline-activity">
              <div className="timeline-activity-time">{act.time}</div>
              <div className="timeline-activity-dot" />
              <div className="timeline-activity-content">
                <div className="timeline-activity-name">{act.emoji} {act.name}</div>
                <div className="timeline-activity-meta">
                  <span className="timeline-tag" style={{background: TAG_STYLES[act.tag]?.bg, color: TAG_STYLES[act.tag]?.color}}>
                    {act.tag}
                  </span>
                  {act.travelTimeFromPrev && <span className="timeline-travel">🚶 {act.travelTimeFromPrev}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function CompareView({ dataA, dataB, compareLoading, compareDest, setCompareDest,
  compareDateDepart, setCompareDateDepart, compareDateRetour, setCompareDateRetour,
  onPlan, onChoose, onClose }) {
  const { t } = useTranslation();
  const cmp = (a, b, lowerBetter = false) => {
    if (a == null || b == null || a === b) return '';
    return (lowerBetter ? a < b : a > b) ? 'better' : 'worse';
  };
  const priceA = dataA?.hotel?.pricePerNight, priceB = dataB?.hotel?.pricePerNight;
  const budgetA = dataA?.budget?.total, budgetB = dataB?.budget?.total;
  const actA = dataA?.activities?.length ?? 0, actB = dataB?.activities?.length ?? 0;
  const safeA = dataA?.practicalInfo?.safetyLevel, safeB = dataB?.practicalInfo?.safetyLevel;

  const statsA = [
    { label: t('compare.weather'),      value: dataA?.weather?.temp ? `${dataA.weather.temp} — ${dataA.weather.condition}` : '—', cls: '' },
    { label: t('compare.hotelPerNight'), value: priceA != null ? `${priceA} €` : '—', cls: cmp(priceA, priceB, true) },
    { label: t('compare.totalBudget'),  value: budgetA != null ? `${budgetA} €` : '—', cls: cmp(budgetA, budgetB, true) },
    { label: t('compare.activities'),   value: actA ? t('compare.activitiesCount', { count: actA }) : '—', cls: cmp(actA, actB) },
    { label: t('compare.safety'),       value: safeA != null ? `${safeA}/5` : '—', cls: cmp(safeA, safeB) },
  ];
  const statsB = [
    { label: t('compare.weather'),      value: dataB?.weather?.temp ? `${dataB.weather.temp} — ${dataB.weather.condition}` : '—', cls: '' },
    { label: t('compare.hotelPerNight'), value: priceB != null ? `${priceB} €` : '—', cls: cmp(priceB, priceA, true) },
    { label: t('compare.totalBudget'),  value: budgetB != null ? `${budgetB} €` : '—', cls: cmp(budgetB, budgetA, true) },
    { label: t('compare.activities'),   value: actB ? t('compare.activitiesCount', { count: actB }) : '—', cls: cmp(actB, actA) },
    { label: t('compare.safety'),       value: safeB != null ? `${safeB}/5` : '—', cls: cmp(safeB, safeA) },
  ];

  return (
    <div className="compare-overlay">
      <div className="compare-header">
        <span className="compare-title">{t('compare.title')}</span>
        <button className="icon-btn" onClick={onClose}><X size={16} /></button>
      </div>
      <div className="compare-cols">
        <div className="compare-col">
          <div className="compare-col-title">{dataA?.destination?.city || '—'}</div>
          <div className="compare-stats">
            {statsA.map(s => (
              <div key={s.label} className={`compare-stat-row ${s.cls}`}>
                <span className="compare-stat-label">{s.label}</span>
                <span className="compare-stat-value">{s.value}</span>
              </div>
            ))}
          </div>
          <button className="btn-choose" onClick={() => onChoose('left')}>{t('compare.choose')}</button>
        </div>
        <div className="compare-divider" />
        <div className="compare-col">
          {!dataB && !compareLoading ? (
            <div className="compare-form">
              <input className="search-input" placeholder={t('search.destination')} value={compareDest}
                onChange={e => setCompareDest(e.target.value)} />
              <input type="date" className="date-input" value={compareDateDepart}
                onChange={e => setCompareDateDepart(e.target.value)} />
              <input type="date" className="date-input" value={compareDateRetour}
                onChange={e => setCompareDateRetour(e.target.value)} />
              <button className="btn-plan" onClick={onPlan} disabled={!compareDest.trim()}>{t('compare.plan')}</button>
            </div>
          ) : compareLoading ? (
            <div className="compare-loading"><Loader2 size={28} className="spin" /></div>
          ) : (
            <>
              <div className="compare-col-title">{dataB?.destination?.city || compareDest}</div>
              <div className="compare-stats">
                {statsB.map(s => (
                  <div key={s.label} className={`compare-stat-row ${s.cls}`}>
                    <span className="compare-stat-label">{s.label}</span>
                    <span className="compare-stat-value">{s.value}</span>
                  </div>
                ))}
              </div>
              <button className="btn-choose" onClick={() => onChoose('right')}>{t('compare.choose')}</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const toggleLang = () => {
    const next = lang === 'fr' ? 'en' : 'fr';
    i18n.changeLanguage(next);
    localStorage.setItem('lang', next);
    document.documentElement.lang = next;
  };
  const [dark,        setDark]        = useState(() => localStorage.getItem('theme') === 'dark');
  const [dest,        setDest]        = useState('');
  const [depCity,     setDepCity]     = useState('Paris (CDG)');
  const [dateDepart,  setDateDepart]  = useState('');
  const [dateRetour,  setDateRetour]  = useState('');
  const [data,        setData]        = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [toast,       setToast]       = useState(null);
  const [savedTrips,  setSavedTrips]  = useState(loadSavedTrips);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [checked,     setChecked]     = useState({});
  const [showModal,   setShowModal]   = useState(false);
  const [weatherIsLive, setWeatherIsLive] = useState(false);
  const [flightIsReal,  setFlightIsReal]  = useState(false);
  const [enrichingWeather, setEnrichingWeather] = useState(false);
  const [enrichingFlight, setEnrichingFlight] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [travelers, setTravelers] = useState('Solo');
  const [style, setStyle] = useState('Confort');
  const [pace, setPace] = useState('Chargé');
  const [maxBudget, setMaxBudget] = useState(5000);
  const [actualSpending, setActualSpending] = useState({});
  const [ratings, setRatings] = useState({});
  const [customActivities, setCustomActivities] = useState([]);
  const [deletedIndices, setDeletedIndices] = useState(new Set());
  const [dayActivityOrder, setDayActivityOrder] = useState({});
  const [customPackingItems, setCustomPackingItems] = useState({});
  const [viewMode, setViewMode] = useState('grid');
  const [chatOpen, setChatOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState(() => {
    if (!dest || !dateDepart) return [];
    try {
      const key = `chat_${dest.toLowerCase()}_${dateDepart}`;
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [chatLoading, setChatLoading] = useState(false);
  const [highlightedDay, setHighlightedDay] = useState(null);
  const gridRef = useRef(null);
  const isLoadingTripRef = useRef(false);

  // Multi-step mode state
  const [extraSteps,    setExtraSteps]    = useState([]);
  const [stepsData,     setStepsData]     = useState([]);
  const [stepsLoading,  setStepsLoading]  = useState([]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);

  // Computed derived values
  const activeData    = activeStepIdx === 0 ? data    : (stepsData[activeStepIdx - 1]    ?? null);
  const activeLoading = activeStepIdx === 0 ? loading : (stepsLoading[activeStepIdx - 1] ?? false);
  const multiMode     = extraSteps.length > 0;

  // SEO: update <title>, <meta description>, OG tags when trip is generated
  useDocumentTitle(activeData);

  // Compare mode state
  const [compareMode,       setCompareMode]       = useState(false);
  const [compareData,       setCompareData]       = useState(null);
  const [compareDest,       setCompareDest]       = useState('');
  const [compareDateDepart, setCompareDateDepart] = useState('');
  const [compareDateRetour, setCompareDateRetour] = useState('');
  const [compareLoading,    setCompareLoading]    = useState(false);

  // Helper functions for multi-step
  const addExtraStep = () => {
    if (extraSteps.length < 4) setExtraSteps(s => [...s, { dest: '', dateDepart: '', dateRetour: '' }]);
  };
  const removeExtraStep = (i) => {
    setExtraSteps(s => s.filter((_, j) => j !== i));
    setStepsData(s => s.filter((_, j) => j !== i));
    setStepsLoading(s => s.filter((_, j) => j !== i));
    setActiveStepIdx(a => a > i ? a - 1 : a === i ? 0 : a);
  };
  const updateExtraStep = (i, field, val) => setExtraSteps(s => s.map((x, j) => j === i ? { ...x, [field]: val } : x));

  // Compare mode
  const handleCompare = async () => {
    if (!compareDest.trim()) return;
    setCompareLoading(true);
    setCompareData(null);
    try {
      const depAirport = getCityAirportCode(depCity);
      const sysMsg = getSystemPrompt(lang).replace('"from": "CDG"', `"from": "${depAirport}"`);
      const userMessage = buildUserMessage(compareDest, compareDateDepart, compareDateRetour, depCity, { travelers, style, pace, maxBudget }, null, lang);
      const parsed = await generateTrip({
        systemPrompt: sysMsg,
        userMessage,
        userKey: keys.mistral || null,
      });
      parsed.preferences = { travelers, style, pace, maxBudget };
      setCompareData(parsed);
    } catch (e) {
      const { message } = classifyAiError(e, !!keys.mistral, t);
      showToast(message);
    } finally {
      setCompareLoading(false);
    }
  };

  const chooseDestination = (pick) => {
    if (pick === 'right' && compareData) {
      setData(compareData);
      setDest(compareData.destination?.city || compareDest);
    }
    setCompareMode(false);
    setCompareData(null);
    setCompareDest('');
    setCompareDateDepart('');
    setCompareDateRetour('');
  };

  // API keys (all in sessionStorage)
  const [keys, setKeys] = useState(() => ({
    mistral:       ssGet('mistral_key'),
    ow:            ssGet('ow_key'),
    amadeusId:     ssGet('amadeus_id'),
    amadeusSecret: ssGet('amadeus_secret'),
  }));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    const hash = window.location.hash.substring(1);
    if (!hash) return;
    const shared = decodeShareLink(hash);
    if (shared && shared.data) {
      setData(shared.data);
      setDest(shared.dest || '');
      setDateDepart(shared.dateDepart || '');
      setDateRetour(shared.dateRetour || '');
      showToast(t('toast.sharedRestored'));
      window.location.hash = '';
    }
  }, []);

  useEffect(() => {
    if (!isLoadingTripRef.current) {
      setChecked({});
    } else {
      isLoadingTripRef.current = false;
    }
  }, [activeData?.packingList]);

  useEffect(() => {
    if (activeData?.budget?.total && activeData.budget.total > maxBudget) {
      showToast(t('toast.budgetOver', { total: activeData.budget.total, max: maxBudget }));
    }
  }, [activeData?.budget?.total, maxBudget]);

  useEffect(() => {
    if (!dest || !dateDepart || chatMessages.length === 0) return;
    try {
      const key = `chat_${dest.toLowerCase()}_${dateDepart}`;
      const capped = chatMessages.slice(-50);
      localStorage.setItem(key, JSON.stringify(capped));
    } catch {}
  }, [chatMessages, dest, dateDepart]);

  useEffect(() => {
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const showToast = (msg) => setToast(msg);

  const saveAllKeys = (newKeys) => {
    setKeys(newKeys);
    ssSet('mistral_key',    newKeys.mistral);
    ssSet('ow_key',         newKeys.ow);
    ssSet('amadeus_id',     newKeys.amadeusId);
    ssSet('amadeus_secret', newKeys.amadeusSecret);
    setShowModal(false);
    showToast(t('toast.keysSaved'));
  };

  const handleToggle = (item) => setChecked(p => ({ ...p, [item]: !p[item] }));

  // ── SAVE / LOAD TRIPS ──────────────────────────────────────────────────────
  const handleSave = () => {
    if (!data?.destination?.city) return;
    const trip = {
      id: Date.now(),
      city: data.destination.city,
      country: data.destination.country || '',
      dateDepart,
      dateRetour,
      dates: data.destination.dates || '',
      data,
      stepsData,
      checked,
      actualSpending,
      ratings,
      customActivities,
      deletedIndices: Array.from(deletedIndices),
      dayActivityOrder,
      customPackingItems,
    };
    const updated = [trip, ...savedTrips.filter(t => !(t.city === trip.city && t.dateDepart === trip.dateDepart))];
    setSavedTrips(updated);
    localStorage.setItem('saved_trips', JSON.stringify(updated));
    showToast(t('toast.tripSaved'));
  };

  const handleLoadTrip = (trip) => {
    isLoadingTripRef.current = true;
    setData(trip.data);
    setDest(trip.city);
    setDateDepart(trip.dateDepart || '');
    setDateRetour(trip.dateRetour || '');
    if (trip.data?.destination?.dates) {
      const [d1, d2] = trip.data.destination.dates.split(' au ');
      if (d1) setDateDepart(d1);
      if (d2) setDateRetour(d2);
    }
    setStepsData(trip.stepsData || []);
    setChecked(trip.checked || {});
    setActualSpending(trip.actualSpending || {});
    setRatings(trip.ratings || {});
    setCustomActivities(trip.customActivities || []);
    setDeletedIndices(new Set(trip.deletedIndices || []));
    setDayActivityOrder(trip.dayActivityOrder || {});
    setCustomPackingItems(trip.customPackingItems || {});
    setWeatherIsLive(false);
    setFlightIsReal(false);
  };

  const handleDeleteTrip = (id) => {
    const updated = savedTrips.filter(t => t.id !== id);
    setSavedTrips(updated);
    localStorage.setItem('saved_trips', JSON.stringify(updated));
  };

  // ── BACKGROUND ENRICHMENT ──────────────────────────────────────────────────
  const enrichData = (parsed) => {
    // 1. OpenWeather
    if (keys.ow && parsed.destination?.city) {

      setEnrichingWeather(true);
      fetchRealWeather(parsed.destination.city, keys.ow)
        .then(w => { setData(d => d ? { ...d, weather: w } : d); setWeatherIsLive(true); setEnrichingWeather(false); })
        .catch((err) => { console.error('[enrichData] OpenWeather error:', err.message); showToast(t('toast.weatherUnavailable')); setEnrichingWeather(false); });
    } else {
    }

    // 2. Amadeus
    if (keys.amadeusId && keys.amadeusSecret && parsed.flight?.to && dateDepart) {
      const depAirport = getCityAirportCode(depCity);
      if (depAirport === 'CDG' && !CITY_AIRPORT_MAP[depCity.trim().toLowerCase()]) {
        showToast(t('toast.flightSearchFailed', { city: depCity }));
      } else {
        setEnrichingFlight(true);
        getAmadeusToken(keys.amadeusId, keys.amadeusSecret)
          .then(token => fetchRealFlight(parsed.flight.from || depAirport, parsed.flight.to, dateDepart, token))
          .then(fl => { setData(d => d ? { ...d, flight: fl } : d); setFlightIsReal(true); setEnrichingFlight(false); })
          .catch(() => { showToast(t('toast.flightUnavailable')); setEnrichingFlight(false); });
      }
    }
  };

  // ── MAIN API CALL ──────────────────────────────────────────────────────────
  const handlePlan = async (destOverride) => {

    const d = String(destOverride || dest || '').trim();
    if (!d) { showToast(t('toast.enterDest')); return; }
    if (dateDepart && dateRetour && dateRetour < dateDepart) { showToast(t('toast.dateError')); return; }

    setLoading(true);
    setData(null);
    setWeatherIsLive(false);
    setFlightIsReal(false);
    setSuggestions([]);
    setChatMessages([]);

    try {
      const depAirport = getCityAirportCode(depCity);
      const systemMsg = getSystemPrompt(lang).replace('"from": "CDG"', `"from": "${depAirport}"`);
      const userMessage = buildUserMessage(d, dateDepart, dateRetour, depCity, { travelers, style, pace, maxBudget }, null, lang);

      const parsed = await generateTrip({
        systemPrompt: systemMsg,
        userMessage,
        userKey: keys.mistral || null,
      });

      parsed.preferences = { travelers, style, pace, maxBudget };
      setData(parsed);

      // Non-blocking enrichment
      enrichData(parsed);

      // Non-blocking suggestions (skip in multi-mode)
      if (!multiMode) {
        getSuggestions({ destination: d, userKey: keys.mistral || null })
          .then(s => setSuggestions(s))
          .catch(() => {});
      }

      // Multi-step planning
      if (multiMode) {
        setStepsData(new Array(extraSteps.length).fill(null));
        setStepsLoading(new Array(extraSteps.length).fill(true));
        let prevCity = parsed.destination?.city || d;

        for (let i = 0; i < extraSteps.length; i++) {
          const step = extraSteps[i];
          if (!step.dest) { setStepsLoading(s => { const c = [...s]; c[i] = false; return c; }); continue; }
          try {
            const stepContext = { stepN: i + 2, total: extraSteps.length + 1, prevCity };
            const stepDepCity = prevCity;
            const stepDepAirport = getCityAirportCode(stepDepCity);
            const sysMsg = getSystemPrompt(lang).replace('"from": "CDG"', `"from": "${stepDepAirport}"`);
            const stepUserMessage = buildUserMessage(step.dest, step.dateDepart, step.dateRetour, stepDepCity, { travelers, style, pace, maxBudget }, stepContext, lang);

            const stepParsed = await generateTrip({
              systemPrompt: sysMsg,
              userMessage: stepUserMessage,
              userKey: keys.mistral || null,
            });
            stepParsed.preferences = { travelers, style, pace, maxBudget };
            setStepsData(s => { const c = [...s]; c[i] = stepParsed; return c; });
            prevCity = stepParsed.destination?.city || step.dest;
          } catch (err) {
            const { message } = classifyAiError(err, !!keys.mistral, t);
            showToast(t('toast.stepError', { n: i + 2, message }));
          } finally {
            setStepsLoading(s => { const c = [...s]; c[i] = false; return c; });
          }
        }
      }

    } catch (e) {
      console.error('[handlePlan] Error caught:', e);
      const { kind, message } = classifyAiError(e, !!keys.mistral, t);
      showToast(message);
      if (kind === 'invalid_key') setShowModal(true);
    } finally {
      setLoading(false);
    }
  };

  const handleExportIcal = () => {
    if (!data) { showToast(t('toast.dataMissing')); return; }
    try {
      if (!dateDepart || !dateRetour) throw new Error(t('toast.datesMissing'));

      const formatDateForIcal = (dateStr) => {
        if (!dateStr) return '';
        if (dateStr.includes('-')) return dateStr.replace(/-/g, '');
        return dateStr;
      };

      const startDate = formatDateForIcal(dateDepart);
      const endDate = formatDateForIcal(dateRetour);

      if (!startDate || !endDate) throw new Error('Format de date invalide');
      const now = new Date().toISOString().replace(/[-:.Z]/g, '');

      let ical = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Itinera//EN
CALSCALE:GREGORIAN
METHOD:PUBLISH
X-WR-CALNAME:Voyage à ${data.destination?.city || 'Destination'}
X-WR-TIMEZONE:UTC
`;

      // Séjour hôtel (événement multi-jours)
      if (data.hotel?.name) {
        ical += `BEGIN:VEVENT
UID:hotel-${Date.now()}@travelplanner
DTSTAMP:${now}
DTSTART;VALUE=DATE:${startDate}
DTEND;VALUE=DATE:${endDate}
SUMMARY:Hôtel: ${data.hotel.name}
DESCRIPTION:${data.hotel.address || ''} - ${data.hotel.pricePerNight}€/nuit
LOCATION:${data.hotel.address || data.destination?.city}
END:VEVENT
`;
      }

      // Vol aller
      if (data.flight?.airline && data.flight?.date) {
        const flightDate = data.flight.date.replace(/-/g, '');
        const [depH, depM] = (data.flight.departure || '10:00').split(':');
        const [arrH, arrM] = (data.flight.arrival || '14:00').split(':');
        ical += `BEGIN:VEVENT
UID:flight-depart-${Date.now()}@travelplanner
DTSTAMP:${now}
DTSTART:${flightDate}T${depH}${depM}00Z
DTEND:${flightDate}T${arrH}${arrM}00Z
SUMMARY:✈️ Vol ${data.flight.airline} ${data.flight.flightNumber || ''}
DESCRIPTION:${data.flight.from || 'CDG'} → ${data.flight.to}
LOCATION:Aéroport
END:VEVENT
`;
      }

      // Activités
      data.activities?.forEach((act, idx) => {
        if (!act.day || !act.time) return;
        try {
          const dayOffset = Math.max(0, (act.day || 1) - 1);
          const baseDate = new Date(startDate.substring(0, 4) + '-' + startDate.substring(4, 6) + '-' + startDate.substring(6, 8) + 'T00:00:00Z');
          const actDate = new Date(baseDate);
          actDate.setDate(actDate.getDate() + dayOffset);
          const actDateStr = actDate.toISOString().split('T')[0].replace(/-/g, '');
          const [h, m] = (act.time || '10:00').split(':');
          ical += `BEGIN:VEVENT
UID:activity-${idx}-${Date.now()}@travelplanner
DTSTAMP:${now}
DTSTART:${actDateStr}T${h}${m}00Z
DURATION:PT${parseInt((act.duration || '2h'), 10) || 2}H
SUMMARY:${act.emoji} ${act.name}
DESCRIPTION:${act.tag || 'Activité'} - ${act.description || ''}
LOCATION:${act.address || data.destination?.city}
END:VEVENT
`;
        } catch (e) {
          console.error('Activity iCal error:', e);
        }
      });

      ical += `END:VCALENDAR`;

      const blob = new Blob([ical], { type: 'text/calendar;charset=utf-8' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `voyage-${(data.destination?.city || 'voyage').toLowerCase().replace(/\s+/g, '-')}.ics`;
      link.click();
      URL.revokeObjectURL(link.href);
      showToast(t('toast.calendarExported'));
    } catch (err) {
      console.error(err);
      showToast(t('toast.calendarFailed'));
    }
  };

  const handleShare = async () => {
    if (!data) return;
    try {
      const container = document.createElement('div');
      container.style.cssText = 'position:fixed;left:-9999px;top:0;width:400px;height:600px';
      document.body.appendChild(container);

      const root = ReactDOM.createRoot(container);
      root.render(
        <ShareCard
          data={data}
          dest={dest}
          dateDepart={dateDepart}
          dateRetour={dateRetour}
          photoUrl={data.destination?.photoUrl}
        />
      );

      await new Promise(resolve => setTimeout(resolve, 1500));

      const canvas = await window.html2canvas(container.firstChild, { scale: 2, useCORS: true, logging: false });
      root.unmount();
      document.body.removeChild(container);

      const link = document.createElement('a');
      link.download = `voyage-${(data.destination?.city || dest).toLowerCase().replace(/\s+/g, '-')}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      showToast(t('toast.imageExported'));
    } catch (err) {
      console.error(err);
      showToast(t('toast.imageFailed'));
    }
  };

  const handleReset = () => {
    setData(null); setDest(''); setDepCity('Paris (CDG)'); setDateDepart(''); setDateRetour('');
    setWeatherIsLive(false); setFlightIsReal(false);
    setExtraSteps([]); setStepsData([]); setStepsLoading([]); setActiveStepIdx(0);
  };

  const handleRegenerateTrip = () => {
    if (!data?.destination?.city) return;
    showToast(t('toast.regenerating'));
    handlePlan(data.destination.city);
  };

  const handleSurpriseMe = async () => {
    try {
      const city = await surpriseMeCity({ style, maxBudget, depCity, userKey: keys.mistral || null });
      if (city) { setDest(city); handlePlan(city); }
      else showToast(t('toast.surpriseFailed'));
    } catch (e) {
      const { message, kind } = classifyAiError(e, !!keys.mistral, t);
      showToast(message);
      if (kind === 'invalid_key') setShowModal(true);
    }
  };

  const handleChatMessage = async (userMsg) => {
    if (!userMsg.trim()) return;
    setChatMessages(m => [...m, { role: 'user', content: userMsg }]);
    setChatLoading(true);
    try {
      const context = `Contexte du voyage: ${data?.destination?.city || 'N/A'}, ${data?.destination?.dates || 'N/A'}. Budget: ${data?.budget?.total || 'N/A'}€.`;
      const msgs = [...chatMessages, { role: 'user', content: `${context}\n\n${userMsg}` }].map(m => ({ role: m.role, content: m.content }));
      const reply = await chatAi({
        systemPrompt: t('chat.systemPrompt'),
        messages: msgs,
        userKey: keys.mistral || null,
      });
      setChatMessages(m => [...m, { role: 'assistant', content: reply || 'Erreur lors de la réponse' }]);
    } catch (e) {
      const { message } = classifyAiError(e, !!keys.mistral, t);
      showToast(message);
    } finally {
      setChatLoading(false);
    }
  };

  const handleInspirationSelect = (inspiration) => {
    const today = new Date();
    const departure = new Date(today);
    departure.setDate(departure.getDate() + 1);
    const returnDate = new Date(departure);
    returnDate.setDate(returnDate.getDate() + inspiration.days - 1);

    const depStr = departure.toISOString().split('T')[0];
    const retStr = returnDate.toISOString().split('T')[0];

    setDest(inspiration.destination);
    setDateDepart(depStr);
    setDateRetour(retStr);
    setTravelers(inspiration.travelers);
    setStyle(inspiration.style);
    setPace(inspiration.pace);

    setTimeout(() => handlePlan(inspiration.destination), 0);
  };

  // Computed timeline steps for multi-mode
  const timelineSteps = [
    { dest, data, loading },
    ...extraSteps.map((s, i) => ({ dest: s.dest, data: stepsData[i] ?? null, loading: stepsLoading[i] ?? false }))
  ];

  return (
    <div className={`app-shell ${sidebarOpen ? 'sidebar-open' : ''}`}>
      <Sidebar open={sidebarOpen} trips={savedTrips} onLoad={handleLoadTrip} onDelete={handleDeleteTrip} onClose={() => setSidebarOpen(false)} />

      <div className="main-content">
        {/* ── HEADER ── */}
        <header className="header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="icon-btn" title={t('header.myTrips')} aria-label={t('header.myTrips')} onClick={() => setSidebarOpen(o => !o)}>
              <Menu size={16} />
            </button>
            <h1 className="app-title">{t('app.title')} <span className="title-icon">✈️</span></h1>
          </div>
          <div className="header-right">
            {data && (
              <>
                <button className="icon-btn" title={viewMode === 'grid' ? t('header.timeline') : t('header.grid')} onClick={() => setViewMode(viewMode === 'grid' ? 'timeline' : 'grid')}>
                  {viewMode === 'grid' ? <LayoutList size={16} /> : <LayoutGrid size={16} />}
                </button>
                <button className="icon-btn" title={t('header.chat')} onClick={() => setChatOpen(o => !o)}>💬</button>
                <button className="icon-btn" title={t('header.regenerate')} onClick={handleRegenerateTrip}><Sparkles size={16} /></button>
                <button className="icon-btn" title={t('header.compare')} onClick={() => setCompareMode(true)}><Columns size={16} /></button>
                <button className="icon-btn" title={t('header.exportImage')} onClick={handleShare}>📷</button>
                <button className="icon-btn" title={t('header.exportCalendar')} onClick={handleExportIcal}>📅</button>
                <button className="icon-btn" title={t('header.save')} onClick={handleSave}><Bookmark size={16} /></button>
                <button className="icon-btn" title={t('header.reset')} onClick={handleReset}><RotateCcw size={16} /></button>
              </>
            )}
            <button className="icon-btn" title={t('header.settings')} aria-label={t('header.settings')} onClick={() => setShowModal(true)}>
              <Settings size={16} />
            </button>
            <button className="icon-btn" title={lang === 'fr' ? 'English' : 'Français'} onClick={toggleLang}>
              <Globe size={16} />
            </button>
            <button className="icon-btn" title={t('header.darkTheme')} aria-label={dark ? t('header.lightTheme') : t('header.darkTheme')} onClick={() => setDark(d => !d)}>
              {dark ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          </div>
        </header>

        {/* ── SEARCH ── */}
        <section className="search-section">
          <div className="search-bar">
            <input
              className="search-input"
              value={dest}
              onChange={e => setDest(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && !loading && handlePlan()}
              placeholder={t('search.placeholder')}
              disabled={loading}
            />
            <div className="search-divider" />
            <input
              className="search-input"
              value={depCity}
              onChange={e => setDepCity(e.target.value)}
              placeholder={t('search.departureCity')}
              disabled={loading}
              title={t('search.departureCity')}
            />
            <div className="search-divider" />
            <input type="date" className="date-input" value={dateDepart} onChange={e => setDateDepart(e.target.value)} disabled={loading} title={t('search.departureDate')} />
            <div className="search-divider" />
            <input type="date" className="date-input" value={dateRetour} onChange={e => setDateRetour(e.target.value)} disabled={loading} title={t('search.returnDate')} />
            {!loading && extraSteps.length < 4 && (
              <button className="btn-add-step" title={t('search.addStep')} onClick={addExtraStep}>
                <Plus size={14} />
              </button>
            )}
            <button className="btn-surprise" title={t('search.surprise')} onClick={handleSurpriseMe} disabled={loading}>
              🎲
            </button>
            <button className={`btn-plan${loading ? ' loading' : ''}`} onClick={() => handlePlan()} disabled={loading}>
              {loading ? <><Loader2 size={15} className="spin" />{t('search.planning')}</> : <><Sparkles size={15} />{t('search.plan')}</>}
            </button>
          </div>
          {extraSteps.map((step, i) => (
            <ExtraStepRow key={i} index={i} step={step}
              onChange={(field, val) => updateExtraStep(i, field, val)}
              onRemove={() => removeExtraStep(i)}
              disabled={loading || stepsLoading.some(Boolean)}
            />
          ))}
          {!keys.mistral && !data && (
            <p className="api-hint-optional" onClick={() => setShowModal(true)}>
              <Key size={12} style={{ marginRight: 4 }} />
              {t('search.apiHint')}
            </p>
          )}
          <ProgressBar data={activeData} checked={checked} />
        </section>

        {compareMode && data && (
          <CompareView
            dataA={data} dataB={compareData} compareLoading={compareLoading}
            compareDest={compareDest} setCompareDest={setCompareDest}
            compareDateDepart={compareDateDepart} setCompareDateDepart={setCompareDateDepart}
            compareDateRetour={compareDateRetour} setCompareDateRetour={setCompareDateRetour}
            onPlan={handleCompare}
            onChoose={chooseDestination}
            onClose={() => { setCompareMode(false); setCompareData(null); setCompareDest(''); setCompareDateDepart(''); setCompareDateRetour(''); }}
          />
        )}

        {/* ── PREFERENCES ── */}
        <PreferencesPanel travelers={travelers} setTravelers={setTravelers} style={style} setStyle={setStyle} pace={pace} setPace={setPace} maxBudget={maxBudget} setMaxBudget={setMaxBudget} />

        {/* ── HERO (empty state) ── */}
        {!data && !loading && (
          <section className="hero-empty">
            <h2 className="hero-title">{t('hero.title')}</h2>
            <p className="hero-sub">{t('hero.sub')}</p>
          </section>
        )}

        {/* ── INSPIRATIONS ── */}
        {!data && <InspirationCard onSelect={handleInspirationSelect} />}

        {/* ── STEP TIMELINE ── */}
        {multiMode && (data || loading) && (
          <StepTimeline steps={timelineSteps} activeIdx={activeStepIdx} onStepClick={setActiveStepIdx} />
        )}

        {/* ── BENTO GRID OR TIMELINE ── */}
        {viewMode === 'timeline' && activeData ? (
          <TimelineView data={activeData} destination={activeData?.destination?.city} />
        ) : (
          <main className="bento-grid" ref={gridRef}>
            <DestinationCard data={activeData} loading={activeLoading} />
            <WeatherCard     data={activeData} loading={activeLoading} isLive={weatherIsLive} enriching={enrichingWeather} />
            <FlightCard      data={activeData} loading={activeLoading} isReal={flightIsReal} enriching={enrichingFlight} />
            <HotelCard       data={activeData} loading={activeLoading} />
            <PracticalInfoCard data={activeData} loading={activeLoading} />
            <ActivitiesCard  data={activeData} loading={activeLoading} onDayClick={setHighlightedDay} ratings={ratings} setRatings={setRatings} customActivities={customActivities} setCustomActivities={setCustomActivities} deletedIndices={deletedIndices} setDeletedIndices={setDeletedIndices} dayActivityOrder={dayActivityOrder} setDayActivityOrder={setDayActivityOrder} />
            <BudgetCard      data={activeData} loading={activeLoading} highlightedDay={highlightedDay} isOver={activeData?.budget?.total > maxBudget} travelers={travelers} actualSpending={actualSpending} setActualSpending={setActualSpending} />
            <PackingListCard   data={activeData} loading={activeLoading} checked={checked} onToggle={handleToggle} customPackingItems={customPackingItems} setCustomPackingItems={setCustomPackingItems} />
            <NotesCard       data={activeData} loading={activeLoading} onChange={notes => {
              if (activeStepIdx === 0) setData(p => p ? { ...p, notes } : p);
              else setStepsData(s => { const c = [...s]; if (c[activeStepIdx - 1]) c[activeStepIdx - 1] = { ...c[activeStepIdx - 1], notes }; return c; });
            }} />
            {activeData && (
              <MapCard data={activeData} dark={dark}
                allStepsData={multiMode ? [data, ...stepsData].filter(Boolean) : []}
              />
            )}
          </main>
        )}
        <SuggestionsBar suggestions={suggestions} onSelect={(city) => { setDest(city); handlePlan(city); }} />
      </div>

      {chatOpen && <ChatPanel messages={chatMessages} loading={chatLoading} onSendMessage={handleChatMessage} onClose={() => setChatOpen(false)} open={chatOpen} />}
      {toast      && <Toast message={toast} onClose={() => setToast(null)} />}
      {showModal  && <SettingsModal keys={keys} onSave={saveAllKeys} onClose={() => setShowModal(false)} />}
    </div>
  );
}
