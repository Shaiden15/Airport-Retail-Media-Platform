import type { AircraftType, Airline, Region, TripPurpose } from '@dwellcast/shared';

// Reference lists follow the challenge samples (data/aodb-samples): fictional airport MQI, its airlines and cities

export const AIRCRAFT: readonly AircraftType[] = [
  { iataCode: '32N', icaoCode: 'A20N', name: 'Airbus A320neo', widebody: false, seats: { economy: 186, premiumEconomy: 0, business: 0, first: 0 } },
  { iataCode: '32Q', icaoCode: 'A21N', name: 'Airbus A321neo', widebody: false, seats: { economy: 220, premiumEconomy: 0, business: 12, first: 0 } },
  { iataCode: 'AT7', icaoCode: 'AT76', name: 'ATR 72-600', widebody: false, seats: { economy: 78, premiumEconomy: 0, business: 0, first: 0 } },
  { iataCode: '7M8', icaoCode: 'B38M', name: 'Boeing 737 MAX 8', widebody: false, seats: { economy: 189, premiumEconomy: 0, business: 0, first: 0 } },
  { iataCode: '738', icaoCode: 'B738', name: 'Boeing 737-800', widebody: false, seats: { economy: 189, premiumEconomy: 0, business: 0, first: 0 } },
  { iataCode: '359', icaoCode: 'A359', name: 'Airbus A350-900', widebody: true, seats: { economy: 253, premiumEconomy: 0, business: 30, first: 0 } },
  { iataCode: '788', icaoCode: 'B788', name: 'Boeing 787-8', widebody: true, seats: { economy: 226, premiumEconomy: 0, business: 30, first: 0 } },
  { iataCode: '789', icaoCode: 'B789', name: 'Boeing 787-9', widebody: true, seats: { economy: 241, premiumEconomy: 28, business: 30, first: 0 } },
  { iataCode: '77W', icaoCode: 'B77W', name: 'Boeing 777-300ER', widebody: true, seats: { economy: 290, premiumEconomy: 24, business: 40, first: 0 } },
  { iataCode: '388', icaoCode: 'A388', name: 'Airbus A380-800', widebody: true, seats: { economy: 399, premiumEconomy: 0, business: 76, first: 14 } },
  { iataCode: '74H', icaoCode: 'B748', name: 'Boeing 747-8', widebody: true, seats: { economy: 300, premiumEconomy: 0, business: 56, first: 8 } },
];

export const AIRCRAFT_BY_ICAO = new Map(AIRCRAFT.map((a) => [a.icaoCode, a]));
export const AIRCRAFT_BY_IATA = new Map(AIRCRAFT.map((a) => [a.iataCode, a]));

export interface AirlineReference extends Airline {
  icaoCode: string;
  regPrefix: string;
  flightNumberRange: readonly [number, number];
  rotations: number;
  // Seats per type vary by airline, exactly as in the sample AODB file
  fleet: readonly { icao: string; seats: number; businessSeats: number; weight: number }[];
  routes: readonly { code: string; weight: number }[];
}

