import React, { useState, useEffect, useRef } from 'react';
import {
  Sun, Cloud, CloudRain, CloudSnow, Plane, Building2, MapPin,
  Wallet, CheckSquare2, FileText, Moon, RotateCcw, Sparkles,
  Loader2, X, Star, Clock, Key, ChevronRight,
  Bookmark, Trash2, Menu, Settings, Download, Plus, Columns,
} from 'lucide-react';

// ─── CONSTANTS ────────────────────────────────────────────────────────────────

const MISTRAL_API_URL = 'https://api.mistral.ai/v1/chat/completions';
const OW_API_URL      = 'https://api.openweathermap.org/data/2.5/forecast';
const AMADEUS_TOKEN   = 'https://test.api.amadeus.com/v1/security/oauth2/token';
const AMADEUS_FLIGHTS = 'https://test.api.amadeus.com/v2/shopping/flight-offers';
const EXCHANGE_URL    = 'https://open.er-api.com/v6/latest/EUR';

const CURRENCIES       = ['EUR', 'USD', 'GBP', 'JPY', 'THB', 'MAD', 'AED', 'CHF', 'CAD'];
const CURRENCY_SYMBOLS = { EUR: '€', USD: '$', GBP: '£', JPY: '¥', THB: '฿', MAD: 'DH', AED: 'AED', CHF: 'Fr', CAD: 'C$' };

const SYSTEM_PROMPT = `Tu es un expert en voyage. Réponds UNIQUEMENT en JSON valide (pas de markdown, pas de backticks) avec cette structure exacte :
{
  "destination": { "city": "", "country": "", "dates": "Ex: 15-22 Mars 2026" },
  "weather": { "temp": "22°C", "condition": "Ensoleillé", "forecast": [{"day": "Lun", "temp": 18}, {"day": "Mar", "temp": 20}, {"day": "Mer", "temp": 22}, {"day": "Jeu", "temp": 21}, {"day": "Ven", "temp": 19}] },
  "flight": { "airline": "", "departure": "10:30", "arrival": "14:45", "flightNumber": "", "date": "2026-03-15", "from": "CDG", "to": "" },
  "hotel": { "name": "", "stars": 4, "address": "", "checkIn": "", "checkOut": "", "pricePerNight": 120, "lat": 0.0, "lng": 0.0 },
  "activities": [{ "day": 1, "emoji": "", "name": "", "time": "", "tag": "culture", "description": "", "duration": "2h", "price": "15€", "address": "", "lat": 0.0, "lng": 0.0 }],
  "budget": { "total": 1500, "perDay": [{ "day": 1, "housing": 0, "food": 0, "transport": 0, "activities": 0 }], "summary": { "housing": 0, "food": 0, "transport": 0, "activities": 0, "other": 0 } },
  "packingList": { "essentials": ["Passeport", "Carte bancaire", "Assurance voyage"], "clothes": ["T-shirts légers", "Short", "Maillot de bain"], "gear": ["Crème solaire SPF50", "Adaptateur prise", "Gourde"], "health": ["Médicaments perso", "Anti-moustiques"] },
  "practicalInfo": { "visa": "", "vaccines": "", "plug": "", "currency": "", "timezone": "", "safety": "", "safetyLevel": 3, "warnings": "" },
  "notes": "",
  "transport": { "mode": "avion", "duration": "3h30", "price": "250€", "from": "Paris", "to": "Tokyo" }
}
Les tags doivent être exactement "culture", "food" ou "nature". Adapte la météo à la saison des dates fournies. Considère les préférences utilisateur (nombre de voyageurs, style, rythme, budget) pour adapter le contenu. Les catégories de packingList doivent être adaptées à la destination ET la saison (hiver = manteau, tropique = anti-moustiques, etc). Pour le budget, fournis une répartition détaillée par jour (housing, food, transport, activities) dans perDay et un résumé par catégorie dans summary. Pour l'étape 1 (voyage direct), transport doit être null. Pour les étapes suivantes, renseigne le transport depuis la ville précédente.`;

const BUDGET_COLORS = { housing: '#8B5CF6', food: '#EC4899', transport: '#10B981', activities: '#F59E0B', other: '#6B7280' };
const BUDGET_LABELS = { housing: 'Logement', food: 'Nourriture', transport: 'Transport', activities: 'Activités', other: 'Autre' };
const TAG_STYLES    = {
  culture:       { bg: 'rgba(59,130,246,0.12)',  color: '#3B82F6' },
  food:          { bg: 'rgba(245,158,11,0.12)',  color: '#D97706' },
  nature:        { bg: 'rgba(16,185,129,0.12)',  color: '#059669' },
  divertissement: { bg: 'rgba(168,85,247,0.12)',  color: '#A855F7' },
};

// ─── UTILS ────────────────────────────────────────────────────────────────────

