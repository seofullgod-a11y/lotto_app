// lotteries.js — registry of supported lottery types.
// kind 'government' = rich GLO structure (1st/near/2nd-5th/front3/back3/back2).
// kind 'simple'     = 3 ตัวบน (top3) + 2 ตัวล่าง (bottom2); 2 ตัวบน derived.
// ---------------------------------------------------------------------------

export const LOTTERIES = [
  { code: 'government', name: 'สลากกินแบ่งรัฐบาล', short: 'รัฐบาล', category: 'รัฐบาล', kind: 'government', schedule: 'ออกวันที่ 1 และ 16 ของเดือน' },

  { code: 'lao_dev',    name: 'หวยลาวพัฒนา',  short: 'ลาวพัฒนา', category: 'ลาว',   kind: 'simple', schedule: 'จันทร์ / พุธ / ศุกร์' },
  { code: 'lao_hd',     name: 'หวยลาว HD',    short: 'ลาว HD',  category: 'ลาว',   kind: 'simple', schedule: 'ทุกวัน' },
  { code: 'lao_star',   name: 'หวยลาวสตาร์', short: 'ลาวสตาร์', category: 'ลาว',   kind: 'simple', schedule: 'ทุกวัน' },

  { code: 'hanoi',         name: 'หวยฮานอยปกติ',  short: 'ฮานอย',     category: 'ฮานอย', kind: 'simple', schedule: 'ทุกวัน 18:30' },
  { code: 'hanoi_vip',     name: 'หวยฮานอย VIP',  short: 'ฮานอย VIP', category: 'ฮานอย', kind: 'simple', schedule: 'ทุกวัน 19:30' },
  { code: 'hanoi_special', name: 'หวยฮานอยพิเศษ', short: 'ฮานอยพิเศษ', category: 'ฮานอย', kind: 'simple', schedule: 'ทุกวัน 17:30' },

  { code: 'stock_th_am', name: 'หุ้นไทยเช้า', short: 'ไทยเช้า', category: 'หุ้นไทย', kind: 'simple', schedule: 'จ.–ศ. 10:00' },
  { code: 'stock_th_pm', name: 'หุ้นไทยบ่าย', short: 'ไทยบ่าย', category: 'หุ้นไทย', kind: 'simple', schedule: 'จ.–ศ. 16:30' },

  { code: 'stock_nikkei_am',   name: 'หุ้นนิเคอิเช้า',  short: 'นิเคอิเช้า',  category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_nikkei_pm',   name: 'หุ้นนิเคอิบ่าย',  short: 'นิเคอิบ่าย',  category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_hangseng_am', name: 'หุ้นฮั่งเส็งเช้า', short: 'ฮั่งเส็งเช้า', category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_hangseng_pm', name: 'หุ้นฮั่งเส็งบ่าย', short: 'ฮั่งเส็งบ่าย', category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_china_am',    name: 'หุ้นจีนเช้า',     short: 'จีนเช้า',     category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_china_pm',    name: 'หุ้นจีนบ่าย',     short: 'จีนบ่าย',     category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_taiwan',      name: 'หุ้นไต้หวัน',     short: 'ไต้หวัน',     category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_korea',       name: 'หุ้นเกาหลี',      short: 'เกาหลี',      category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_singapore',   name: 'หุ้นสิงคโปร์',    short: 'สิงคโปร์',    category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_india',       name: 'หุ้นอินเดีย',     short: 'อินเดีย',     category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_egypt',       name: 'หุ้นอียิปต์',     short: 'อียิปต์',     category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'ทุกวัน' },
  { code: 'stock_russia',      name: 'หุ้นรัสเซีย',     short: 'รัสเซีย',     category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_german',      name: 'หุ้นเยอรมัน',     short: 'เยอรมัน',     category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_england',     name: 'หุ้นอังกฤษ',      short: 'อังกฤษ',      category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'จ.–ศ.' },
  { code: 'stock_dowjones',    name: 'หุ้นดาวโจนส์',    short: 'ดาวโจนส์',    category: 'หุ้นต่างประเทศ', kind: 'simple', schedule: 'อ.–ส. (เช้ามืด)' },
];

const BY_CODE = Object.fromEntries(LOTTERIES.map((l) => [l.code, l]));

export function getLottery(code) {
  return BY_CODE[code] || null;
}
export function isValidLottery(code) {
  return !!BY_CODE[code];
}
export function lotteryKind(code) {
  return BY_CODE[code]?.kind || null;
}

// Grouped for UI menus: [{category, items:[...]}]
export function lotteriesByCategory() {
  const order = ['รัฐบาล', 'ลาว', 'ฮานอย', 'หุ้นไทย', 'หุ้นต่างประเทศ'];
  const groups = {};
  for (const l of LOTTERIES) (groups[l.category] ||= []).push(l);
  return order.filter((c) => groups[c]).map((category) => ({ category, items: groups[category] }));
}

// Empty canonical draw for a given kind.
export function blankDraw(kind, date) {
  if (kind === 'government') {
    return { date, first: '', near1: [], front3: [], back3: [], back2: '', second: [], third: [], fourth: [], fifth: [] };
  }
  return { date, top3: '', bottom2: '' };
}
