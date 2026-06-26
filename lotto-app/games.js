// games.js — pure logic for the engagement features (no I/O)
// ---------------------------------------------------------------------------

// ---- prediction game scoring -------------------------------------------
export const PTS_WIN = 10;
export function scoreGuess(guess, back2) {
  const g = String(guess || '').replace(/\D/g, '').padStart(2, '0');
  const w = String(back2 || '').replace(/\D/g, '').padStart(2, '0');
  return !!w && g === w;
}
// points for a win given current streak (streak counts this win)
export function winPoints(streak) {
  return PTS_WIN + Math.max(0, streak - 1) * 2;
}

// ---- dream book (ทำนายฝัน) fallback when no AI key ----------------------
// common Thai dream symbols -> associated numbers (เพื่อความบันเทิง)
export const DREAMBOOK = [
  { kw: ['งูใหญ่', 'งูเหลือม', 'อนาคอนดา'], nums: ['89', '56', '5'], say: 'งูใหญ่ หมายถึงเนื้อคู่หรือโชคก้อนใหญ่' },
  { kw: ['งู'], nums: ['89', '56'], say: 'งู เป็นสัญลักษณ์ของเนื้อคู่และโชคลาภ' },
  { kw: ['น้ำ', 'น้ำท่วม', 'แม่น้ำ', 'ทะเล'], nums: ['27', '72', '7'], say: 'น้ำ หมายถึงเงินทองไหลมา' },
  { kw: ['ฟัน', 'ฟันหัก', 'ฟันหลุด'], nums: ['42', '24', '2'], say: 'ฟันหลุด มักเตือนเรื่องญาติผู้ใหญ่' },
  { kw: ['พระ', 'วัด', 'ทำบุญ'], nums: ['39', '93', '9'], say: 'พระ หมายถึงสิ่งศักดิ์สิทธิ์คุ้มครอง' },
  { kw: ['เด็ก', 'ทารก', 'อุ้มเด็ก'], nums: ['11', '14', '1'], say: 'เด็ก หมายถึงเรื่องดีกำลังจะเกิด' },
  { kw: ['ตาย', 'คนตาย', 'ศพ', 'โลงศพ'], nums: ['04', '40', '0'], say: 'ฝันเรื่องตาย มักกลับกันคือเรื่องดี อายุยืน' },
  { kw: ['ช้าง'], nums: ['91', '19', '1'], say: 'ช้าง หมายถึงบารมีและความมั่นคง' },
  { kw: ['เสือ'], nums: ['30', '03', '3'], say: 'เสือ หมายถึงอำนาจและผู้ใหญ่' },
  { kw: ['ปลา'], nums: ['18', '81', '8'], say: 'ปลา หมายถึงความอุดมสมบูรณ์' },
  { kw: ['ทอง', 'ทองคำ', 'สร้อยทอง'], nums: ['59', '95', '9'], say: 'ทอง หมายถึงโชคลาภเงินทอง' },
  { kw: ['ผี', 'วิญญาณ'], nums: ['00', '07', '0'], say: 'ผี มักให้โชคเป็นเลขท้าย' },
  { kw: ['แต่งงาน', 'เจ้าสาว', 'เจ้าบ่าว'], nums: ['63', '36', '6'], say: 'งานแต่ง หมายถึงข่าวดีและคู่' },
  { kw: ['รถ', 'รถยนต์', 'ขับรถ'], nums: ['25', '52', '5'], say: 'รถ หมายถึงการเดินทางและความก้าวหน้า' },
  { kw: ['ไฟ', 'ไฟไหม้'], nums: ['77', '70', '7'], say: 'ไฟ หมายถึงพลังและการเปลี่ยนแปลง' },
];

export function dreamFallback(text) {
  const t = String(text || '');
  for (const e of DREAMBOOK) {
    if (e.kw.some((k) => t.includes(k))) {
      return { numbers: e.nums, interpretation: e.say, source: 'ตำราฝัน' };
    }
  }
  // generic: derive from text length / chars (entertainment)
  let sum = 0;
  for (const ch of t) sum += ch.charCodeAt(0);
  const two = String(sum % 100).padStart(2, '0');
  const three = String(sum % 1000).padStart(3, '0');
  return { numbers: [two, three], interpretation: 'ตีความจากความฝันของคุณเป็นเลขนำโชค', source: 'สุ่มจากความฝัน' };
}

// ---- personal lucky numbers (เลขศาสตร์) ---------------------------------
function reduceTo2(n) {
  let x = Math.abs(parseInt(n, 10) || 0);
  while (x >= 100) x = String(x).split('').reduce((s, d) => s + +d, 0);
  return String(x).padStart(2, '0');
}
// from a birthdate yyyy-mm-dd -> a few lucky numbers
export function luckyFromBirthdate(iso) {
  const m = String(iso || '').match(/(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, y, mo, d] = m;
  const dd = +d, mm = +mo, yy = +y;
  const digitsum = (n) => String(n).split('').reduce((s, x) => s + +x, 0);
  const core = reduceTo2(dd + mm + digitsum(yy));
  const a = String(dd).padStart(2, '0');
  const b = reduceTo2(dd * mm);
  const three = String((dd * 100 + mm * 7 + digitsum(yy)) % 1000).padStart(3, '0');
  return { numbers: [core, a, b, three].filter((v, i, arr) => arr.indexOf(v) === i) };
}