function fmtDate(iso) {
  if (!iso) return '';
  return new Date(iso + 'T00:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

function daysBetween(d1, d2) {
  if (!d1 || !d2) return null;
  return Math.max(1, Math.ceil((new Date(d2 + 'T00:00:00') - new Date(d1 + 'T00:00:00')) / 86400000));
}

const CITY_AIRPORT_MAP = {
  'paris': 'CDG', 'paris cdg': 'CDG', 'paris (cdg)': 'CDG', 'charles de gaulle': 'CDG',
  'lyon': 'LYS', 'marseille': 'MRS', 'nice': 'NCE', 'toulouse': 'TLS', 'bordeaux': 'BOD',
  'nantes': 'NTE', 'lille': 'LIL', 'strasbourg': 'SXB', 'geneva': 'GVA', 'zurich': 'ZRH',
  'london': 'LHR', 'berlin': 'BER', 'amsterdam': 'AMS', 'barcelona': 'BCN', 'madrid': 'MAD',
  'maldives': 'MLE', 'cusco': 'CUZ', 'marrakech': 'RAK', 'dubai': 'DXB', 'new york': 'JFK', 'lisbon': 'LIS', 'lisbonne': 'LIS',
  'rome': 'FCO', 'milano': 'MXP', 'milan': 'MXP', 'venice': 'VCE', 'vienna': 'VIE',
  'prague': 'PRG', 'budapest': 'BUD', 'warsaw': 'WAW', 'lisbon': 'LIS', 'porto': 'OPO',
  'dublin': 'DUB', 'bangkok': 'BKK', 'tokyo': 'NRT', 'new york': 'JFK', 'los angeles': 'LAX',
};

function getCityAirportCode(cityInput) {
  if (!cityInput) return 'CDG';
  const normalized = cityInput.trim().toLowerCase();
  return CITY_AIRPORT_MAP[normalized] || 'CDG';
}

function buildUserMessage(dest, dateDepart, dateRetour, depCity = 'Paris (CDG)', prefs = {}, stepContext = null) {
  const { travelers = 'Solo', style = 'Confort', pace = 'Chargé', maxBudget = 5000 } = prefs;
  let msg = `Planifie un voyage à ${dest} au départ de ${depCity}`;
  if (dateDepart && dateRetour) {
    const days = daysBetween(dateDepart, dateRetour);
    msg += ` du ${fmtDate(dateDepart)} au ${fmtDate(dateRetour)}. Génère ${days * 2} à ${days * 3} activités réparties sur ${days} jours (champ "day" de 1 à ${days}), et les dates de check-in/check-out correspondent aux dates du voyage.`;
  } else {
    msg += `. Génère 5-6 activités variées avec le champ "day" à 1.`;
  }
  msg += ` Préférences: ${travelers} voyageur(s), style ${style}, rythme ${pace}, budget max ${maxBudget}€.`;
  if (stepContext) msg = `Étape ${stepContext.stepN}/${stepContext.total} du voyage. L'utilisateur vient de ${stepContext.prevCity}. ` + msg;
  return msg;
}

function loadSavedTrips() {
  try { return JSON.parse(localStorage.getItem('saved_trips') || '[]'); }
  catch { return []; }
}

function ssGet(key) { return sessionStorage.getItem(key) || ''; }
function ssSet(key, val) { sessionStorage.setItem(key, val); }

// ─── EXTERNAL API HELPERS ─────────────────────────────────────────────────────

async function fetchRealWeather(city, apiKey) {
  const url = `${OW_API_URL}?q=${encodeURIComponent(city)}&units=metric&lang=fr&cnt=40&appid=${apiKey}`;
  console.log('[fetchRealWeather] Calling OpenWeather', { city, url: url.replace(apiKey, '***') });
  const res  = await fetch(url);
  console.log('[fetchRealWeather] Response status:', res.status);
  if (!res.ok) throw new Error(`OpenWeather ${res.status}`);
  const json = await res.json();
  console.log('[fetchRealWeather] Data received:', { temp: json.list[0]?.main?.temp, condition: json.list[0]?.weather[0]?.description });

  const temp      = Math.round(json.list[0].main.temp);
  const condition = json.list[0].weather[0].description;

  // Pick noon reading per day for forecast
  const dayMap = {};
  for (const item of json.list) {
    const [date, time] = item.dt_txt.split(' ');
    if (!dayMap[date] || time === '12:00:00') dayMap[date] = Math.round(item.main.temp);
  }
  const forecast = Object.values(dayMap).slice(0, 5);
  console.log("[fetchRealWeather] Forecast details:", forecast);

  return { temp: `${temp}°C`, condition, forecast };
}

async function getAmadeusToken(clientId, clientSecret) {
  const res = await fetch(AMADEUS_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: clientId, client_secret: clientSecret }),
  });
  if (!res.ok) throw new Error(`Amadeus auth ${res.status}`);
  const json = await res.json();
  return json.access_token;
}

async function fetchRealFlight(iataFrom, iataTo, departureDate, token) {
  const params = new URLSearchParams({
    originLocationCode:      iataFrom || 'CDG',
    destinationLocationCode: iataTo,
    departureDate,
    adults: '1',
    max:    '1',
    currencyCode: 'EUR',
  });
  const res = await fetch(`${AMADEUS_FLIGHTS}?${params}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Amadeus flights ${res.status}`);
  const json   = await res.json();
  const offer  = json.data?.[0];
  if (!offer)  throw new Error('Aucun vol trouvé');

  const seg         = offer.itineraries[0].segments[0];
  const carrierCode = offer.validatingAirlineCodes?.[0] || seg.carrierCode;
  const airlineName = json.dictionaries?.carriers?.[carrierCode] || carrierCode;

  return {
    airline:      airlineName,
    departure:    seg.departure.at.slice(11, 16),
    arrival:      seg.arrival.at.slice(11, 16),
    flightNumber: `${seg.carrierCode}${seg.number}`,
    from:         seg.departure.iataCode,
    to:           seg.arrival.iataCode,
    price:        offer.price?.grandTotal ? `${Math.round(offer.price.grandTotal)}€` : null,
  };
}

async function fetchExchangeRates() {
  const res = await fetch(EXCHANGE_URL);
  if (!res.ok) throw new Error('Exchange rates unavailable');
  const json = await res.json();
  return json.rates;
}

async function fetchSuggestions(destination, apiKey) {
  const res = await fetch(MISTRAL_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [{ role: 'user', content: `Suggère 3 destinations similaires à ${destination}. Réponds UNIQUEMENT en JSON: { "suggestions": [{ "city": "", "country": "", "emoji": "", "reason": "" }] }. Reason max 10 mots.` }],
      temperature: 0.8,
      response_format: { type: 'json_object' },
    }),
  });
  const json = await res.json();
  const raw = json.choices?.[0]?.message?.content || '{}';
  const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  return JSON.parse(cleaned).suggestions || [];
}

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

