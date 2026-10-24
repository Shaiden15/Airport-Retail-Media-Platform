import { XMLBuilder, XMLParser } from 'fast-xml-parser';

// IATA AIDX FlightLegNotifRQ, shaped like data/aodb-samples/AIDX_FlightLegNotifRQ_XH960_arrival_ILLUSTRATIVE.xml

export interface AidxTime {
  qualifier: 'ONB' | 'OFB' | 'TDN' | 'TKO';
  type: 'SCT' | 'EST' | 'ACT';
  at: string;
}

export interface AidxNotification {
  transactionId: string;
  sequence: number;
  timestamp: string;
  originator: string;
  leg: { airline: string; flightNumber: string; departureAirport: string; arrivalAirport: string; originDate: string };
  domestic: boolean | null;
  publicStatus: string | null;
  operationalStatus: string | null;
  remark: string | null;
  codeshares: { airline: string; flightNumber: string }[];
  resources: { usage: string; direction: 'Departure' | 'Arrival'; stand: string | null; gate: string | null; belt: string | null; terminal: string | null } | null;
  times: AidxTime[];
  aircraft: { type: string; registration: string } | null;
  cabins: { cls: string; seats: number; pax: number }[];
  delays: { code: string; minutes: number }[];
}

const NS = 'http://www.iata.org/IATA/2007/00';
const XML_DECLARATION = '<?xml version="1.0" encoding="UTF-8"?>';

// XMLBuilder escapes every value, so no markup is ever assembled from strings
const builder = new XMLBuilder({ ignoreAttributes: false, attributeNamePrefix: '@', textNodeName: '#text', suppressEmptyNode: true, format: false });

const optional = (value: string | null | undefined) => (value === null || value === undefined || value === '' ? undefined : value);

export function buildAidxXml(n: AidxNotification): string {
  const r = n.resources;
  const legData = {
    ...(n.domestic === null ? {} : { '@InternalDomesticIndicator': String(n.domestic) }),
    PublicStatus: optional(n.publicStatus),
    OperationalStatus: optional(n.operationalStatus),
    ServiceType: 'J',
    RemarkFreeText: optional(n.remark),
    CodeShareInfo: n.codeshares.length ? n.codeshares.map((c) => ({ Airline: c.airline, FlightNumber: c.flightNumber })) : undefined,
    AirportResources: r
      ? {
          '@Usage': r.usage,
          Resource: {
            '@DepartureOrArrival': r.direction,
            AircraftParkingPosition: optional(r.stand),
            PassengerGate: optional(r.gate),
            BaggageClaimUnit: optional(r.belt),
            AircraftTerminal: optional(r.terminal),
          },
        }
      : undefined,
    OperationTime: n.times.length ? n.times.map((t) => ({ '@OperationQualifier': t.qualifier, '@CodeContext': '9750', '@TimeType': t.type, '#text': t.at })) : undefined,
    Delay: n.delays.length ? n.delays.map((d) => ({ '@DelayCode': d.code, '@Duration': `PT${d.minutes}M` })) : undefined,
    AircraftInfo: n.aircraft ? { AircraftType: n.aircraft.type, Registration: n.aircraft.registration, TailNumber: n.aircraft.registration } : undefined,
    CabinClass: n.cabins.length ? n.cabins.map((c) => ({ '@Class': c.cls, SeatCapacity: String(c.seats), PaxCount: String(c.pax) })) : undefined,
  };
  const document = {
    IATA_AIDX_FlightLegNotifRQ: {
      '@xmlns': NS,
      '@Version': '16.1',
      '@Target': 'Test',
      '@TimeStamp': n.timestamp,
      '@TransactionIdentifier': n.transactionId,
      '@SequenceNmbr': String(n.sequence),
      Originator: { '@CompanyShortName': n.originator, '@TravelSector': '5', '@Code': n.originator, '@CodeContext': '3' },
      DeliveringSystem: { '@CompanyShortName': 'AODB' },
      FlightLeg: {
        LegIdentifier: {
          Airline: { '@CodeContext': '3', '#text': n.leg.airline },
          FlightNumber: n.leg.flightNumber,
          DepartureAirport: { '@CodeContext': '3', '#text': n.leg.departureAirport },
          ArrivalAirport: { '@CodeContext': '3', '#text': n.leg.arrivalAirport },
          OriginDate: n.leg.originDate,
        },
        LegData: legData,
      },
    },
  };
  return XML_DECLARATION + String(builder.build(document));
}

