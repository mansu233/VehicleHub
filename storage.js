/* =========================================================================
   MANSKIT Vehicle Hub — Storage Layer (v4)
   All data lives in localStorage as one JSON blob. No DOM code here.
   ========================================================================= */

const STORAGE_KEY = 'manskit_data_v4';

function uid(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}
function todayISODate() { return new Date().toISOString().slice(0, 10); }

function emptySpecs() {
  return {
    keySpecs: { model: '', variant: '', engine: '', cylinders: '', transmission: '', seatingCapacity: '', fuelType: '' },
    engineOil: { brand: '', grade: '5W-30 Synthetic', partNumber: '' },
    coolantBrake: { brand: '', type: 'DOT 4' },
    tyre: { brand: '', size: '205/55 R16', psi: '33' },
    filters: { cabinFilter: '', airFilter: '', freshenerScent: '' },
    serviceStation: { name: '', contact: '', mechanicNotes: '' }
  };
}

// A payment split always sums to the total amount. Either side can be 0.
function evenSplit(amount) {
  const half = Math.round((amount / 2) * 100) / 100;
  return { you: half, partner: Math.round((amount - half) * 100) / 100 };
}
function splitFromPayer(payer, amount) {
  if (payer === 'You') return { you: amount, partner: 0 };
  if (payer === 'Partner') return { you: 0, partner: amount };
  return evenSplit(amount);
}
// Name-independent categorization — used for internal logic (which radio/
// option to preselect when editing). Display text with the person's actual
// custom name is built separately in app.js (see paymentDisplay()).
function splitKind(split) {
  if (!split) return 'You';
  if (split.partner === 0 && split.you > 0) return 'You';
  if (split.you === 0 && split.partner > 0) return 'Partner';
  return 'Split';
}
function fmtPlain(n) { return Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

function defaultVehicle(name, type) {
  return {
    id: uid('veh'),
    name,
    type, // 'car' | 'bike' | 'other'
    ownership: { mode: 'single', owner: 'you' }, // vehicle-specific ownership
    paymentStatus: 'paid', // 'paid' means no loan/EMI details are needed
    coverZone: DEFAULT_COVER_ZONE,
    specs: emptySpecs(),
    gallery: {},
    acquisition: { exShowroom: 0, taxes: 0, registration: 0 },
    contributions: [],
    loan: { bankName: '', totalLoan: 0, interestRate: 0, tenureMonths: 0 },
    emiPayments: [],
    logs: [],
    logSeq: 0,
    documents: [],
    reminders: [],
    settlements: []
  };
}

function seedData() {
  const car = defaultVehicle('Primary Car', 'car');
  car.specs.keySpecs = { model: '', variant: '', engine: '', cylinders: '', transmission: '', seatingCapacity: '', fuelType: '' };
  car.acquisition = { exShowroom: 14000, taxes: 900, registration: 600 };
  car.loan = { bankName: '', totalLoan: 15000, interestRate: 9.5, tenureMonths: 48 };

  const bike = defaultVehicle('Secondary Bike', 'bike');

  return {
    version: 4,
    activeVehicleId: car.id,
    settings: {
      people: { you: 'You', partner: 'Partner' },
      actionTypes: BUILTIN_ACTION_TYPES.map(t => ({ ...t, categories: [...t.categories] })),
      firebase: { lastSyncedAt: null },
      security: { enabled: false, passwordHash: '', recoveryEmail: '', question: '', answerHash: '' }
    },
    vehicles: { [car.id]: car, [bike.id]: bike }
  };
}

const DB = {
  _data: null,

  load() {
    if (this._data) return this._data;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      try {
        this._data = JSON.parse(raw);
        this._migrate();
        return this._data;
      } catch (e) {
        console.error('Corrupt MANSKIT data, reseeding', e);
      }
    }
    this._data = seedData();
    this.save();
    return this._data;
  },

  _migrate() {
    const d = this._data;
    if (!d.settings) d.settings = {};
    delete d.settings.currency; // currency is now fixed, no longer stored
    if (!d.settings.actionTypes || !d.settings.actionTypes.length) {
      d.settings.actionTypes = BUILTIN_ACTION_TYPES.map(t => ({ ...t, categories: [...t.categories] }));
    }
    d.settings.actionTypes.forEach(t => { if (!t.categories) t.categories = CATEGORY_PRESETS_BY_GROUP[t.group] ? [...CATEGORY_PRESETS_BY_GROUP[t.group]] : []; });
    if (!d.settings.firebase) d.settings.firebase = { lastSyncedAt: null };
    delete d.settings.firebase.databaseURL;
    delete d.settings.firebase.authKey;
    if (!d.settings.security) d.settings.security = { enabled: false, passwordHash: '', recoveryEmail: '', question: '', answerHash: '' };
    if (!d.settings.people) d.settings.people = { you: 'You', partner: 'Partner' };
    if (!d.settings.people.you) d.settings.people.you = 'You';
    if (!d.settings.people.partner) d.settings.people.partner = 'Partner';

    Object.values(d.vehicles || {}).forEach(v => {
      if (!v.coverZone) v.coverZone = DEFAULT_COVER_ZONE;
      if (!v.ownership) v.ownership = { mode: 'single', owner: 'you' };
      if (!v.ownership.mode) v.ownership.mode = 'single';
      if (!v.ownership.owner) v.ownership.owner = 'you';
      if (!v.ownership.ownerName) v.ownership.ownerName = v.ownership.owner === 'partner' ? (d.settings.people.partner || 'Owner') : (d.settings.people.you || 'Owner');
      if (v.ownership.mode === 'partnership' && !v.ownership.partnerName) v.ownership.partnerName = d.settings.people.partner || 'Partner';
      if (!v.specs) v.specs = emptySpecs();
      if (!v.specs.keySpecs) v.specs.keySpecs = emptySpecs().keySpecs;
      if (!v.gallery) v.gallery = {};
      if (!v.acquisition) v.acquisition = { exShowroom: 0, taxes: 0, registration: 0 };
      if (!v.paymentStatus) v.paymentStatus = v.loan?.totalLoan > 0 ? 'financed' : 'paid';
      if (!v.contributions) v.contributions = [];
      if (!v.loan) v.loan = { bankName: '', totalLoan: 0, interestRate: 0, tenureMonths: 0 };
      if (!v.emiPayments) v.emiPayments = [];
      if (!v.logs) v.logs = [];
      if (!v.documents) v.documents = [];
      if (!v.reminders) v.reminders = [];
      v.reminders.forEach(r => { if (r.recurrence && !r.recurrence.interval) r.recurrence = null; });
      if (!v.settlements) v.settlements = [];
      if (typeof v.logSeq !== 'number') v.logSeq = v.logs.length;
      // Migrate legacy paidBy -> split
      v.logs.forEach(l => {
        if (!l.split) { l.split = splitFromPayer(l.paidBy || 'You', l.amount || 0); delete l.paidBy; }
        if (v.ownership.mode !== 'partnership') l.settlementType = 'personal';
        else if (!l.settlementType) l.settlementType = 'shared';
        if (typeof l.note !== 'string') l.note = '';
      });
      v.emiPayments.forEach(e => { if (!e.split) { e.split = splitFromPayer(e.paidBy || 'You', e.amount || 0); delete e.paidBy; } });
    });
  },

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._data));
    window.dispatchEvent(new CustomEvent('manskit:changed'));
  },

  getAll() { return this.load(); },

  getActiveVehicle() {
    const d = this.load();
    return d.vehicles[d.activeVehicleId] || Object.values(d.vehicles)[0];
  },
  setActiveVehicle(id) {
    const d = this.load();
    if (d.vehicles[id]) { d.activeVehicleId = id; this.save(); }
  },
  listVehicles() { return Object.values(this.load().vehicles); },

  addVehicle(name, type) {
    const d = this.load();
    const v = defaultVehicle(name || 'New Vehicle', type || 'car');
    d.vehicles[v.id] = v;
    d.activeVehicleId = v.id;
    this.save();
    return v;
  },
  renameVehicle(id, name, type, ownership) {
    const v = this.load().vehicles[id];
    if (!v) return;
    if (name) v.name = name;
    if (type) v.type = type;
    if (ownership) v.ownership = { ...v.ownership, ...ownership };
    this.save();
  },
  deleteVehicle(id) {
    const d = this.load();
    if (Object.keys(d.vehicles).length <= 1) return false;
    delete d.vehicles[id];
    if (d.activeVehicleId === id) d.activeVehicleId = Object.keys(d.vehicles)[0];
    this.save();
    return true;
  },
  clearVehicleData(id) {
    const d = this.load();
    const old = d.vehicles[id];
    if (!old) return;
    const fresh = defaultVehicle(old.name, old.type);
    fresh.id = old.id;
    fresh.coverZone = DEFAULT_COVER_ZONE;
    d.vehicles[id] = fresh;
    this.save();
  },

  // ---- Specs --------------------------------------
  updateSpecSection(vehicleId, sectionKey, valueObj) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.specs[sectionKey] = { ...v.specs[sectionKey], ...valueObj };
    this.save();
  },

  // ---- Gallery --------------------------------------
  setGalleryPhoto(vehicleId, zone, dataURL) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.gallery[zone] = dataURL;
    this.save();
  },
  removeGalleryPhoto(vehicleId, zone) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    delete v.gallery[zone];
    this.save();
  },
  setCoverZone(vehicleId, zone) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.coverZone = zone;
    this.save();
  },

  // ---- Acquisition & contributions --------------------------------------
  updateAcquisition(vehicleId, obj) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.acquisition = { ...v.acquisition, ...obj };
    this.save();
  },
  addContribution(vehicleId, entry) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    entry.id = uid('contrib');
    v.contributions.unshift(entry);
    this.save();
  },
  updateContribution(vehicleId, id, patch) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    const c = v.contributions.find(c => c.id === id);
    if (c) { Object.assign(c, patch); this.save(); }
  },
  deleteContribution(vehicleId, id) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.contributions = v.contributions.filter(c => c.id !== id);
    this.save();
  },

  // ---- Loan & EMI --------------------------------------
  updateLoan(vehicleId, obj) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.loan = { ...v.loan, ...obj };
    this.save();
  },
  addEmiPayment(vehicleId, entry) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    entry.id = uid('emi');
    v.emiPayments.unshift(entry);
    this.save();
  },
  updateEmiPayment(vehicleId, id, patch) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    const e = v.emiPayments.find(e => e.id === id);
    if (e) { Object.assign(e, patch); this.save(); }
  },
  deleteEmiPayment(vehicleId, id) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.emiPayments = v.emiPayments.filter(e => e.id !== id);
    this.save();
  },

  // ---- Logs --------------------------------------
  addLog(vehicleId, entry) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    entry.id = uid('log');
    entry.seq = ++v.logSeq;
    v.logs.unshift(entry);
    this.save();
    return entry;
  },
  updateLog(vehicleId, logId, patch) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    const log = v.logs.find(l => l.id === logId);
    if (log) { Object.assign(log, patch); this.save(); }
  },
  deleteLog(vehicleId, logId) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.logs = v.logs.filter(l => l.id !== logId);
    this.save();
  },

  // ---- Odometer ordering helpers --------------------------------------
  // Highest odometer reading recorded for the vehicle (optionally excluding
  // one log, e.g. the entry currently being edited).
  getMaxOdometer(vehicleId, excludeLogId) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return 0;
    let max = 0;
    v.logs.forEach(l => {
      if (l.id === excludeLogId) return;
      if (typeof l.odometer === 'number' && l.odometer > max) max = l.odometer;
    });
    return max;
  },
  // True if this log currently holds the vehicle's highest odometer value
  // (and is therefore the only entry safe to re-number without breaking
  // the increasing sequence for everything logged after it).
  isLatestOdometerLog(vehicleId, logId) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return true;
    const log = v.logs.find(l => l.id === logId);
    if (!log) return true;
    const maxOthers = this.getMaxOdometer(vehicleId, logId);
    return log.odometer >= maxOthers;
  },

  // ---- Action types & categories --------------------------------------
  listActionTypes() { return this.load().settings.actionTypes; },
  addActionType(type) {
    const d = this.load();
    type.id = uid('type');
    type.builtin = false;
    if (!type.categories) type.categories = CATEGORY_PRESETS_BY_GROUP[type.group] ? [...CATEGORY_PRESETS_BY_GROUP[type.group]] : [];
    d.settings.actionTypes.push(type);
    this.save();
    return type;
  },
  updateActionType(id, patch) {
    const d = this.load();
    const t = d.settings.actionTypes.find(t => t.id === id);
    if (t) { Object.assign(t, patch); this.save(); }
  },
  deleteActionType(id) {
    const d = this.load();
    if (d.settings.actionTypes.length <= 1) return false;
    d.settings.actionTypes = d.settings.actionTypes.filter(t => t.id !== id);
    this.save();
    return true;
  },
  setActionTypeCategories(id, categories) {
    const d = this.load();
    const t = d.settings.actionTypes.find(t => t.id === id);
    if (t) { t.categories = categories; this.save(); }
  },

  getPeopleNames() { return this.load().settings.people; },
  updatePeopleNames(patch) {
    const d = this.load();
    d.settings.people = { ...d.settings.people, ...patch };
    this.save();
  },

  updateFirebaseSettings(patch) {
    const d = this.load();
    d.settings.firebase = { ...d.settings.firebase, ...patch };
    this.save();
  },

  // ---- App Lock / security --------------------------------------
  getSecurity() { return this.load().settings.security; },
  updateSecurity(patch) {
    const d = this.load();
    d.settings.security = { ...d.settings.security, ...patch };
    this.save();
  },

  // ---- Documents (fix #4) --------------------------------------
  addDocument(vehicleId, doc) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    doc.id = uid('doc');
    v.documents.unshift(doc);
    this.save();
    return doc;
  },
  updateDocument(vehicleId, id, patch) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    const doc = v.documents.find(d => d.id === id);
    if (doc) { Object.assign(doc, patch); this.save(); }
  },
  deleteDocument(vehicleId, id) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.documents = v.documents.filter(d => d.id !== id);
    this.save();
  },

  // ---- Reminders / notifications (fix #5) --------------------------------------
  addReminder(vehicleId, reminder) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    reminder.id = uid('rem');
    reminder.notifiedDate = null;
    v.reminders.unshift(reminder);
    this.save();
    return reminder;
  },
  updateReminder(vehicleId, id, patch) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    const r = v.reminders.find(r => r.id === id);
    if (r) { Object.assign(r, patch); this.save(); }
  },
  deleteReminder(vehicleId, id) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.reminders = v.reminders.filter(r => r.id !== id);
    this.save();
  },
  // Upserts a reminder linked to a specific document (by docId) so editing
  // a document's expiry date keeps its auto-reminder in sync instead of
  // creating duplicates. Renewal recurrence is stored on the reminder.
  upsertDocumentReminder(vehicleId, docId, title, dueDate, recurrence) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    let r = v.reminders.find(r => r.docId === docId);
    if (r) { r.title = title; r.dueDate = dueDate; r.recurrence = recurrence; r.notifiedDate = null; }
    else v.reminders.unshift({ id: uid('rem'), docId, title, type: 'Custom', dueDate, recurrence, notifiedDate: null });
    this.save();
  },

  // ---- Settlement adjustments / "settle up" (fix #7) --------------------------------------
  // Records an adjustment that zeroes out the running balance as of now.
  // Past raw entries are untouched — this just adds an offsetting record.
  settleBalance(vehicleId) {
    const current = this.computeSettlement(vehicleId);
    if (current === 0) return null;
    const v = this.load().vehicles[vehicleId];
    const entry = { id: uid('settle'), date: todayISODate(), amount: current };
    v.settlements.unshift(entry);
    this.save();
    return entry;
  },
  deleteSettlement(vehicleId, id) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return;
    v.settlements = v.settlements.filter(s => s.id !== id);
    this.save();
  },

  // ---- Computed: expenditure, distance, settlement --------------------------------------
  computeStats(vehicleId) {
    const v = this.load().vehicles[vehicleId];
    const stats = {
      totalExpenditure: 0, byGroup: { expense: 0, maintenance: 0, damage: 0 },
      acquisitionTotal: 0, emiPaidTotal: 0, distance: 0, costPerKm: 0, entryCount: 0
    };
    if (!v) return stats;

    stats.acquisitionTotal = (v.acquisition.exShowroom || 0) + (v.acquisition.taxes || 0) + (v.acquisition.registration || 0);
    stats.emiPaidTotal = v.emiPayments.reduce((sum, e) => sum + (e.amount || 0), 0);

    let minOdo = Infinity, maxOdo = -Infinity;
    v.logs.forEach(log => {
      const amt = log.amount || 0;
      if (stats.byGroup[log.group] !== undefined) stats.byGroup[log.group] += amt;
      if (typeof log.odometer === 'number' && !isNaN(log.odometer)) {
        minOdo = Math.min(minOdo, log.odometer);
        maxOdo = Math.max(maxOdo, log.odometer);
      }
    });
    stats.entryCount = v.logs.length;
    stats.distance = isFinite(maxOdo - minOdo) ? Math.max(0, maxOdo - minOdo) : 0;

    const runningCosts = stats.byGroup.expense + stats.byGroup.maintenance + stats.byGroup.damage;
    stats.totalExpenditure = stats.acquisitionTotal + stats.emiPaidTotal + runningCosts;
    stats.costPerKm = stats.distance > 0 ? stats.totalExpenditure / stats.distance : 0;

    return stats;
  },

  // Positive = partner owes you. Negative = you owe partner.
  // Personal (non-shared) entries never affect this — they're one person's
  // own cost, not a joint one. Past "settle up" adjustments are subtracted
  // from the running total so the ledger returns to zero once settled.
  computeSettlement(vehicleId) {
    const v = this.load().vehicles[vehicleId];
    if (!v) return 0;
    let balance = 0;
    v.logs.forEach(l => {
      if (l.settlementType === 'personal') return;
      if (l.split) balance += (l.split.you - l.split.partner) / 2;
    });
    v.emiPayments.forEach(e => { if (e.split) balance += (e.split.you - e.split.partner) / 2; });
    v.contributions.forEach(c => {
      if (c.payer === 'You') balance += (c.amount || 0) / 2;
      else if (c.payer === 'Partner') balance -= (c.amount || 0) / 2;
    });
    v.settlements.forEach(s => { balance -= s.amount || 0; });
    return Math.round(balance * 100) / 100;
  },

  // Personal (non-shared) spend, split out per person — informational only,
  // shown separately from the settlement ledger since nothing is owed.
  computePersonalSpend(vehicleId) {
    const v = this.load().vehicles[vehicleId];
    const totals = { you: 0, partner: 0 };
    if (!v) return totals;
    v.logs.forEach(l => {
      if (l.settlementType !== 'personal' || !l.split) return;
      totals.you += l.split.you || 0;
      totals.partner += l.split.partner || 0;
    });
    return totals;
  },

  // ---- Backup / restore --------------------------------------
  exportJSON() { return JSON.stringify(this.load(), null, 2); },
  importJSON(jsonStr) {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || !parsed.vehicles) throw new Error('Not a valid MANSKIT backup file.');
    this._data = parsed;
    this._migrate();
    this.save();
  },
  replaceAll(dataObj) {
    this._data = dataObj;
    this._migrate();
    this.save();
  },
  reset() {
    this._data = seedData();
    this.save();
  }
};

// Compress an image file to a reasonable size before storing as a base64
// data URL (localStorage has limited capacity).
function compressImageFile(file, maxDim = 900, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
          else { width = Math.round(width * (maxDim / height)); height = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ---- Lightweight hashing for the local App Lock ---------------------------
// This is a device passcode, not encryption. We prefer the Web Crypto API
// (SHA-256) when available (any https/localhost context); on a plain
// file:// page where crypto.subtle is unavailable, we fall back to a small
// pure-JS hash so the feature still works everywhere.
async function hashText(text) {
  if (window.crypto && window.crypto.subtle && window.isSecureContext) {
    try {
      const buf = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) { /* fall through to JS fallback */ }
  }
  // djb2-style fallback hash — fine for a local device lock, not for
  // anything security-critical.
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
    hash = hash & hash;
  }
  return 'fb' + Math.abs(hash).toString(16);
}