function RealBadge({ label = 'Vrai vol' }) {
  return <div className="real-badge">{label} ✓</div>;
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
        <span className="progress-label">Voyage prêt à {pct}%</span>
        <span className="progress-steps">{done}/{total} étapes</span>
      </div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── SIDEBAR ──────────────────────────────────────────────────────────────────

function Sidebar({ open, trips, onLoad, onDelete, onClose }) {
  return (
    <>
      {open && <div className="sidebar-backdrop" onClick={onClose} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="sidebar-header">
          <span className="sidebar-title">Mes voyages</span>
          <button className="sidebar-close icon-btn" onClick={onClose}><X size={16} /></button>
        </div>
        {trips.length === 0 ? (
          <div className="sidebar-empty">
            <Bookmark size={28} color="var(--text-sec)" style={{ opacity: 0.4 }} />
            <p>Aucun voyage sauvegardé</p>
          </div>
        ) : (
          <ul className="sidebar-list">
            {trips.map(trip => (
              <li key={trip.id} className="sidebar-item" onClick={() => { onLoad(trip); onClose(); }}>
                <div className="sidebar-item-info">
                  <span className="sidebar-city">{trip.city}</span>
                  <span className="sidebar-dates">{trip.dates}</span>
                </div>
                <button className="sidebar-delete" title="Supprimer"
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

// ─── DESTINATION CARD ─────────────────────────────────────────────────────────

function DestinationCard({ data, loading }) {
  const city    = data?.destination?.city;
  const getSeed = (str) => str.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % 1000;
  const bgStyle = city
    ? {
        backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.08) 0%, rgba(0,0,0,0.62) 100%),
          url(https://picsum.photos/seed/${getSeed(city)}/800/600)`,
        backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat',
      }
    : { background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' };

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
        </div>
      ) : (
        <div className="dest-placeholder">
          <Plane size={52} color="rgba(255,255,255,0.25)" />
          <p>Votre prochaine destination…</p>
        </div>
      )}
    </div>
  );
}

// ─── WEATHER CARD ─────────────────────────────────────────────────────────────

function WeatherCard({ data, loading, isLive }) {
  const w    = data?.weather;
  const maxT = w?.forecast?.length ? Math.max(...w.forecast.map(f => f.temp || f)) : 1;

  return (
    <div className="bento-card fade-in" style={{ animationDelay: '60ms' }}>
      <div className="card-label-row">
        <div className="card-label">Météo</div>
        {isLive && <LiveBadge />}
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
              const temp = f.temp || f;
              const day = f.day || '';
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
        <div className="card-empty"><Sun size={30} color="var(--text-sec)" /><span>Météo</span></div>
      )}
    </div>
  );
}

// ─── FLIGHT CARD ──────────────────────────────────────────────────────────────

function FlightCard({ data, loading, isReal }) {
  const fl = data?.flight;

  return (
    <div className="bento-card fade-in" style={{ animationDelay: '120ms' }}>
      <div className="card-label-row">
        <div className="card-label">Vol</div>
        {isReal && <RealBadge />}
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
          {fl.date && <div style={{fontSize: '12px', color: 'var(--text-sec)', marginBottom: '8px'}}>{fmtDate(fl.date)}</div>}
          <div className="fl-route">
            <div className="fl-point">
              <div className="fl-time">{fl.departure}</div>
              <div className="fl-code">{fl.from}</div>
            </div>
            <div className="fl-line"><Plane size={13} className="fl-plane-icon" /></div>
            <div className="fl-point" style={{ textAlign: 'right' }}>
              <div className="fl-time">{fl.arrival}</div>
              <div className="fl-code">{fl.to}</div>
            </div>
          </div>
        </>
      ) : (
        <div className="card-empty"><Plane size={30} color="var(--text-sec)" /><span>Informations vol</span></div>
      )}
    </div>
  );
}

// ─── HOTEL CARD ───────────────────────────────────────────────────────────────

function HotelCard({ data, loading }) {
  const h = data?.hotel;

  return (
    <div className="bento-card hotel-card fade-in" style={{ animationDelay: '180ms' }}>
      <div className="card-label">Hôtel</div>
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
              <div className="date-lbl">Check-in</div>
              <div className="date-val">{h.checkIn}</div>
            </div>
            <div className="hotel-price-box">
              <div className="hotel-price">{h.pricePerNight}€</div>
              <div className="per-night">/ nuit</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div className="date-lbl">Check-out</div>
              <div className="date-val">{h.checkOut}</div>
            </div>
          </div>
          {h.checkIn && h.checkOut && (() => {
            const nights = daysBetween(h.checkIn, h.checkOut);
            return nights > 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-sec)', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <div>{nights} nuit{nights > 1 ? 's' : ''} · {h.pricePerNight * nights}€ total</div>
              </div>
            ) : null;
          })()}
        </div>
      ) : (
        <div className="card-empty"><Building2 size={30} color="var(--text-sec)" /><span>Réservation hôtel</span></div>
      )}
    </div>
  );
}

// ─── PRACTICAL INFO CARD ───────────────────────────────────────────────────────

