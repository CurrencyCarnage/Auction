const hour = 1000 * 60 * 60;

export const users = Array.from({ length: 5 }, (_, i) => ({
  username: `user${i + 1}`,
  password: `pass${i + 1}`,
  name: `Demo Bidder ${i + 1}`,
  limit: 250000 + i * 25000,
}));

export const seedLots = [
  { id: 'shacman-x3000', brand: 'SHACMAN', model: 'X3000 Tractor Head', type: 'Heavy Truck', location: 'Tbilisi Yard', year: 2022, hours: '41,000 km', increment: 5000, buyNow: 310000, current: 185000, endsIn: 9 * hour + 11 * 60 * 1000, accent: '#56B461', shape: 'truck' },
  { id: 'shacman-f3000-dump', brand: 'SHACMAN', model: 'F3000 Dump Truck', type: 'Dump Truck', location: 'Rustavi', year: 2021, hours: '58,000 km', increment: 4000, buyNow: 255000, current: 146000, endsIn: 7 * hour + 42 * 60 * 1000, accent: '#FBC721', shape: 'dump' },
  { id: 'shacman-l3000-mixer', brand: 'SHACMAN', model: 'L3000 Concrete Mixer', type: 'Mixer Truck', location: 'Kutaisi', year: 2020, hours: '3,900 h', increment: 3000, buyNow: 198000, current: 91000, endsIn: 11 * hour + 5 * 60 * 1000, accent: '#12A24B', shape: 'mixer' },
  { id: 'case-580st', brand: 'CASE', model: '580ST Backhoe Loader', type: 'Backhoe Loader', location: 'Batumi', year: 2019, hours: '4,250 h', increment: 2500, buyNow: 168000, current: 72000, endsIn: 8 * hour + 49 * 60 * 1000, accent: '#FBC721', shape: 'backhoe' },
  { id: 'case-cx220c', brand: 'CASE', model: 'CX220C Excavator', type: 'Excavator', location: 'Tbilisi Yard', year: 2020, hours: '5,100 h', increment: 3000, buyNow: 235000, current: 118000, endsIn: 12 * hour + 18 * 60 * 1000, accent: '#56B461', shape: 'excavator' },
];

export function freshState() {
  const start = Date.now();
  return {
    createdAt: start,
    updatedAt: start,
    lots: seedLots.map((l, i) => ({
      ...l,
      endAt: start + l.endsIn,
      buyRequested: i === 1,
      buyRequests: [],
      bids: [{ user: 'opening', name: 'Opening bid', amount: l.current, at: start - 1000 * 60 * (15 + i * 4), type: 'opening' }],
      proxy: {},
    })),
    audit: [{ at: start, actor: 'system', action: 'state.seeded', detail: { lots: seedLots.length } }],
  };
}

export { hour };