// Rotation counts scale the sample's 160 arrival/departure pairs to 450 pairs (about 900 legs)
export const AIRLINES: readonly AirlineReference[] = [
  { code: 'XD', icaoCode: 'SKJ', name: 'Skylark Air', model: 'low-cost', hubRegion: 'domestic', brandColor: '#0284c7', regPrefix: 'QM', flightNumberRange: [197, 6957], rotations: 212,
    fleet: [{ icao: 'A20N', seats: 186, businessSeats: 0, weight: 54 }, { icao: 'A21N', seats: 232, businessSeats: 12, weight: 38 }, { icao: 'AT76', seats: 78, businessSeats: 0, weight: 58 }],
    routes: [{ code: 'JFQ', weight: 8 }, { code: 'LMW', weight: 7 }, { code: 'IVQ', weight: 7 }, { code: 'NGV', weight: 5 }, { code: 'HCX', weight: 5 }, { code: 'SMG', weight: 5 }, { code: 'EHQ', weight: 4 }, { code: 'ADN', weight: 4 }, { code: 'SCJ', weight: 4 }, { code: 'CBP', weight: 4 }, { code: 'BVQ', weight: 4 }, { code: 'KST', weight: 4 }, { code: 'GSZ', weight: 4 }, { code: 'BWZ', weight: 4 }, { code: 'FHQ', weight: 3 }, { code: 'CPZ', weight: 1 }, { code: 'GRH', weight: 1 }, { code: 'DMQ', weight: 1 }] },
  { code: 'YA', icaoCode: 'AUQ', name: 'Aurora National Airlines', model: 'full-service', hubRegion: 'domestic', brandColor: '#334155', regPrefix: 'QM', flightNumberRange: [79, 978], rotations: 65,
    fleet: [{ icao: 'A20N', seats: 162, businessSeats: 12, weight: 18 }, { icao: 'B788', seats: 256, businessSeats: 30, weight: 10 }, { icao: 'A359', seats: 316, businessSeats: 36, weight: 18 }],
    routes: [{ code: 'OKZ', weight: 3 }, { code: 'JFQ', weight: 2 }, { code: 'GRH', weight: 2 }, { code: 'DMQ', weight: 2 }, { code: 'GSZ', weight: 2 }, { code: 'ADN', weight: 2 }, { code: 'BVQ', weight: 1 }, { code: 'EHQ', weight: 1 }, { code: 'IVQ', weight: 1 }, { code: 'CBP', weight: 1 }, { code: 'FHQ', weight: 1 }, { code: 'BWZ', weight: 1 }, { code: 'KST', weight: 1 }, { code: 'NGV', weight: 1 }, { code: 'SCJ', weight: 1 }, { code: 'CPZ', weight: 1 }] },
  { code: 'YN', icaoCode: 'KSQ', name: 'Kestrel Air', model: 'low-cost', hubRegion: 'domestic', brandColor: '#7c3aed', regPrefix: 'QM', flightNumberRange: [40, 945], rotations: 45,
    fleet: [{ icao: 'B38M', seats: 189, businessSeats: 0, weight: 1 }],
    routes: [{ code: 'LMW', weight: 2 }, { code: 'GRH', weight: 2 }, { code: 'NGV', weight: 2 }, { code: 'OKZ', weight: 2 }, { code: 'JFQ', weight: 2 }, { code: 'FHQ', weight: 1 }, { code: 'ADN', weight: 1 }, { code: 'HCX', weight: 1 }, { code: 'CBP', weight: 1 }, { code: 'GSZ', weight: 1 }, { code: 'DMQ', weight: 1 }] },
  { code: 'XU', icaoCode: 'CWQ', name: 'Coralwing Express', model: 'low-cost', hubRegion: 'domestic', brandColor: '#e11d48', regPrefix: 'QM', flightNumberRange: [84, 948], rotations: 39,
    fleet: [{ icao: 'B38M', seats: 180, businessSeats: 0, weight: 1 }],
    routes: [{ code: 'IVQ', weight: 3 }, { code: 'NGV', weight: 3 }, { code: 'ADN', weight: 2 }, { code: 'OKZ', weight: 1 }, { code: 'FHQ', weight: 1 }, { code: 'GRH', weight: 1 }, { code: 'JFQ', weight: 1 }, { code: 'CPZ', weight: 1 }, { code: 'LMW', weight: 1 }] },
  { code: 'ZO', icaoCode: 'SLQ', name: 'Solano Airways', model: 'full-service', hubRegion: 'europe', brandColor: '#b45309', regPrefix: 'QE', flightNumberRange: [101, 832], rotations: 22,
    fleet: [{ icao: 'B77W', seats: 354, businessSeats: 40, weight: 6 }, { icao: 'A388', seats: 489, businessSeats: 76, weight: 10 }],
    routes: [{ code: 'KST', weight: 1 }] },
  { code: 'YF', icaoCode: 'SVZ', name: 'Sunvale Airlines', model: 'low-cost', hubRegion: 'domestic', brandColor: '#ca8a04', regPrefix: 'QM', flightNumberRange: [57, 978], rotations: 17,
    fleet: [{ icao: 'B738', seats: 189, businessSeats: 0, weight: 1 }],
    routes: [{ code: 'DMQ', weight: 1 }, { code: 'GRH', weight: 1 }, { code: 'LMW', weight: 1 }, { code: 'BWZ', weight: 1 }, { code: 'GSZ', weight: 1 }, { code: 'CPZ', weight: 1 }] },
  { code: 'XH', icaoCode: 'HCZ', name: 'Halcyon Airways', model: 'full-service', hubRegion: 'gulf', brandColor: '#0f766e', regPrefix: 'QH', flightNumberRange: [162, 961], rotations: 14,
    fleet: [{ icao: 'A359', seats: 283, businessSeats: 30, weight: 6 }, { icao: 'B77W', seats: 354, businessSeats: 40, weight: 4 }],
    routes: [{ code: 'ZHQ', weight: 1 }] },
  { code: 'YG', icaoCode: 'ACZ', name: 'Alpine Continental Airlines', model: 'full-service', hubRegion: 'europe', brandColor: '#1d4ed8', regPrefix: 'QD', flightNumberRange: [145, 659], rotations: 11,
    fleet: [{ icao: 'B748', seats: 364, businessSeats: 56, weight: 1 }],
    routes: [{ code: 'NVQ', weight: 1 }] },
  { code: 'XI', icaoCode: 'CRU', name: 'Crescent Airways', model: 'full-service', hubRegion: 'asia', brandColor: '#be185d', regPrefix: 'QE', flightNumberRange: [235, 967], rotations: 11,
    fleet: [{ icao: 'B789', seats: 299, businessSeats: 30, weight: 1 }],
    routes: [{ code: 'PVQ', weight: 1 }] },
  { code: 'YU', icaoCode: 'LPZ', name: 'Lumen Pacific Airlines', model: 'full-service', hubRegion: 'americas', brandColor: '#15803d', regPrefix: 'QL', flightNumberRange: [119, 700], rotations: 8,
    fleet: [{ icao: 'A359', seats: 253, businessSeats: 30, weight: 1 }],
    routes: [{ code: 'SCJ', weight: 1 }] },
  { code: 'YB', icaoCode: 'NSZ', name: 'Northstar Atlantic', model: 'full-service', hubRegion: 'americas', brandColor: '#4338ca', regPrefix: 'QN', flightNumberRange: [615, 651], rotations: 6,
    fleet: [{ icao: 'B77W', seats: 336, businessSeats: 42, weight: 1 }],
    routes: [{ code: 'BVQ', weight: 1 }] },
];