function PracticalInfoCard({ data, loading }) {
  const info = data?.practicalInfo;
  const [expanded, setExpanded] = useState(null);

  const items = [
    { key: 'visa', icon: '🛂', label: 'Visa', value: info?.visa },
    { key: 'vaccines', icon: '💉', label: 'Vaccins', value: info?.vaccines },
    { key: 'plug', icon: '🔌', label: 'Prise', value: info?.plug },
    { key: 'currency', icon: '💱', label: 'Monnaie', value: info?.currency },
    { key: 'timezone', icon: '🕐', label: 'Décalage', value: info?.timezone },
    { key: 'safety', icon: '🛡️', label: 'Sécurité', value: info?.safety },
  ];

  const getSafetyColor = (level) => {
    if (level <= 2) return '#EF4444';
    if (level === 3) return '#F59E0B';
    return '#10B981';
  };

  if (loading) {
    return (
      <div className="bento-card practical-card fade-in" style={{ animationDelay: '240ms' }}>
        <div className="card-label">Infos Pratiques</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {[1, 2, 3].map(i => <Skeleton key={i} w="80px" h="60px" r="8px" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="bento-card practical-card fade-in" style={{ animationDelay: '240ms' }}>
      <div className="card-label">Infos Pratiques</div>
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
        <div className="card-empty"><FileText size={30} color="var(--text-sec)" /><span>Infos pratiques</span></div>
      )}
    </div>
  );
}

// ─── ACTIVITIES CARD ──────────────────────────────────────────────────────────

function ActivitiesCard({ data, loading, onDayClick }) {
  const acts   = data?.activities || [];
  const days   = [...new Set(acts.map(a => a.day || 1))].sort((a, b) => a - b);
  const [activeDay, setActiveDay] = useState(1);
  const [fading, setFading]       = useState(false);
  const [activeFilter, setActiveFilter] = useState('All');
  const [selectedActivity, setSelectedActivity] = useState(null);
  const [deletedIndices, setDeletedIndices] = useState(new Set());
  const [regenerating, setRegenerating] = useState(null);
  const [customActivities, setCustomActivities] = useState([]);
  const [ratings, setRatings] = useState({});
  const [addingDay, setAddingDay] = useState(null);
  const [formData, setFormData] = useState({ name: '', time: '', tag: 'culture' });
  const [dayActivityOrder, setDayActivityOrder] = useState({});
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
      const mistralKey = sessionStorage.getItem('mistral_key') || '';
      if (!mistralKey) { alert('Clé Mistral non configurée'); return; }
      const msg = `Génère UNE SEULE nouvelle activité (JSON) pour le jour ${act.day} au créneau "${act.time}", tag "${act.tag}", style similaire à: ${act.name}. Réponds UNIQUEMENT avec: { "emoji": "", "name": "", "time": "", "tag": "", "description": "", "duration": "", "price": "", "address": "" }`;
      const res = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${mistralKey}` },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [{ role: 'user', content: msg }],
          temperature: 0.7,
        }),
      });
      const json = await res.json();
      const raw = json.choices?.[0]?.message?.content || '{}';
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const newAct = JSON.parse(cleaned);
      newAct.day = act.day;
      setCustomActivities(p => [...p, newAct]);
      setDeletedIndices(new Set([...deletedIndices].filter(i => i !== acts.indexOf(act))));
    } catch (e) {
      console.error('Regenerate failed:', e);
    } finally {
      setRegenerating(null);
    }
  };

  const handleAddActivity = () => {
    if (!formData.name.trim() || !formData.time.trim()) return;
    setCustomActivities(p => [...p, { ...formData, day: activeDay, emoji: '✏️' }]);
    setFormData({ name: '', time: '', tag: 'culture' });
    setAddingDay(null);
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

  const handleDragOver = (e, idx) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(idx);
  };

  const handleDrop = (e, dropIdx) => {
    e.preventDefault();
    if (!draggedId) return;
    const allItems = getAllActivityItemsForDay();
    const dragIdx = allItems.findIndex(item => item.id === draggedId);
    if (dragIdx === -1 || dragIdx === dropIdx) {
      setDraggedId(null);
      setDragOverIndex(null);
      return;
    }
    const newOrder = allItems.map(item => item.id);
    const [dragged] = newOrder.splice(dragIdx, 1);
    newOrder.splice(dropIdx > dragIdx ? dropIdx - 1 : dropIdx, 0, dragged);
    setDayActivityOrder(p => ({ ...p, [activeDay]: newOrder }));
    setDraggedId(null);
    setDragOverIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedId(null);
    setDragOverIndex(null);
  };

  const allActivityItems = getAllActivityItemsForDay();
  const filtered = allActivityItems
    .map(item => item.act)
    .filter((a, idx) => !deletedIndices.has(idx) && (a.day || 1) === activeDay)
    .filter(a => {
      if (activeFilter === 'All') return true;
      const tagMap = { culture: 'Culture', food: 'Food', nature: 'Nature', divertissement: 'Divertissement' };
      return tagMap[a.tag] === activeFilter;
    });

  const tags = ['All', 'Culture', 'Food', 'Nature', 'Divertissement'];
  const deletedActs = acts.filter((a, idx) => deletedIndices.has(idx) && (a.day || 1) === activeDay);

  return (
    <>
      <div className="bento-card acts-card fade-in" style={{ animationDelay: '240ms' }}>
        <div className="card-label">Activités</div>
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
            {tags.map(tag => (
              <button
                key={tag}
                className={`act-filter-pill ${tag === activeFilter ? 'active' : ''}`}
                onClick={() => setActiveFilter(tag)}
              >
                {tag}
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
            {filtered.map((act, i) => {
              const tagKey = (act.tag || '').toLowerCase();
              const ts     = TAG_STYLES[tagKey] || TAG_STYLES.culture;
              const actKey = `${act.day}-${act.name}`;
              const rating = ratings[actKey] || 0;
              const actType = getActivityType(act);
              const id = actType ? makeActivityId(actType.type, actType.index) : null;
              const isBeingDragged = draggedId === id;
              return (
                <div
                  key={id}
                  draggable
                  onDragStart={(e) => handleDragStart(e, id)}
                  onDragOver={(e) => handleDragOver(e, i)}
                  onDrop={(e) => handleDrop(e, i)}
                  onDragEnd={handleDragEnd}
                  className="act-item-wrap"
                  style={{
                    animationDelay: `${i * 60}ms`,
                    opacity: isBeingDragged ? 0.5 : 1,
                    borderTop: dragOverIndex === i ? '2px dashed var(--accent)' : 'none',
                    transition: 'all 0.2s ease'
                  }}
                >
                  <div className="act-item" style={{ cursor: 'pointer' }} onClick={() => setSelectedActivity(act)}>
                    <div className="act-emoji">{act.emoji}</div>
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
                    title="Supprimer"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
            {deletedActs.map((act, i) => (
              <div key={`regen-${i}`} className="act-regenerate fade-in" style={{ animationDelay: `${filtered.length * 60 + i * 60}ms` }}>
                {regenerating === `${act.day}-${act.name}` ? (
                  <Loader2 size={16} className="spin" />
                ) : (
                  <button onClick={() => handleRegenerate(act)} className="regen-btn">
                    <RotateCcw size={14} />
                    Regénérer
                  </button>
                )}
              </div>
            ))}
            {addingDay === activeDay ? (
              <div className="act-form fade-in">
                <input
                  type="text"
                  placeholder="Nom de l'activité"
                  value={formData.name}
                  onChange={e => setFormData(p => ({ ...p, name: e.target.value }))}
                  className="form-input"
                />
                <input
                  type="text"
                  placeholder="Horaire (ex: 14:00)"
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
                  <button onClick={handleAddActivity} className="btn-primary">Ajouter</button>
                  <button onClick={() => setAddingDay(null)} className="btn-secondary">Annuler</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAddingDay(activeDay)} className="act-add-btn">
                <Plus size={14} />
              </button>
            )}
          </div>
        ) : (
          <div className="card-empty"><MapPin size={30} color="var(--text-sec)" /><span>Activités planifiées</span></div>
        )}
      </div>
      {selectedActivity && (
        <div className="act-modal-overlay" onClick={() => setSelectedActivity(null)}>
          <div className="activity-modal" onClick={e => e.stopPropagation()}>
            <button className="act-modal-close" onClick={() => setSelectedActivity(null)}>
              <X size={18} />
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
                  <div className="modal-section-title">Description</div>
                  <p>{selectedActivity.description}</p>
                </div>
              )}
              {selectedActivity.duration && (
                <div className="modal-section">
                  <div className="modal-section-title">Durée</div>
                  <p>{selectedActivity.duration}</p>
                </div>
              )}
              {selectedActivity.price && (
                <div className="modal-section">
                  <div className="modal-section-title">Prix estimé</div>
                  <p>{selectedActivity.price}</p>
                </div>
              )}
              {selectedActivity.address && (
                <div className="modal-section">
                  <div className="modal-section-title">Adresse</div>
                  <p>{selectedActivity.address}</p>
                </div>
              )}
              {selectedActivity.time && (
                <div className="modal-section">
                  <div className="modal-section-title">Horaire</div>
                  <p>{selectedActivity.time}</p>
                </div>
              )}
              {selectedActivity.tag && (
                <div className="modal-section">
                  <div className="modal-section-title">Catégorie</div>
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

function BudgetCard({ data, loading, highlightedDay = null }) {
  const [currency, setCurrency] = useState('EUR');
  const [rates,    setRates]    = useState(null);

  const bud        = data?.budget;
  const summary    = bud?.summary || {};
  const totalSpent = Object.values(summary).reduce((a, b) => a + b, 0);
  const rate       = (currency !== 'EUR' && rates?.[currency]) ? rates[currency] : 1;
  const sym        = CURRENCY_SYMBOLS[currency] || currency;
  const conv       = (v) => currency === 'EUR' ? v : Math.round(v * rate);

  const handleCurrencyChange = async (e) => {
    const c = e.target.value;
    setCurrency(c);
    if (c !== 'EUR' && !rates) {
      try { setRates(await fetchExchangeRates()); }
      catch { /* silently ignore — amounts stay in EUR */ }
    }
  };

  return (
    <div className="bento-card fade-in" style={{ animationDelay: '300ms' }}>
      <div className="card-label-row">
        <div className="card-label">Budget</div>
        {bud?.total && (
          <select className="currency-select" value={currency} onChange={handleCurrencyChange}>
            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
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
                <div className="budget-of">estimé</div>
                <div style={{fontSize: '11px', color: 'var(--text-sec)', marginTop: '4px'}}>Budget max: {conv(bud.total)}{sym}</div>
              </div>
            </div>
            <div className="budget-legend">
              {Object.entries(summary).filter(([, v]) => v > 0).map(([k, v]) => (
                <div key={k} className="legend-row">
                  <div className="legend-dot" style={{ background: BUDGET_COLORS[k] }} />
                  <span className="legend-lbl">{BUDGET_LABELS[k]}</span>
                  <span className="legend-val">{conv(v)}{sym}</span>
                </div>
              ))}
              {currency !== 'EUR' && rates?.[currency] && (
                <div className="rate-info">1 EUR = {rates[currency].toFixed(2)} {currency}</div>
              )}
            </div>
          </div>
          {bud?.perDay && bud.perDay.length > 0 && (
            <div className="budget-daily-wrap">
              <div className="daily-header">Dépenses par jour</div>
              <div className="daily-table">
                <table>
                  <thead>
                    <tr>
                      <th>Jour</th>
                      <th>Logement</th>
                      <th>Nourriture</th>
                      <th>Transport</th>
                      <th>Activités</th>
                      <th>Total</th>
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
        <div className="card-empty"><Wallet size={30} color="var(--text-sec)" /><span>Suivi budget</span></div>
      )}
    </div>
  );
}

// ─── PACKING LIST CARD ────────────────────────────────────────────────────────────

function PackingListCard({ data, loading, checked, onToggle }) {
  const packingList = data?.packingList || {};
  const [expanded, setExpanded] = useState({ essentials: true, clothes: true, gear: true, health: true });
  const keyRef = useRef('');
  useEffect(() => { keyRef.current = JSON.stringify(packingList); }, [packingList]);

  const allItems = Object.values(packingList).flat();
  const packedCount = allItems.filter(item => !!checked[item]).length;
  const totalCount = allItems.length;

  const categories = [
    { key: 'essentials', label: '✋ Essentiels', icon: '🛂' },
    { key: 'clothes', label: '👕 Vêtements', icon: '👔' },
    { key: 'gear', label: '🎒 Équipement', icon: '⚙️' },
    { key: 'health', label: '💊 Santé', icon: '🏥' },
  ];

  const toggleCategory = (key) => {
    setExpanded(p => ({ ...p, [key]: !p[key] }));
  };

  return (
    <div className="bento-card fade-in" style={{ animationDelay: '360ms' }}>
      <div className="card-label"><CheckSquare2 size={13} style={{ marginRight: 5 }} />Packing List</div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[1,2,3,4,5].map(i => <Skeleton key={i} h="18px" w={`${50 + i * 8}%`} />)}
        </div>
      ) : totalCount > 0 ? (
        <>
          <div className="packing-counter">{packedCount}/{totalCount} items prêts</div>
          <div className="packing-categories">
            {categories.map(({ key, label, icon }) => {
              const items = packingList[key] || [];
              if (items.length === 0) return null;
              return (
                <div key={key} className="packing-category">
                  <button className="category-header" onClick={() => toggleCategory(key)}>
                    <span className="cat-icon">{icon}</span>
                    <span className="cat-label">{label}</span>
                    <span className="cat-count">{items.filter(i => !!checked[i]).length}/{items.length}</span>
                    <ChevronRight size={14} className={`chevron ${expanded[key] ? 'open' : ''}`} />
                  </button>
                  {expanded[key] && (
                    <div className="category-items">
                      {items.map((item, i) => {
                        const on = !!checked[item];
                        return (
                          <button key={i} className={`check-item ${on ? 'done' : ''}`} onClick={() => onToggle(item)}>
                            <div className={`checkbox ${on ? 'checked' : ''}`}>{on && <span>✓</span>}</div>
                            <span className="check-txt">{item}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <div className="card-empty"><CheckSquare2 size={30} color="var(--text-sec)" /><span>Packing list</span></div>
      )}
    </div>
  );
}

// ─── NOTES CARD ───────────────────────────────────────────────────────────────

function NotesCard({ data, loading, onChange }) {
  const [val, setVal] = useState('');
  useEffect(() => { setVal(data?.notes || ''); }, [data?.notes]);

  return (
    <div className="bento-card fade-in" style={{ animationDelay: '420ms' }}>
      <div className="card-label"><FileText size={13} style={{ marginRight: 5 }} />Notes</div>
      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[1,2,3].map(i => <Skeleton key={i} h="14px" w={`${80 - i * 15}%`} />)}
        </div>
      ) : (
        <textarea
          className="notes-area"
          value={val}
          onChange={e => { setVal(e.target.value); onChange(e.target.value); }}
          placeholder="Vos notes de voyage…"
        />
      )}
    </div>
  );
}

// ─── MAP CARD ───────────────────────────────────────────────────────────────────

function MapCard({ data, dark, allStepsData = [] }) {
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
    const hotel = data?.hotel;
    if (hotel?.lat && hotel?.lng) {
      const icon = L.divIcon({ className: '', html: '<div class="map-marker hotel-marker">🏠</div>', iconSize: [32, 32], iconAnchor: [16, 16] });
      L.marker([hotel.lat, hotel.lng], { icon }).addTo(map)
        .bindPopup(`<b>${hotel.name}</b><br>${hotel.address || ''}`);
      bounds.push([hotel.lat, hotel.lng]);
    }
    (data?.activities || []).forEach(act => {
      if (!act.lat || !act.lng) return;
      const c = { culture: '#3B82F6', food: '#D97706', nature: '#059669' }[act.tag] || '#3B82F6';
      const icon = L.divIcon({ className: '', html: `<div class="map-marker act-marker" style="background:${c}">${act.emoji || '📍'}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
      L.marker([act.lat, act.lng], { icon }).addTo(map)
        .bindPopup(`<b>${act.name}</b><br>${act.time || ''}`);
      bounds.push([act.lat, act.lng]);
    });

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
            .bindPopup(`<b>Étape ${si+1}: ${stepData.destination?.city}</b><br>${stepData.hotel.name}`);
          bounds.push([stepData.hotel.lat, stepData.hotel.lng]);
        });
      }
    }

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [40, 40] });
    else map.setView([20, 0], 2);
    setTimeout(() => map.invalidateSize(), 100);
  }, [data, dark, allStepsData]);

  useEffect(() => () => { mapRef.current?.remove(); mapRef.current = null; }, []);

  return (
    <div className="bento-card map-card fade-in" style={{ animationDelay: '480ms' }}>
      <div className="card-label"><MapPin size={13} style={{ marginRight: 5 }} />Carte</div>
      <div ref={mapDiv} className="map-container" />
    </div>
  );
}