const ARRAYS = new Set(['OperationTime', 'CabinClass', 'CodeShareInfo', 'Delay', 'Resource']);

// Entity processing off: no entity expansion, no external references (XXE safe)
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: true,
  isArray: (name) => ARRAYS.has(name),
});

type Node = Record<string, unknown>;

function child(node: unknown, key: string): unknown {
  if (typeof node !== 'object' || node === null) return undefined;
  return new Map(Object.entries(node)).get(key);
}

function text(node: unknown, key: string): string | null {
  const value = child(node, key);
  if (value === undefined || value === null) return null;
  if (typeof value === 'object') {
    const inner = child(value, '#text');
    return inner === undefined ? null : String(inner);
  }
  return String(value);
}

function list(node: unknown, key: string): Node[] {
  const value = child(node, key);
  return Array.isArray(value) ? (value as Node[]) : [];
}

const DURATION = /^PT(\d+)M$/;

export function parseAidxXml(xml: string): AidxNotification {
  const doc = parser.parse(xml) as Node;
  const root = child(doc, 'IATA_AIDX_FlightLegNotifRQ');
  if (!root) throw new Error('not an IATA_AIDX_FlightLegNotifRQ message');
  const legNode = child(root, 'FlightLeg');
  const id = child(legNode, 'LegIdentifier');
  const data = child(legNode, 'LegData');
  if (!id || !data) throw new Error('AIDX message has no FlightLeg/LegIdentifier/LegData');

  const leg = {
    airline: text(id, 'Airline') ?? '',
    flightNumber: text(id, 'FlightNumber') ?? '',
    departureAirport: text(id, 'DepartureAirport') ?? '',
    arrivalAirport: text(id, 'ArrivalAirport') ?? '',
    originDate: text(id, 'OriginDate') ?? '',
  };
  if (!leg.airline || !leg.flightNumber) throw new Error('AIDX LegIdentifier is incomplete');

  const resourcesNode = child(data, 'AirportResources');
  const resource = list(resourcesNode, 'Resource').at(0);
  const domesticAttr = text(data, '@InternalDomesticIndicator');
  const aircraftNode = child(data, 'AircraftInfo');

  return {
    transactionId: text(root, '@TransactionIdentifier') ?? '',
    sequence: Number(text(root, '@SequenceNmbr') ?? 0),
    timestamp: text(root, '@TimeStamp') ?? '',
    originator: text(child(root, 'Originator'), '@Code') ?? '',
    leg,
    domestic: domesticAttr === null ? null : domesticAttr === 'true',
    publicStatus: text(data, 'PublicStatus'),
    operationalStatus: text(data, 'OperationalStatus'),
    remark: text(data, 'RemarkFreeText'),
    codeshares: list(data, 'CodeShareInfo').map((c) => ({ airline: text(c, 'Airline') ?? '', flightNumber: text(c, 'FlightNumber') ?? '' })),
    resources: resource
      ? {
          usage: text(resourcesNode, '@Usage') ?? 'Planned',
          direction: text(resource, '@DepartureOrArrival') === 'Arrival' ? 'Arrival' : 'Departure',
          stand: text(resource, 'AircraftParkingPosition'),
          gate: text(resource, 'PassengerGate'),
          belt: text(resource, 'BaggageClaimUnit'),
          terminal: text(resource, 'AircraftTerminal'),
        }
      : null,
    times: list(data, 'OperationTime').map((t) => ({
      qualifier: (text(t, '@OperationQualifier') ?? 'ONB') as AidxTime['qualifier'],
      type: (text(t, '@TimeType') ?? 'SCT') as AidxTime['type'],
      at: text(t, '#text') ?? '',
    })),
    aircraft: aircraftNode ? { type: text(aircraftNode, 'AircraftType') ?? '', registration: text(aircraftNode, 'Registration') ?? '' } : null,
    cabins: list(data, 'CabinClass').map((c) => ({ cls: text(c, '@Class') ?? '', seats: Number(text(c, 'SeatCapacity') ?? 0), pax: Number(text(c, 'PaxCount') ?? 0) })),
    delays: list(data, 'Delay').map((d) => ({ code: text(d, '@DelayCode') ?? '', minutes: Number(DURATION.exec(text(d, '@Duration') ?? '')?.[1] ?? 0) })),
  };
}
