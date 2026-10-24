import type { Advertiser, Campaign, Category, Creative, Outlet, Screen, Segment, Targeting, Vendor } from '@dwellcast/shared';
import { distanceMetres, type AirportLayout, type LayoutZone } from './layout.ts';
import { Prng } from './prng.ts';

export interface DailyStat {
  campaignId: string;
  date: string;
  plays: number;
  impressions: number;
  scans: number;
  redemptions: number;
  spend: number;
  revenue: number;
  segmentRedemptions: Partial<Record<Segment, number>>;
}

export interface PlatformData {
  vendors: Vendor[];
  advertisers: Advertiser[];
  outlets: Outlet[];
  screens: Screen[];
  creatives: Creative[];
  campaigns: Campaign[];
  dailyStats: DailyStat[];
}

const DAY = 86_400_000;
const iso = (ms: number): string => new Date(ms).toISOString().replace('.000Z', 'Z');

const VENDORS: Vendor[] = [
  { id: 'ven-luma', name: 'Lumasign Displays', kind: 'screen-hardware', contactEmail: 'support@lumasign.example' },
  { id: 'ven-vista', name: 'VistaPanel Systems', kind: 'screen-hardware', contactEmail: 'ops@vistapanel.example' },
  { id: 'ven-relay', name: 'Relay Media Networks', kind: 'network', contactEmail: 'noc@relaymedia.example' },
  { id: 'ven-studio', name: 'Northlight Creative Studio', kind: 'content-agency', contactEmail: 'hello@northlight.example' },
];

interface AdvertiserSeed extends Advertiser {
  outlets: { zoneId: string; label: string }[];
  avgBasket: number;
}