export const AIRLINE_BY_CODE = new Map(AIRLINES.map((a) => [a.code, a]));

export const HANDLERS = ['Skylark self-handling', 'Meridian Ground Services', 'Harbor Aviation Services', 'Compass Ground Handling'] as const;

// Codeshare marketing carriers seen in the sample file
export const CODESHARE_SETS: readonly string[] = ['XD|XH', 'XH|YB', 'YA|YG'];

export interface CityReference {
  code: string;
  city: string;
  region: Region;
  international: boolean;
  blockMinutes: number;
  beach: boolean;
  purpose: Record<TripPurpose, number>;
  // Fictional nationality codes use the ISO 3166 user-assigned X* range
  nationalities: readonly [string, number][];
  languages: readonly [string, number][];
}

const HOME_NAT: readonly [string, number][] = [['XM', 0.93], ['XK', 0.03], ['XZ', 0.02]];
const HOME_LANG: readonly [string, number][] = [['en', 0.58], ['hi', 0.32], ['es', 0.05]];

const BIZ = { business: 0.48, holiday: 0.18, vfr: 0.26, student: 0.05, religious: 0.03 };
const MIX = { business: 0.3, holiday: 0.28, vfr: 0.32, student: 0.06, religious: 0.04 };
const LEISURE = { business: 0.1, holiday: 0.66, vfr: 0.18, student: 0.03, religious: 0.03 };
const SCENIC = { business: 0.16, holiday: 0.5, vfr: 0.26, student: 0.04, religious: 0.04 };

function home(code: string, city: string, blockMinutes: number, purpose: Record<TripPurpose, number>, beach = false): CityReference {
  return { code, city, region: 'domestic', international: false, blockMinutes, beach, purpose, nationalities: HOME_NAT, languages: HOME_LANG };
}