// ─── SUGGESTIONS BAR ────────────────────────────────────────────────────────────

function SuggestionsBar({ suggestions, onSelect }) {
  if (!suggestions.length) return null;
  return (
    <div className="suggestions-bar">
      <span className="suggestions-label"><Sparkles size={12} />Destinations similaires</span>
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
  return (
    <div className="preferences-panel">
      <div className="pref-row">
        <label className="pref-label">Voyageurs</label>
        <div className="pref-pills">
          {['Solo', 'Couple', 'Famille', 'Groupe'].map(t => (
            <button key={t} className={`pref-pill ${travelers === t ? 'active' : ''}`} onClick={() => setTravelers(t)}>{t}</button>
          ))}
        </div>
      </div>

      <div className="pref-row">
        <label className="pref-label">Style</label>
        <div className="pref-pills">
          {['Backpacker', 'Confort', 'Luxe'].map(s => (
            <button key={s} className={`pref-pill ${style === s ? 'active' : ''}`} onClick={() => setStyle(s)}>{s}</button>
          ))}
        </div>
      </div>

      <div className="pref-row">
        <label className="pref-label">Rythme</label>
        <div className="pref-pills">
          {['Chargé', 'Tranquille'].map(p => (
            <button key={p} className={`pref-pill ${pace === p ? 'active' : ''}`} onClick={() => setPace(p)}>{p}</button>
          ))}
        </div>
      </div>

      <div className="pref-row">
        <label className="pref-label">Budget max: <span className="pref-value">{maxBudget}€</span></label>
        <input type="range" className="pref-slider" min="500" max="10000" step="100" value={maxBudget} onChange={e => setMaxBudget(Number(e.target.value))} />
      </div>
    </div>
  );
}

// ─── INSPIRATIONS SECTION ─────────────────────────────────────────────────────

function InspirationCard({ onSelect }) {
  const inspirations = [
    { emoji: '🎒', title: 'Backpack Asie du Sud-Est', duration: '3 sem', price: '1500€', destination: 'Bangkok', days: 21, travelers: 'Solo', style: 'Backpacker', pace: 'Chargé' },
    { emoji: '🚗', title: 'Roadtrip côte ouest USA', duration: '2 sem', price: '1800€', destination: 'Los Angeles', days: 14, travelers: 'Couple', style: 'Confort', pace: 'Chargé' },
    { emoji: '🏙️', title: 'City Break Europe', duration: '5 jours', price: '800€', destination: 'Paris', days: 5, travelers: 'Couple', style: 'Confort', pace: 'Tranquille' },
    { emoji: '💑', title: 'Lune de miel Maldives', duration: '10 jours', price: '3000€', destination: 'Maldives', days: 10, travelers: 'Couple', style: 'Luxe', pace: 'Tranquille' },
    { emoji: '🏔️', title: 'Trek Amérique du Sud', duration: '3 sem', price: '2200€', destination: 'Cusco', days: 21, travelers: 'Solo', style: 'Backpacker', pace: 'Chargé' },
    { emoji: '🌍', title: 'Tour Méditerranée', duration: '2 sem', price: '2500€', destination: 'Barcelona', days: 14, travelers: 'Groupe', style: 'Confort', pace: 'Chargé' },
  ];

  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  ];

  return (
    <div className="inspirations-section">
      <h3 className="inspirations-title">Inspirations</h3>
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
          <Settings size={16} /><span>Clés API</span>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <p className="modal-hint">Clés stockées en mémoire de session. Les clés OpenWeather et Amadeus sont optionnelles (enrichissement en temps réel).</p>

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
          <button className="modal-cancel" onClick={onClose}>Annuler</button>
          <button className="modal-save" onClick={() => onSave(draft)}>
            Enregistrer <ChevronRight size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── MULTI-STEP COMPONENTS ────────────────────────────────────────────────────

const TRANSPORT_EMOJI = { avion: '✈️', train: '🚂', bus: '🚌', bateau: '⛴️', voiture: '🚗' };

function StepTimeline({ steps, activeIdx, onStepClick }) {
  return (
    <div className="step-timeline fade-in">
      {steps.map((step, i) => (
        <React.Fragment key={i}>
          <button className={`timeline-step${i === activeIdx ? ' active' : ''}${step.data ? ' planned' : ''}`}
            onClick={() => onStepClick(i)}>
            <div className="timeline-circle">
              {step.loading ? <Loader2 size={14} className="spin" /> : step.data ? '🏁' : '📍'}
            </div>
            <div className="timeline-label">{step.data?.destination?.city || step.dest || `Étape ${i+1}`}</div>
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
  return (
    <div className="extra-step-row">
      <span className="step-label-pill">Étape {index + 2}</span>
      <input className="search-input" placeholder="Destination" value={step.dest}
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

function CompareView({ dataA, dataB, compareLoading, compareDest, setCompareDest,
  compareDateDepart, setCompareDateDepart, compareDateRetour, setCompareDateRetour,
  onPlan, onChoose, onClose }) {
  const cmp = (a, b, lowerBetter = false) => {
    if (a == null || b == null || a === b) return '';
    return (lowerBetter ? a < b : a > b) ? 'better' : 'worse';
  };
  const priceA = dataA?.hotel?.pricePerNight, priceB = dataB?.hotel?.pricePerNight;
  const budgetA = dataA?.budget?.total, budgetB = dataB?.budget?.total;
  const actA = dataA?.activities?.length ?? 0, actB = dataB?.activities?.length ?? 0;
  const safeA = dataA?.practicalInfo?.safetyLevel, safeB = dataB?.practicalInfo?.safetyLevel;

  const statsA = [
    { label: 'Météo',        value: dataA?.weather?.temp ? `${dataA.weather.temp} — ${dataA.weather.condition}` : '—', cls: '' },
    { label: 'Hôtel/nuit',   value: priceA != null ? `${priceA} €` : '—', cls: cmp(priceA, priceB, true) },
    { label: 'Budget total', value: budgetA != null ? `${budgetA} €` : '—', cls: cmp(budgetA, budgetB, true) },
    { label: 'Activités',    value: actA ? `${actA} activités` : '—', cls: cmp(actA, actB) },
    { label: 'Sécurité',     value: safeA != null ? `${safeA}/5` : '—', cls: cmp(safeA, safeB) },
  ];
  const statsB = [
    { label: 'Météo',        value: dataB?.weather?.temp ? `${dataB.weather.temp} — ${dataB.weather.condition}` : '—', cls: '' },
    { label: 'Hôtel/nuit',   value: priceB != null ? `${priceB} €` : '—', cls: cmp(priceB, priceA, true) },
    { label: 'Budget total', value: budgetB != null ? `${budgetB} €` : '—', cls: cmp(budgetB, budgetA, true) },
    { label: 'Activités',    value: actB ? `${actB} activités` : '—', cls: cmp(actB, actA) },
    { label: 'Sécurité',     value: safeB != null ? `${safeB}/5` : '—', cls: cmp(safeB, safeA) },
  ];

  return (
    <div className="compare-overlay">
      <div className="compare-header">
        <span className="compare-title">Comparaison de destinations</span>
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
          <button className="btn-choose" onClick={() => onChoose('left')}>Choisir celle-ci</button>
        </div>
        <div className="compare-divider" />
        <div className="compare-col">
          {!dataB && !compareLoading ? (
            <div className="compare-form">
              <input className="search-input" placeholder="Destination" value={compareDest}
                onChange={e => setCompareDest(e.target.value)} />
              <input type="date" className="date-input" value={compareDateDepart}
                onChange={e => setCompareDateDepart(e.target.value)} />
              <input type="date" className="date-input" value={compareDateRetour}
                onChange={e => setCompareDateRetour(e.target.value)} />
              <button className="btn-plan" onClick={onPlan} disabled={!compareDest.trim()}>Planifier</button>
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
              <button className="btn-choose" onClick={() => onChoose('right')}>Choisir celle-ci</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

export default function App() {
  const [dark,        setDark]        = useState(false);
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
  const [suggestions, setSuggestions] = useState([]);
  const [travelers, setTravelers] = useState('Solo');
  const [style, setStyle] = useState('Confort');
  const [pace, setPace] = useState('Chargé');
  const [maxBudget, setMaxBudget] = useState(5000);
  const [highlightedDay, setHighlightedDay] = useState(null);
  const gridRef = useRef(null);

  // Multi-step mode state
  const [extraSteps,    setExtraSteps]    = useState([]);
  const [stepsData,     setStepsData]     = useState([]);
  const [stepsLoading,  setStepsLoading]  = useState([]);
  const [activeStepIdx, setActiveStepIdx] = useState(0);

  // Computed derived values
  const activeData    = activeStepIdx === 0 ? data    : (stepsData[activeStepIdx - 1]    ?? null);
  const activeLoading = activeStepIdx === 0 ? loading : (stepsLoading[activeStepIdx - 1] ?? false);
  const multiMode     = extraSteps.length > 0;

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
    if (!keys.mistral) { setShowModal(true); return; }
    setCompareLoading(true);
    setCompareData(null);
    try {
      const depAirport = getCityAirportCode(depCity);
      const sysMsg = SYSTEM_PROMPT.replace('"from": "CDG"', `"from": "${depAirport}"`);
      const res = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.mistral}` },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [{ role: 'user', content: `${sysMsg}\n\n${buildUserMessage(compareDest, compareDateDepart, compareDateRetour, depCity, { travelers, style, pace, maxBudget })}` }],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });
      const result = await res.json();
      const raw = result.choices?.[0]?.message?.content || '';
      const cleaned = raw.replace(/^```(?:json)?\s*/i,'').replace(/\s*```\s*$/i,'').trim();
      const parsed = JSON.parse(cleaned);
      parsed.preferences = { travelers, style, pace, maxBudget };
      setCompareData(parsed);
    } catch {
      showToast('Erreur lors de la comparaison');
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

  useEffect(() => { setChecked({}); }, [data?.checklist?.join(',')]);

  const showToast = (msg) => setToast(msg);

  const saveAllKeys = (newKeys) => {
    setKeys(newKeys);
    ssSet('mistral_key',    newKeys.mistral);
    ssSet('ow_key',         newKeys.ow);
    ssSet('amadeus_id',     newKeys.amadeusId);
    ssSet('amadeus_secret', newKeys.amadeusSecret);
    setShowModal(false);
    showToast('Clés enregistrées ✓');
  };

  const handleToggle = (item) => setChecked(p => ({ ...p, [item]: !p[item] }));

  // ── SAVE / LOAD TRIPS ──────────────────────────────────────────────────────
  const handleSave = () => {
    if (!data?.destination?.city) return;
    const trip = { id: Date.now(), city: data.destination.city, country: data.destination.country || '', dateDepart, dateRetour, dates: data.destination.dates || '', data };
    const updated = [trip, ...savedTrips.filter(t => !(t.city === trip.city && t.dateDepart === trip.dateDepart))];
    setSavedTrips(updated);
    localStorage.setItem('saved_trips', JSON.stringify(updated));
    showToast('Voyage sauvegardé ✓');
  };

  const handleLoadTrip = (trip) => {
    setData(trip.data); setDest(trip.city);
    setDateDepart(trip.dateDepart || '');
    setDateRetour(trip.dateRetour || '');
    if (trip.data?.destination?.dates) {
      const [d1, d2] = trip.data.destination.dates.split(' au ');
      if (d1) setDateDepart(d1);
      if (d2) setDateRetour(d2);
    }
    setWeatherIsLive(false); setFlightIsReal(false);
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
      console.log('[enrichData] Starting OpenWeather fetch for:', parsed.destination.city);
      fetchRealWeather(parsed.destination.city, keys.ow)
        .then(w => { console.log('[enrichData] OpenWeather success:', w); setData(d => d ? { ...d, weather: w } : d); setWeatherIsLive(true); })
        .catch((err) => { console.error('[enrichData] OpenWeather error:', err.message); showToast('Météo live indisponible — données IA conservées'); });
    } else {
      console.log('[enrichData] OpenWeather skipped:', { hasKey: !!keys.ow, hasCity: !!parsed.destination?.city });
    }

    // 2. Amadeus
    if (keys.amadeusId && keys.amadeusSecret && parsed.flight?.to && dateDepart) {
      getAmadeusToken(keys.amadeusId, keys.amadeusSecret)
        .then(token => fetchRealFlight(parsed.flight.from || 'CDG', parsed.flight.to, dateDepart, token))
        .then(fl => { setData(d => d ? { ...d, flight: fl } : d); setFlightIsReal(true); })
        .catch(() => showToast('Vol réel indisponible — données IA conservées'));
    }
  };

  // ── MAIN API CALL ──────────────────────────────────────────────────────────
  const handlePlan = async (destOverride) => {
    console.log('[handlePlan] Start', { destOverride, dest, keysExists: !!keys.mistral });
    const d = String(destOverride || dest || '').trim();
    if (!d)    { showToast('Veuillez entrer une destination'); return; }
    if (!keys.mistral)   { setShowModal(true); return; }
    if (dateDepart && dateRetour && dateRetour < dateDepart) { showToast('La date de retour doit être après le départ'); return; }

    setLoading(true);
    setData(null);
    setWeatherIsLive(false);
    setFlightIsReal(false);
    setSuggestions([]);

    try {
      console.log('[handlePlan] Before fetch', { d });
      const depAirport = getCityAirportCode(depCity);
      const systemMsg = SYSTEM_PROMPT.replace('"from": "CDG"', `"from": "${depAirport}"`);
      const res = await fetch(MISTRAL_API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.mistral}` },
        body: JSON.stringify({
          model: 'mistral-small-latest',
          messages: [{ role: 'user', content: `${systemMsg}\n\n${buildUserMessage(d, dateDepart, dateRetour, depCity, { travelers, style, pace, maxBudget })}` }],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        }),
      });

      if (!res.ok) {
        console.error('[handlePlan] HTTP error', { status: res.status });
        const err = await res.json().catch(() => ({}));
        if (res.status === 400 || res.status === 403) { showToast('Clé Mistral invalide.'); setShowModal(true); }
        else { showToast(err.error?.message || `Erreur ${res.status}`); }
        return;
      }

      console.log('[handlePlan] Response OK', { status: res.status });
      const result  = await res.json();
      const raw     = result.choices?.[0]?.message?.content || '';
      console.log('[handlePlan] Parsed JSON raw length:', raw.length);
      const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
      const parsed  = JSON.parse(cleaned);
      console.log('[handlePlan] Data set', { city: parsed.destination?.city });
      parsed.preferences = { travelers, style, pace, maxBudget };
      setData(parsed);

      // Non-blocking enrichment
      enrichData(parsed);

      // Non-blocking suggestions (skip in multi-mode)
      if (!multiMode) {
        fetchSuggestions(d, keys.mistral)
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
            const stepDepCity = i === 0 ? depCity : prevCity;
            const depAirport = getCityAirportCode(stepDepCity);
            const sysMsg = SYSTEM_PROMPT.replace('"from": "CDG"', `"from": "${depAirport}"`);
            const stepRes = await fetch(MISTRAL_API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${keys.mistral}` },
              body: JSON.stringify({
                model: 'mistral-small-latest',
                messages: [{ role: 'user', content: `${sysMsg}\n\n${buildUserMessage(step.dest, step.dateDepart, step.dateRetour, stepDepCity, { travelers, style, pace, maxBudget }, stepContext)}` }],
                temperature: 0.7,
                response_format: { type: 'json_object' },
              }),
            });
            const stepResult = await stepRes.json();
            const stepRaw = stepResult.choices?.[0]?.message?.content || '';
            const stepCleaned = stepRaw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
            const stepParsed = JSON.parse(stepCleaned);
            stepParsed.preferences = { travelers, style, pace, maxBudget };
            setStepsData(s => { const c = [...s]; c[i] = stepParsed; return c; });
            prevCity = stepParsed.destination?.city || step.dest;
          } catch {
            showToast(`Erreur pour l'étape ${i + 2}`);
          } finally {
            setStepsLoading(s => { const c = [...s]; c[i] = false; return c; });
          }
        }
      }

    } catch (e) {
      console.error('[handlePlan] Error caught:', e.message, e);
      if (e instanceof SyntaxError) showToast('Erreur de parsing JSON — réessayez.');
      else                          showToast(e.message || 'Une erreur est survenue.');
    } finally {
      console.log('[handlePlan] Finally block');
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!gridRef.current || !data) return;
    try {
      const canvas = await window.html2canvas(gridRef.current, { scale: 1.5, useCORS: true, logging: false });
      const imgData = canvas.toDataURL('image/jpeg', 0.9);
      const { jsPDF } = window.jspdf;
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const pw = pdf.internal.pageSize.getWidth();
      const ph = pdf.internal.pageSize.getHeight();
      pdf.setFontSize(15);
      pdf.text(`Mon voyage à ${data.destination?.city || dest}`, 14, 14);
      pdf.setFontSize(10);
      pdf.text(new Date().toLocaleDateString('fr-FR'), 14, 21);
      const ratio = canvas.width / canvas.height;
      const iw = pw - 20;
      const ih = Math.min(iw / ratio, ph - 30);
      pdf.addImage(imgData, 'JPEG', 10, 26, iw, ih);
      pdf.save(`voyage-${(data.destination?.city || dest).toLowerCase().replace(/\s+/g, '-')}.pdf`);
    } catch {
      showToast('Export PDF échoué');
    }
  };

  const handleReset = () => {
    setData(null); setDest(''); setDepCity('Paris (CDG)'); setDateDepart(''); setDateRetour('');
    setWeatherIsLive(false); setFlightIsReal(false);
    setExtraSteps([]); setStepsData([]); setStepsLoading([]); setActiveStepIdx(0);
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
            <button className="icon-btn" title="Mes voyages" onClick={() => setSidebarOpen(o => !o)}>
              <Menu size={16} />
            </button>
            <h1 className="app-title">Voyage <span className="title-icon">✈️</span></h1>
          </div>
          <div className="header-right">
            {data && (
              <>
                <button className="icon-btn" title="Comparer" onClick={() => setCompareMode(true)}><Columns size={16} /></button>
                <button className="icon-btn" title="Exporter PDF" onClick={handleExport}><Download size={16} /></button>
                <button className="icon-btn" title="Sauvegarder" onClick={handleSave}><Bookmark size={16} /></button>
                <button className="icon-btn" title="Réinitialiser" onClick={handleReset}><RotateCcw size={16} /></button>
              </>
            )}
            <button className="icon-btn" title="Paramètres API" onClick={() => setShowModal(true)}>
              <Settings size={16} />
            </button>
            <button className="icon-btn" title="Thème" onClick={() => setDark(d => !d)}>
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
              placeholder="Où voulez-vous aller ?"
              disabled={loading}
            />
            <div className="search-divider" />
            <input
              className="search-input"
              value={depCity}
              onChange={e => setDepCity(e.target.value)}
              placeholder="Ville de départ"
              disabled={loading}
              title="Ville de départ"
            />
            <div className="search-divider" />
            <input type="date" className="date-input" value={dateDepart} onChange={e => setDateDepart(e.target.value)} disabled={loading} title="Date de départ" />
            <div className="search-divider" />
            <input type="date" className="date-input" value={dateRetour} onChange={e => setDateRetour(e.target.value)} disabled={loading} title="Date de retour" />
            {!loading && extraSteps.length < 4 && (
              <button className="btn-add-step" title="Ajouter une étape" onClick={addExtraStep}>
                <Plus size={14} />
              </button>
            )}
            <button className={`btn-plan${loading ? ' loading' : ''}`} onClick={() => { console.log('[Button click] Plan clicked'); handlePlan(); }} disabled={loading}>
              {loading ? <><Loader2 size={15} className="spin" />Planification…</> : <><Sparkles size={15} />Planifier</>}
            </button>
          </div>
          {extraSteps.map((step, i) => (
            <ExtraStepRow key={i} index={i} step={step}
              onChange={(field, val) => updateExtraStep(i, field, val)}
              onRemove={() => removeExtraStep(i)}
              disabled={loading || stepsLoading.some(Boolean)}
            />
          ))}
          {!keys.mistral && (
            <p className="api-hint" onClick={() => setShowModal(true)}>
              <Key size={12} style={{ marginRight: 4 }} />
              Configurez vos clés API pour activer le planificateur
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

        {/* ── INSPIRATIONS ── */}
        {!data && <InspirationCard onSelect={handleInspirationSelect} />}

        {/* ── STEP TIMELINE ── */}
        {multiMode && (data || loading) && (
          <StepTimeline steps={timelineSteps} activeIdx={activeStepIdx} onStepClick={setActiveStepIdx} />
        )}

        {/* ── BENTO GRID ── */}
        <main className="bento-grid" ref={gridRef}>
          <DestinationCard data={activeData} loading={activeLoading} />
          <WeatherCard     data={activeData} loading={activeLoading} isLive={weatherIsLive} />
          <FlightCard      data={activeData} loading={activeLoading} isReal={flightIsReal} />
          <HotelCard       data={activeData} loading={activeLoading} />
          <PracticalInfoCard data={activeData} loading={activeLoading} />
          <ActivitiesCard  data={activeData} loading={activeLoading} onDayClick={setHighlightedDay} />
          <BudgetCard      data={activeData} loading={activeLoading} highlightedDay={highlightedDay} />
          <PackingListCard   data={activeData} loading={activeLoading} checked={checked} onToggle={handleToggle} />
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
        <SuggestionsBar suggestions={suggestions} onSelect={(city) => { setDest(city); handlePlan(city); }} />
      </div>

      {toast      && <Toast message={toast} onClose={() => setToast(null)} />}
      {showModal  && <SettingsModal keys={keys} onSave={saveAllKeys} onClose={() => setShowModal(false)} />}
    </div>
  );
}