const ADVERTISERS: AdvertiserSeed[] = [
  { id: 'adv-horizon', name: 'Horizon Duty Free', kind: 'retailer', category: 'duty-free', airlineCode: null, brandColor: '#0e7490', avgBasket: 96,
    outlets: [{ zoneId: 'Z-T2-DUTYFREE', label: 'Walkthrough' }, { zoneId: 'Z-T2-N-41', label: 'North Pier' }, { zoneId: 'Z-T1-PLAZA', label: 'T1 Plaza' }] },
  { id: 'adv-aurelle', name: 'Aurelle Parfums', kind: 'retailer', category: 'perfume', airlineCode: null, brandColor: '#9d174d', avgBasket: 118,
    outlets: [{ zoneId: 'Z-T2-DUTYFREE', label: 'Duty Free Boutique' }, { zoneId: 'Z-T2-M-57', label: 'Central Pier' }] },
  { id: 'adv-jetsetters', name: 'Little Jetsetters', kind: 'retailer', category: 'toys', airlineCode: null, brandColor: '#f97316', avgBasket: 42,
    outlets: [{ zoneId: 'Z-T2-PLAZA', label: 'Grand Plaza' }, { zoneId: 'Z-T1-PLAZA', label: 'T1 Plaza' }, { zoneId: 'Z-T2-S-73', label: 'South Pier' }] },
  { id: 'adv-voltpoint', name: 'VoltPoint', kind: 'retailer', category: 'electronics', airlineCode: null, brandColor: '#2563eb', avgBasket: 135,
    outlets: [{ zoneId: 'Z-T1-PLAZA', label: 'T1 Plaza' }, { zoneId: 'Z-T2-PLAZA', label: 'Grand Plaza' }, { zoneId: 'Z-T2-N-47', label: 'North Pier' }] },
  { id: 'adv-linen', name: 'Linen & Line', kind: 'retailer', category: 'fashion', airlineCode: null, brandColor: '#a16207', avgBasket: 88,
    outlets: [{ zoneId: 'Z-T2-PLAZA', label: 'Grand Plaza' }, { zoneId: 'Z-T2-M-63', label: 'Central Pier' }] },
  { id: 'adv-paperwing', name: 'Paperwing Books', kind: 'retailer', category: 'books', airlineCode: null, brandColor: '#4d7c0f', avgBasket: 24,
    outlets: [{ zoneId: 'Z-T1-A-A1', label: 'Concourse A' }, { zoneId: 'Z-T2-N-53', label: 'North Pier' }, { zoneId: 'Z-T2-S-79', label: 'South Pier' }] },
  { id: 'adv-careway', name: 'CareWay Pharmacy', kind: 'retailer', category: 'pharmacy', airlineCode: null, brandColor: '#059669', avgBasket: 21,
    outlets: [{ zoneId: 'Z-T1-PLAZA', label: 'T1 Plaza' }, { zoneId: 'Z-T2-PLAZA', label: 'Grand Plaza' }] },
  { id: 'adv-cocoa', name: 'Cocoa Compass', kind: 'retailer', category: 'chocolate', airlineCode: null, brandColor: '#78350f', avgBasket: 34,
    outlets: [{ zoneId: 'Z-T2-DUTYFREE', label: 'Walkthrough' }, { zoneId: 'Z-T1-PLAZA', label: 'T1 Plaza' }] },
  { id: 'adv-mithai', name: 'Mithai House', kind: 'retailer', category: 'sweets', airlineCode: null, brandColor: '#c2410c', avgBasket: 28,
    outlets: [{ zoneId: 'Z-T1-PLAZA', label: 'T1 Plaza' }, { zoneId: 'Z-T1-B-B1', label: 'Concourse B' }, { zoneId: 'Z-T2-M-69', label: 'Central Pier' }] },
  { id: 'adv-beanvoyage', name: 'Bean Voyage', kind: 'fnb', category: 'coffee', airlineCode: null, brandColor: '#92400e', avgBasket: 9,
    outlets: [{ zoneId: 'Z-T1-A-A6', label: 'Concourse A' }, { zoneId: 'Z-T1-B-B7', label: 'Concourse B' }, { zoneId: 'Z-T1-C-C6', label: 'Concourse C' }, { zoneId: 'Z-T2-N-41', label: 'North Pier' }, { zoneId: 'Z-T2-M-57', label: 'Central Pier' }, { zoneId: 'Z-T2-S-85', label: 'South Pier' }, { zoneId: 'Z-T2-PLAZA', label: 'Grand Plaza' }] },
  { id: 'adv-spiceroute', name: 'Spice Route Kitchen', kind: 'fnb', category: 'restaurant', airlineCode: null, brandColor: '#b91c1c', avgBasket: 19,
    outlets: [{ zoneId: 'Z-T1-PLAZA', label: 'T1 Plaza' }, { zoneId: 'Z-T2-PLAZA', label: 'Grand Plaza' }] },
  { id: 'adv-runway', name: 'The Runway Bar', kind: 'fnb', category: 'bar', airlineCode: null, brandColor: '#1e3a8a', avgBasket: 27,
    outlets: [{ zoneId: 'Z-T2-M-63', label: 'Central Pier' }, { zoneId: 'Z-T2-N-47', label: 'North Pier' }] },
  { id: 'adv-gategrind', name: 'Gate & Grind', kind: 'fnb', category: 'coffee', airlineCode: null, brandColor: '#57534e', avgBasket: 11,
    outlets: [{ zoneId: 'Z-T1-C-C1', label: 'Concourse C' }, { zoneId: 'Z-T2-S-73', label: 'South Pier' }] },
  { id: 'adv-noodle', name: 'Noodle Atlas', kind: 'fnb', category: 'restaurant', airlineCode: null, brandColor: '#dc2626', avgBasket: 16,
    outlets: [{ zoneId: 'Z-T2-S-79', label: 'South Pier' }, { zoneId: 'Z-T1-B-B1', label: 'Concourse B' }] },
  { id: 'adv-skyline', name: 'Skyline Lounge', kind: 'lounge', category: 'lounge', airlineCode: null, brandColor: '#312e81', avgBasket: 45,
    outlets: [{ zoneId: 'Z-T2-M-63', label: 'Central Pier' }, { zoneId: 'Z-T1-A-A1', label: 'Concourse A' }] },
  { id: 'adv-xh', name: 'Halcyon Airways', kind: 'airline', category: 'airline', airlineCode: 'XH', brandColor: '#0f766e', avgBasket: 199, outlets: [] },
  { id: 'adv-xd', name: 'Skylark Air', kind: 'airline', category: 'airline', airlineCode: 'XD', brandColor: '#0284c7', avgBasket: 49, outlets: [] },
  { id: 'adv-ya', name: 'Aurora National Airlines', kind: 'airline', category: 'airline', airlineCode: 'YA', brandColor: '#334155', avgBasket: 120, outlets: [] },
];

// Sample companies for the role switcher, as the spec asks
export const SAMPLE_COMPANIES = {
  retailers: ['adv-horizon', 'adv-beanvoyage'],
  airlines: ['XD', 'XH'],
} as const;

type Weights = Partial<Record<Segment, number>>;

interface CampaignSeed {
  id: string;
  advertiserId: string;
  outletIndex: number | null;
  name: string;
  category: Category;
  status: Campaign['status'];
  weights: Weights;
  filters?: Partial<Targeting['hardFilters']>;
  zones?: string[];
  gates?: string[];
  triggers?: Targeting['triggers'];
  hours?: [number, number];
  startOffsetDays: number;
  lengthDays: number;
  budget: number;
  pricePerPlay: number;
  discountPct: number;
  validity?: 'linked-flight-boarding' | 'fixed-minutes';
  creative: { template: Creative['template']; headline: string; subline: string; cta: string; hi: { headline: string; subline: string; cta: string } };
}

const T2_GATES = ['Z-T2-N-41', 'Z-T2-N-47', 'Z-T2-N-53', 'Z-T2-M-57', 'Z-T2-M-63', 'Z-T2-M-69', 'Z-T2-S-73', 'Z-T2-S-79', 'Z-T2-S-85'];
const T1_GATES = ['Z-T1-A-A1', 'Z-T1-A-A6', 'Z-T1-B-B1', 'Z-T1-B-B7', 'Z-T1-C-C1', 'Z-T1-C-C6'];
const T2_CENTRAL = ['Z-T2-M-57', 'Z-T2-M-63', 'Z-T2-M-69'];
type TriggerSeed = Targeting['triggers'][number];
const delay = (minDelayMinutes: number, boost: number, mode: TriggerSeed['mode'] = 'boost'): TriggerSeed => ({ kind: 'delay', minDelayMinutes, destinations: [], boost, mode });
const festival = (boost: number): TriggerSeed => ({ kind: 'festival', minDelayMinutes: null, destinations: [], boost, mode: 'boost' });
const boarding = (boost: number): TriggerSeed => ({ kind: 'boarding', minDelayMinutes: null, destinations: [], boost, mode: 'boost' });