export const CITIES: readonly CityReference[] = [
  home('ADN', 'Aldmere', 70, MIX),
  home('BWZ', 'Brightwater', 65, LEISURE, true),
  home('CBP', 'Calder Bay', 80, MIX),
  home('CPZ', 'Coralport', 75, LEISURE, true),
  home('DMQ', 'Dunmore', 60, MIX),
  home('EHQ', 'Eastholm', 85, BIZ),
  home('FHQ', 'Fairhaven', 55, MIX),
  home('GRH', 'Glenrock', 90, SCENIC),
  home('GSZ', 'Goldsand', 95, LEISURE, true),
  home('HCX', 'Highcliff', 75, SCENIC),
  home('IVQ', 'Ironvale', 65, BIZ),
  home('JFQ', 'Juniper Falls', 80, SCENIC),
  home('LMW', 'Lakemont', 70, MIX),
  home('NGV', 'Northgate', 60, BIZ),
  home('OKZ', 'Oakridge', 85, BIZ),
  { code: 'ZHQ', city: 'Zarhan', region: 'gulf', international: true, blockMinutes: 210, beach: false, purpose: { business: 0.24, holiday: 0.4, vfr: 0.3, student: 0.02, religious: 0.04 }, nationalities: [['XM', 0.58], ['XZ', 0.28], ['XK', 0.06]], languages: [['en', 0.44], ['ar', 0.3], ['hi', 0.18]] },
  { code: 'KST', city: 'Kastell', region: 'europe', international: true, blockMinutes: 480, beach: false, purpose: { business: 0.4, holiday: 0.26, vfr: 0.22, student: 0.1, religious: 0.02 }, nationalities: [['XK', 0.46], ['XM', 0.44], ['XN', 0.04]], languages: [['en', 0.52], ['de', 0.34], ['hi', 0.1]] },
  { code: 'NVQ', city: 'Novaterra', region: 'europe', international: true, blockMinutes: 540, beach: false, purpose: { business: 0.42, holiday: 0.22, vfr: 0.22, student: 0.12, religious: 0.02 }, nationalities: [['XN', 0.48], ['XM', 0.42], ['XK', 0.05]], languages: [['en', 0.5], ['fr', 0.36], ['hi', 0.1]] },
  { code: 'BVQ', city: 'Belvista', region: 'americas', international: true, blockMinutes: 720, beach: false, purpose: { business: 0.3, holiday: 0.22, vfr: 0.36, student: 0.1, religious: 0.02 }, nationalities: [['XB', 0.5], ['XM', 0.42], ['XC', 0.04]], languages: [['en', 0.6], ['es', 0.26], ['hi', 0.1]] },
  { code: 'PVQ', city: 'Port Valen', region: 'asia', international: true, blockMinutes: 330, beach: false, purpose: { business: 0.38, holiday: 0.34, vfr: 0.2, student: 0.06, religious: 0.02 }, nationalities: [['XP', 0.44], ['XM', 0.48], ['XZ', 0.04]], languages: [['en', 0.5], ['zh', 0.3], ['hi', 0.14]] },
  { code: 'SCJ', city: 'Santa Corvina', region: 'americas', international: true, blockMinutes: 660, beach: true, purpose: { business: 0.2, holiday: 0.5, vfr: 0.24, student: 0.04, religious: 0.02 }, nationalities: [['XC', 0.46], ['XM', 0.46], ['XB', 0.04]], languages: [['es', 0.44], ['en', 0.4], ['pt', 0.1]] },
  { code: 'SMG', city: 'Solmara', region: 'indian-ocean', international: true, blockMinutes: 150, beach: true, purpose: { business: 0.06, holiday: 0.8, vfr: 0.08, student: 0.02, religious: 0.04 }, nationalities: [['XM', 0.66], ['XS', 0.2], ['XK', 0.08]], languages: [['en', 0.54], ['hi', 0.3], ['de', 0.08]] },
];

export const CITY_BY_CODE = new Map(CITIES.map((c) => [c.code, c]));

// Display names for the fictional nationality codes
export const NATIONALITY_NAMES = new Map([
  ['XM', 'Meridian'],
  ['XZ', 'Zarhani'],
  ['XK', 'Kastellan'],
  ['XN', 'Novaterran'],
  ['XB', 'Belvistan'],
  ['XP', 'Valenese'],
  ['XC', 'Corvinan'],
  ['XS', 'Solmaran'],
]);

// Hourly departure weights by UTC hour, shaped like the sample day (early bank, midday, evening)
export const HOURLY_WAVE: readonly number[] = [
  4, 3, 5, 5, 5, 8, 6, 7, 6, 6, 8, 5, 6, 6, 7, 8, 7, 5, 5, 7, 6, 6, 6, 4,
];

// IATA delay codes in the sample file, with how often each appears
export const DELAY_CODES: readonly { code: string; weight: number }[] = [
  { code: '89', weight: 30 },
  { code: '41', weight: 26 },
  { code: '81', weight: 18 },
  { code: '93', weight: 18 },
  { code: '63/11', weight: 10 },
];