const CAMPAIGNS: CampaignSeed[] = [
  { id: 'cmp-perfume-15', advertiserId: 'adv-aurelle', outletIndex: 0, name: 'Duty-free perfume, 15% off', category: 'perfume', status: 'active',
    weights: { international: 1, holiday: 0.8, '25-34': 0.7, '35-44': 0.8, '45-54': 0.7, couple: 0.6, female: 0.4 }, filters: { internationalOnly: true }, zones: [...T2_GATES, 'Z-T2-DUTYFREE'], triggers: [delay(30, 1.5)],
    startOffsetDays: -21, lengthDays: 45, budget: 24000, pricePerPlay: 2.4, discountPct: 15,
    creative: { template: 'hero-offer', headline: 'Signature scents, 15% off', subline: 'Your favourite fragrances, tax free, steps from your gate', cta: 'Scan for 15% off', hi: { headline: 'सिग्नेचर खुशबू, 15% छूट', subline: 'आपकी पसंदीदा खुशबू, टैक्स फ्री, आपके गेट के पास', cta: '15% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-toys-b2g1', advertiserId: 'adv-jetsetters', outletIndex: 0, name: 'Toy store, buy 2 get 1', category: 'toys', status: 'active',
    weights: { family: 1, u12: 0.9, '12-17': 0.5, holiday: 0.5, vfr: 0.3 }, zones: [...T2_GATES, ...T1_GATES, 'Z-T2-PLAZA'],
    startOffsetDays: -18, lengthDays: 40, budget: 9000, pricePerPlay: 1.2, discountPct: 33,
    creative: { template: 'hero-offer', headline: 'Buy 2 toys, get 1 free', subline: 'Keep little travellers happy all the way there', cta: 'Scan to claim', hi: { headline: '2 खिलौने खरीदें, 1 मुफ़्त पाएँ', subline: 'छोटे यात्रियों को पूरे सफ़र में खुश रखें', cta: 'क्लेम करने के लिए स्कैन करें' } } },
  { id: 'cmp-lounge-daypass', advertiserId: 'adv-skyline', outletIndex: 0, name: 'Business lounge day pass', category: 'lounge', status: 'active',
    weights: { business: 1, 'premium-economy': 0.5, 'frequent-flyer': 0.7, solo: 0.4 }, zones: T2_CENTRAL,
    startOffsetDays: -25, lengthDays: 60, budget: 12000, pricePerPlay: 1.8, discountPct: 20,
    creative: { template: 'upgrade', headline: 'Lounge day pass, 20% off', subline: 'Quiet seats, showers and a proper espresso', cta: 'Scan for your pass', hi: { headline: 'लाउंज डे पास, 20% छूट', subline: 'शांत जगह, शावर और बढ़िया एस्प्रेसो', cta: 'पास के लिए स्कैन करें' } } },
  { id: 'cmp-festive-sweets', advertiserId: 'adv-mithai', outletIndex: 0, name: 'Festive sweets, 20% off', category: 'sweets', status: 'active',
    weights: { family: 0.9, vfr: 0.8, domestic: 1, '35-44': 0.5, '45-54': 0.6, '55+': 0.6 }, filters: { domesticOnly: true }, zones: [...T1_GATES, 'Z-T1-PLAZA'], triggers: [festival(1.3)],
    startOffsetDays: -6, lengthDays: 12, budget: 6000, pricePerPlay: 0.9, discountPct: 20,
    creative: { template: 'hero-offer', headline: 'Festive sweets, 20% off', subline: 'Take a box of joy home to the family', cta: 'Scan for 20% off', hi: { headline: 'त्योहारी मिठाइयाँ, 20% छूट', subline: 'परिवार के लिए खुशियों का डिब्बा ले जाएँ', cta: '20% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-coffee-morning', advertiserId: 'adv-beanvoyage', outletIndex: 3, name: 'Morning brew 2-for-1', category: 'coffee', status: 'active',
    weights: { business: 0.7, solo: 0.6, '25-34': 0.6, '35-44': 0.5 }, zones: [...T2_GATES, ...T1_GATES], hours: [4, 11],
    startOffsetDays: -28, lengthDays: 60, budget: 7000, pricePerPlay: 0.6, discountPct: 50,
    creative: { template: 'countdown-deal', headline: 'Two coffees, one price', subline: 'Before 11:00 at every Bean Voyage', cta: 'Scan for 2-for-1', hi: { headline: 'दो कॉफ़ी, एक दाम', subline: 'हर बीन वॉयज पर 11:00 से पहले', cta: '2-फॉर-1 के लिए स्कैन करें' } } },
  { id: 'cmp-coffee-goodwill', advertiserId: 'adv-beanvoyage', outletIndex: 3, name: 'Delay goodwill: free pastry with coffee', category: 'coffee', status: 'active',
    weights: { business: 0.4, holiday: 0.4, vfr: 0.4, family: 0.4 }, zones: [...T2_GATES, ...T1_GATES], triggers: [delay(60, 1.6, 'required')],
    filters: { minCrowd: 60 }, startOffsetDays: -14, lengthDays: 45, budget: 5000, pricePerPlay: 0.5, discountPct: 100, validity: 'linked-flight-boarding',
    creative: { template: 'goodwill', headline: 'Delayed? Pastry is on us', subline: 'Free pastry with any coffee while you wait', cta: 'Scan for your treat', hi: { headline: 'देरी? पेस्ट्री हमारी तरफ़ से', subline: 'इंतज़ार में किसी भी कॉफ़ी के साथ मुफ़्त पेस्ट्री', cta: 'ट्रीट के लिए स्कैन करें' } } },
  { id: 'cmp-spirits', advertiserId: 'adv-horizon', outletIndex: 0, name: 'Spirits and liqueurs, 25% off', category: 'duty-free', status: 'active',
    weights: { international: 1, couple: 0.6, group: 0.7, '25-34': 0.6, '35-44': 0.7, '45-54': 0.6, male: 0.3 }, filters: { internationalOnly: true }, zones: [...T2_GATES, 'Z-T2-DUTYFREE'],
    startOffsetDays: -20, lengthDays: 40, budget: 15000, pricePerPlay: 2.1, discountPct: 25,
    creative: { template: 'hero-offer', headline: 'Spirits, 25% off tax free', subline: 'Single malts and liqueurs for the journey home', cta: 'Scan for 25% off', hi: { headline: 'स्पिरिट्स, टैक्स फ्री 25% छूट', subline: 'घर के सफ़र के लिए बेहतरीन चयन', cta: '25% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-gold-zarhan', advertiserId: 'adv-horizon', outletIndex: 1, name: 'Zarhan-bound: 10% extra on gold', category: 'duty-free', status: 'active',
    weights: { vfr: 0.8, holiday: 0.6, couple: 0.5, family: 0.5 }, filters: { internationalOnly: true, destinationRegions: ['gulf'], minDwellMinutes: 15, minCrowd: 100 }, zones: T2_GATES,
    startOffsetDays: -10, lengthDays: 30, budget: 8000, pricePerPlay: 2.6, discountPct: 10,
    creative: { template: 'destination', headline: 'Flying to Zarhan? 10% extra on gold', subline: 'Certified jewellery, packed for the trip', cta: 'Scan to unlock', hi: { headline: 'ज़रहान जा रहे हैं? सोने पर 10% अतिरिक्त', subline: 'प्रमाणित आभूषण, सफ़र के लिए पैक', cta: 'अनलॉक करने के लिए स्कैन करें' } } },
  { id: 'cmp-headphones', advertiserId: 'adv-voltpoint', outletIndex: 0, name: 'Noise-cancelling headphones', category: 'electronics', status: 'active',
    weights: { business: 0.8, solo: 0.7, '18-24': 0.5, '25-34': 0.7, '35-44': 0.6, student: 0.5 }, zones: [...T2_GATES, ...T1_GATES, 'Z-T1-PLAZA', 'Z-T2-PLAZA'],
    startOffsetDays: -15, lengthDays: 40, budget: 11000, pricePerPlay: 1.6, discountPct: 18,
    creative: { template: 'hero-offer', headline: 'Silence the cabin, 18% off', subline: 'Noise-cancelling headphones for long flights', cta: 'Scan for 18% off', hi: { headline: 'केबिन की शांति, 18% छूट', subline: 'लंबी उड़ानों के लिए नॉइज़-कैंसलिंग हेडफ़ोन', cta: '18% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-long-reads', advertiserId: 'adv-paperwing', outletIndex: 1, name: 'Long-flight reads, 3 for 2', category: 'books', status: 'active',
    weights: { international: 0.8, '35-44': 0.5, '45-54': 0.6, '55+': 0.7, solo: 0.5, couple: 0.4 }, filters: { minDwellMinutes: 40 }, zones: [...T2_GATES, ...T1_GATES],
    startOffsetDays: -12, lengthDays: 40, budget: 3500, pricePerPlay: 0.5, discountPct: 33,
    creative: { template: 'hero-offer', headline: 'Long flight? Three books for two', subline: 'Bestsellers chosen for the journey', cta: 'Scan to claim', hi: { headline: 'लंबी उड़ान? दो की कीमत में तीन किताबें', subline: 'सफ़र के लिए चुनी हुई बेस्टसेलर', cta: 'क्लेम करने के लिए स्कैन करें' } } },
  { id: 'cmp-chocolate-gift', advertiserId: 'adv-cocoa', outletIndex: 0, name: 'Chocolate gift boxes', category: 'chocolate', status: 'active',
    weights: { vfr: 1, family: 0.6, international: 0.6, '35-44': 0.4, '45-54': 0.5 }, zones: [...T2_GATES, 'Z-T2-DUTYFREE', 'Z-T1-PLAZA'],
    startOffsetDays: -16, lengthDays: 40, budget: 5000, pricePerPlay: 0.9, discountPct: 15,
    creative: { template: 'hero-offer', headline: 'A gift they will remember', subline: 'Handmade chocolate boxes, 15% off', cta: 'Scan for 15% off', hi: { headline: 'एक यादगार तोहफ़ा', subline: 'हाथ से बनी चॉकलेट, 15% छूट', cta: '15% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-thali', advertiserId: 'adv-spiceroute', outletIndex: 0, name: 'Pre-flight thali', category: 'restaurant', status: 'active',
    weights: { vfr: 0.7, family: 0.6, domestic: 0.8, '45-54': 0.4, '55+': 0.5 }, filters: { minDwellMinutes: 30 }, zones: [...T1_GATES, 'Z-T1-PLAZA', 'Z-T2-PLAZA'],
    startOffsetDays: -22, lengthDays: 50, budget: 4000, pricePerPlay: 0.6, discountPct: 10,
    creative: { template: 'hero-offer', headline: 'A proper meal before you fly', subline: 'Seasonal thali, ready in five minutes', cta: 'Scan for 10% off', hi: { headline: 'उड़ान से पहले भरपेट खाना', subline: 'मौसमी थाली, पाँच मिनट में तैयार', cta: '10% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-happy-hour', advertiserId: 'adv-runway', outletIndex: 0, name: 'Runway happy hour', category: 'bar', status: 'active',
    weights: { business: 0.6, group: 0.7, '25-34': 0.6, '35-44': 0.5, male: 0.3 }, zones: [...T2_GATES], hours: [16, 23],
    startOffsetDays: -26, lengthDays: 60, budget: 4500, pricePerPlay: 0.8, discountPct: 30,
    creative: { template: 'countdown-deal', headline: 'Happy hour at the Runway Bar', subline: 'Craft drinks 30% off from 16:00', cta: 'Scan for happy hour', hi: { headline: 'रनवे बार में हैप्पी आवर', subline: '16:00 से ड्रिंक्स पर 30% छूट', cta: 'हैप्पी आवर के लिए स्कैन करें' } } },
  { id: 'cmp-health-kit', advertiserId: 'adv-careway', outletIndex: 0, name: 'Travel health kit', category: 'pharmacy', status: 'active',
    weights: { holiday: 0.6, '55+': 0.7, family: 0.5, u12: 0.3 }, zones: [...T1_GATES, ...T2_GATES],
    startOffsetDays: -30, lengthDays: 60, budget: 2500, pricePerPlay: 0.4, discountPct: 12,
    creative: { template: 'hero-offer', headline: 'Travel health kit, 12% off', subline: 'Everything for a comfortable flight', cta: 'Scan for 12% off', hi: { headline: 'ट्रैवल हेल्थ किट, 12% छूट', subline: 'आरामदायक उड़ान के लिए सब कुछ', cta: '12% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-resort-wear', advertiserId: 'adv-linen', outletIndex: 0, name: 'Resort wear, 20% off', category: 'fashion', status: 'active',
    weights: { holiday: 1, couple: 0.8, female: 0.6, '25-34': 0.6, '35-44': 0.5 }, filters: { destinations: ['SMG', 'SCJ', 'GSZ', 'CPZ', 'BWZ'] }, zones: [...T2_GATES, ...T1_GATES, 'Z-T2-PLAZA'],
    startOffsetDays: -9, lengthDays: 30, budget: 6500, pricePerPlay: 1.1, discountPct: 20,
    creative: { template: 'destination', headline: 'Beach bound? Resort wear 20% off', subline: 'Linen shirts, sundresses and sandals', cta: 'Scan for 20% off', hi: { headline: 'समुद्र तट जा रहे हैं? रिज़ॉर्ट वियर 20% छूट', subline: 'लिनेन शर्ट, सनड्रेस और सैंडल', cta: '20% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-xh-upgrade', advertiserId: 'adv-xh', outletIndex: null, name: 'Halcyon: upgrade to business from 199', category: 'airline', status: 'active',
    weights: { holiday: 0.6, business: 0.3, couple: 0.5, 'frequent-flyer': 0.6 }, filters: { internationalOnly: true }, zones: ['Z-T2-N-41', 'Z-T2-N-47', 'Z-T2-N-53'], triggers: [boarding(1.4)],
    startOffsetDays: -24, lengthDays: 60, budget: 14000, pricePerPlay: 2.2, discountPct: 0, validity: 'linked-flight-boarding',
    creative: { template: 'upgrade', headline: 'Upgrade to Halcyon Business from 199', subline: 'Lie-flat seat tonight. Ask at the gate', cta: 'Scan to upgrade', hi: { headline: 'हैल्सियन बिज़नेस में अपग्रेड, 199 से', subline: 'आज रात लाई-फ़्लैट सीट। गेट पर पूछें', cta: 'अपग्रेड के लिए स्कैन करें' } } },
  { id: 'cmp-xd-lounge', advertiserId: 'adv-xd', outletIndex: null, name: 'Skylark lounge pass for 49', category: 'airline', status: 'active',
    weights: { business: 0.7, domestic: 0.6, solo: 0.5 }, zones: [...T1_GATES, 'Z-T2-N-47'],
    startOffsetDays: -19, lengthDays: 50, budget: 6000, pricePerPlay: 0.9, discountPct: 0,
    creative: { template: 'upgrade', headline: 'Skylark lounge pass, just 49', subline: 'Wi-Fi, snacks and quiet before boarding', cta: 'Scan to buy', hi: { headline: 'स्काइलार्क लाउंज पास, सिर्फ़ 49', subline: 'बोर्डिंग से पहले वाई-फ़ाई, स्नैक्स और शांति', cta: 'खरीदने के लिए स्कैन करें' } } },
  { id: 'cmp-ya-kastell', advertiserId: 'adv-ya', outletIndex: null, name: 'Fly Aurora: Kastell from 399', category: 'airline', status: 'active',
    weights: { holiday: 0.8, couple: 0.6, business: 0.3 }, zones: [...T2_GATES], startOffsetDays: -11, lengthDays: 35, budget: 9000, pricePerPlay: 1.5, discountPct: 0,
    creative: { template: 'destination', headline: 'Kastell from 399 return', subline: 'Book your next trip on Aurora National', cta: 'Scan to book', hi: { headline: 'कास्टेल, 399 से आना-जाना', subline: 'अपनी अगली यात्रा ऑरोरा नेशनल पर बुक करें', cta: 'बुक करने के लिए स्कैन करें' } } },
  { id: 'cmp-bakery', advertiserId: 'adv-gategrind', outletIndex: 0, name: 'Bakery breakfast combo', category: 'coffee', status: 'paused',
    weights: { business: 0.5, family: 0.4, solo: 0.4 }, zones: [...T1_GATES], hours: [4, 11], startOffsetDays: -17, lengthDays: 40, budget: 2000, pricePerPlay: 0.4, discountPct: 15,
    creative: { template: 'countdown-deal', headline: 'Croissant and coffee combo', subline: 'Fresh from the oven every morning', cta: 'Scan for 15% off', hi: { headline: 'क्रोइसां और कॉफ़ी कॉम्बो', subline: 'हर सुबह ओवन से ताज़ा', cta: '15% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-ramen', advertiserId: 'adv-noodle', outletIndex: 0, name: 'Late-night ramen', category: 'restaurant', status: 'active',
    weights: { student: 0.6, '18-24': 0.6, '25-34': 0.5, group: 0.5 }, zones: [...T2_GATES], hours: [20, 24], startOffsetDays: -13, lengthDays: 40, budget: 2500, pricePerPlay: 0.5, discountPct: 15,
    creative: { template: 'countdown-deal', headline: 'Late flight? Hot ramen till 2am', subline: 'Rich broth, ready in four minutes', cta: 'Scan for 15% off', hi: { headline: 'देर की उड़ान? रात 2 बजे तक गरम रेमन', subline: 'गाढ़ा शोरबा, चार मिनट में तैयार', cta: '15% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-smartwatch', advertiserId: 'adv-voltpoint', outletIndex: 1, name: 'Smartwatch launch', category: 'electronics', status: 'pending-approval',
    weights: { business: 0.7, '25-34': 0.7, '35-44': 0.6, 'frequent-flyer': 0.5 }, zones: ['Z-T2-PLAZA', 'Z-T1-PLAZA'], startOffsetDays: 1, lengthDays: 30, budget: 10000, pricePerPlay: 1.9, discountPct: 10,
    creative: { template: 'hero-offer', headline: 'Meet the Pulse 3 smartwatch', subline: 'Launch week: 10% off at VoltPoint', cta: 'Scan for launch price', hi: { headline: 'पल्स 3 स्मार्टवॉच से मिलिए', subline: 'लॉन्च सप्ताह: वोल्टपॉइंट पर 10% छूट', cta: 'लॉन्च कीमत के लिए स्कैन करें' } } },
  { id: 'cmp-festival-hampers', advertiserId: 'adv-mithai', outletIndex: 1, name: 'Festival hampers', category: 'sweets', status: 'pending-approval',
    weights: { vfr: 0.9, family: 0.8, domestic: 0.7 }, zones: [...T1_GATES], triggers: [festival(1.3)], startOffsetDays: 0, lengthDays: 10, budget: 4000, pricePerPlay: 0.9, discountPct: 15,
    creative: { template: 'hero-offer', headline: 'Festival hampers, 15% off', subline: 'Sweets, dry fruit and diyas in one box', cta: 'Scan for 15% off', hi: { headline: 'त्योहार हैम्पर, 15% छूट', subline: 'मिठाई, सूखे मेवे और दीये एक डिब्बे में', cta: '15% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-summer-scents', advertiserId: 'adv-aurelle', outletIndex: 0, name: 'Summer scents', category: 'perfume', status: 'completed',
    weights: { holiday: 0.9, female: 0.6, '25-34': 0.7 }, zones: [...T2_GATES, 'Z-T2-DUTYFREE'], startOffsetDays: -60, lengthDays: 35, budget: 18000, pricePerPlay: 2.2, discountPct: 20,
    creative: { template: 'hero-offer', headline: 'Summer scents, 20% off', subline: 'Light fragrances for warm destinations', cta: 'Scan for 20% off', hi: { headline: 'गर्मियों की खुशबू, 20% छूट', subline: 'गर्म जगहों के लिए हल्की खुशबू', cta: '20% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-iced-latte', advertiserId: 'adv-beanvoyage', outletIndex: 3, name: 'Iced latte season', category: 'coffee', status: 'completed',
    weights: { '18-24': 0.6, '25-34': 0.6, holiday: 0.5 }, zones: [...T2_GATES, ...T1_GATES], startOffsetDays: -55, lengthDays: 30, budget: 6000, pricePerPlay: 0.6, discountPct: 20,
    creative: { template: 'countdown-deal', headline: 'Iced latte, 20% off', subline: 'Cold brew season at Bean Voyage', cta: 'Scan for 20% off', hi: { headline: 'आइस्ड लाटे, 20% छूट', subline: 'बीन वॉयज पर कोल्ड ब्रू सीज़न', cta: '20% छूट के लिए स्कैन करें' } } },
  { id: 'cmp-back-to-school', advertiserId: 'adv-jetsetters', outletIndex: 0, name: 'Back to school bundle', category: 'toys', status: 'completed',
    weights: { family: 1, '12-17': 0.8, u12: 0.6 }, zones: [...T2_GATES, ...T1_GATES], startOffsetDays: -50, lengthDays: 25, budget: 5000, pricePerPlay: 1, discountPct: 25,
    creative: { template: 'hero-offer', headline: 'Back to school bundle, 25% off', subline: 'Games and books for the new term', cta: 'Scan for 25% off', hi: { headline: 'बैक टू स्कूल बंडल, 25% छूट', subline: 'नए सत्र के लिए खेल और किताबें', cta: '25% छूट के लिए स्कैन करें' } } },
];

function nearest(zone: LayoutZone, layout: AirportLayout, at: { x: number; y: number }) {
  return layout.gates
    .filter((g) => g.terminalId === zone.terminalId)
    .map((g) => ({ gate: g.id, distanceM: distanceMetres(at, g.position) }))
    .filter((g) => g.distanceM <= 400)
    .sort((a, b) => a.distanceM - b.distanceM)
    .slice(0, 6);
}

export function generatePlatform(layout: AirportLayout, options: { date: string; seed: number }): PlatformData {
  const prng = new Prng(options.seed ^ 0x9e3779b9);
  const dayStart = Date.parse(`${options.date}T00:00:00Z`);
  const zoneById = new Map(layout.zones.map((z) => [z.id, z]));

  const outlets: Outlet[] = [];
  for (const adv of ADVERTISERS) {
    adv.outlets.forEach((o, i) => {
      const zone = zoneById.get(o.zoneId);
      if (!zone) throw new Error(`outlet zone ${o.zoneId} missing`);
      outlets.push({
        id: `out-${adv.id.slice(4)}-${i + 1}`,
        advertiserId: adv.id,
        name: `${adv.name} (${o.label})`,
        category: adv.category,
        terminalId: zone.terminalId,
        zoneId: zone.id,
        nearestGates: nearest(zone, layout, zone.centroid).slice(0, 3).map((g) => g.gate),
        avgBasket: adv.avgBasket,
        inStock: true,
      });
    });
  }

  // 120 gate-area, 30 retail, 20 landside and 10 security screens
  const perKind = new Map<LayoutZone['kind'], number>([['gate-area', 8], ['retail', 10], ['landside', 10], ['security', 5]]);
  const screens: Screen[] = [];
  let screenNo = 1;
  for (const zone of layout.zones) {
    const count = perKind.get(zone.kind) ?? 0;
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      const position = { x: Math.round(zone.centroid.x + Math.cos(angle) * zone.radius * 0.6), y: Math.round(zone.centroid.y + Math.sin(angle) * zone.radius * 0.45) };
      const portrait = zone.kind === 'gate-area' ? prng.chance(0.6) : prng.chance(0.3);
      const size = prng.pick(zone.kind === 'retail' ? [65, 75, 86] : [43, 55, 65]);
      const roll = prng.next();
      screens.push({
        id: `SCR-${String(screenNo).padStart(3, '0')}`,
        name: `${zone.name} #${i + 1}`,
        terminalId: zone.terminalId,
        zoneId: zone.id,
        sizeInches: size,
        orientation: portrait ? 'portrait' : 'landscape',
        resolution: size >= 75 ? (portrait ? '2160x3840' : '3840x2160') : portrait ? '1080x1920' : '1920x1080',
        position,
        nearestGates: nearest(zone, layout, position),
        vendorId: prng.pick(['ven-luma', 'ven-vista']),
        status: roll < 0.02 ? 'offline' : roll < 0.05 ? 'degraded' : 'online',
        premium: zone.kind === 'retail' || zone.id === 'Z-T2-DUTYFREE' || size >= 75,
      });
      screenNo++;
    }
  }

  const creatives: Creative[] = [];
  const campaigns: Campaign[] = [];
  const dailyStats: DailyStat[] = [];

  for (const seed of CAMPAIGNS) {
    const adv = ADVERTISERS.find((a) => a.id === seed.advertiserId);
    if (!adv) throw new Error(`campaign ${seed.id} has unknown advertiser`);
    const creativeId = `crv-${seed.id.slice(4)}`;
    const start = dayStart + seed.startOffsetDays * DAY;
    const end = start + seed.lengthDays * DAY;
    // Seed prices are per thousand plays; 180 screens playing every 15 s is about a million plays a day
    const pricePerPlay = Math.round((seed.pricePerPlay / 40) * 10_000) / 10_000;
    const budget = seed.budget * 2.5;
    const approved = seed.status !== 'pending-approval';
    creatives.push({
      id: creativeId,
      advertiserId: adv.id,
      name: seed.name,
      template: seed.creative.template,
      content: { headline: seed.creative.headline, subline: seed.creative.subline, cta: seed.creative.cta, accentColor: adv.brandColor, imageAssetId: null },
      translations: { hi: seed.creative.hi },
      approval: approved ? 'approved' : 'pending',
      createdAt: iso(start - 5 * DAY),
    });

    const outlet = seed.outletIndex === null ? null : outlets.filter((o) => o.advertiserId === adv.id).at(seed.outletIndex);
    const dailyCap = Math.round((budget / seed.lengthDays) * 1.3);
    campaigns.push({
      id: seed.id,
      advertiserId: adv.id,
      outletId: outlet?.id ?? null,
      name: seed.name,
      category: seed.category,
      status: seed.status,
      creativeIds: [creativeId],
      targeting: {
        segmentWeights: seed.weights,
        hardFilters: {
          internationalOnly: seed.filters?.internationalOnly ?? false,
          domesticOnly: seed.filters?.domesticOnly ?? false,
          destinationRegions: seed.filters?.destinationRegions ?? [],
          destinations: seed.filters?.destinations ?? [],
          minDwellMinutes: seed.filters?.minDwellMinutes ?? 0,
          minCrowd: seed.filters?.minCrowd ?? 0,
        },
        placement: { zoneIds: seed.zones ?? [], screenIds: [], gates: seed.gates ?? [] },
        triggers: seed.triggers ?? [],
      },
      schedule: { start: iso(start), end: iso(end), dailyHours: { from: seed.hours?.[0] ?? 0, to: seed.hours?.[1] ?? 24 } },
      budget: { total: budget, dailyCap, spent: 0, pricePerPlay, frequencyCapPerScreenHour: 60 },
      offer: {
        headline: seed.creative.headline,
        discountPct: seed.discountPct,
        promoValidity: seed.validity ?? 'linked-flight-boarding',
        fixedMinutes: seed.validity === 'fixed-minutes' ? 45 : null,
        perOfferCap: null,
        familyShare: true,
      },
      brandSafety: { checked: approved, notes: approved ? 'Checklist passed' : '' },
      createdAt: iso(start - 5 * DAY),
    });

    // Daily history for every day the campaign ran inside the 30-day window before the operating day
    const historyFrom = Math.max(start, dayStart - 30 * DAY);
    const historyTo = Math.min(end, dayStart);
    const topSegments = Object.entries(seed.weights).sort((a, b) => (b[1] ?? 0) - (a[1] ?? 0)).slice(0, 4) as [Segment, number][];
    let spent = 0;
    for (let day = historyFrom; day < historyTo; day += DAY) {
      if (seed.status === 'paused' && day > dayStart - 4 * DAY) break;
      const plays = Math.round(prng.float(18_000, 42_000) * (seed.pricePerPlay > 2 ? 0.8 : 1));
      const impressions = Math.round(plays * prng.float(8, 22));
      const scans = Math.round(impressions * prng.float(0.0004, 0.0011));
      const redemptions = Math.round(scans * prng.float(0.35, 0.6));
      const spend = Math.min(dailyCap, Math.round(plays * pricePerPlay * 100) / 100);
      spent += spend;
      const segmentRedemptions: Partial<Record<Segment, number>> = {};
      let left = redemptions;
      topSegments.forEach(([segment, weight], i) => {
        const share = i === topSegments.length - 1 ? left : Math.round(redemptions * (weight / topSegments.reduce((s, [, w]) => s + w, 0)));
        const n = Math.max(0, Math.min(left, share));
        Object.assign(segmentRedemptions, { [segment]: n });
        left -= n;
      });
      dailyStats.push({ campaignId: seed.id, date: iso(day).slice(0, 10), plays, impressions, scans, redemptions, spend, revenue: Math.round(redemptions * adv.avgBasket * prng.float(0.85, 1.2) * 100) / 100, segmentRedemptions });
    }
    const campaign = campaigns.at(-1);
    if (campaign) campaign.budget.spent = Math.round(spent * 100) / 100;
  }

  return { vendors: VENDORS, advertisers: ADVERTISERS.map(({ outlets: _o, avgBasket: _b, ...a }) => a), outlets, screens, creatives, campaigns, dailyStats };
}
