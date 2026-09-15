/* =========================================================================
   MANSKIT Vehicle Hub — App / UI Layer (v4)
   ========================================================================= */

let selectedActionTypeId = null;
let editingLogId = null;
let pendingProofDataUrl = null;
let activeLogsSubtab = 'maintenance';
let showAllLogs = false;
let logFilters = {}; 

// ---- Boot -----------------------------------------------------------------

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(err => console.error('SW registration failed:', err));
}

document.addEventListener('DOMContentLoaded', () => {
  DB.load();
  selectedActionTypeId = DB.listActionTypes()[0].id;
  setDefaultEntryDate();
  document.getElementById('vehicle-switcher').addEventListener('change', (e) => {
    DB.setActiveVehicle(e.target.value);
  });
  document.getElementById('entry-proof').addEventListener('change', handleProofFileChange);
  document.addEventListener('blur', applyAutomaticTitleCase, true);
  renderAll();
  requireEmailSignIn();
});

window.addEventListener('manskit:changed', renderAll);

function setDefaultEntryDate() {
  const dateInput = document.getElementById('entry-date');
  if (dateInput && !dateInput.value) dateInput.value = todayDateStr();
}

function applyAutomaticTitleCase(event) {
  const el = event.target;
  if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
  if (el.type !== 'text' && el.tagName !== 'TEXTAREA') return;
  if (['auth-email', 'auth-password', 'auth-reset-email', 'lock-password-input', 'lock-answer-input', 'lock-new-password'].includes(el.id)) return;
  if (el.id.includes('registration')) {
    el.value = normalizeRegistrationNumber(el.value);
    return;
  }
  el.value = capitalizeFirst(el.value);
}

// ---- Toasts / Modal / Nav helpers ------------------------------------------

function toast(message, kind = 'default') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2600);
}

function openModal(innerHtml) {
  document.getElementById('modal-sheet').innerHTML = innerHtml;
  document.getElementById('modal-backdrop').classList.remove('hidden');
}
function closeModal() {
  document.getElementById('modal-backdrop').classList.add('hidden');
  document.getElementById('modal-sheet').innerHTML = '';
}
function closeModalOnBackdrop(event) {
  if (event.target.id === 'modal-backdrop') closeModal();
}

function switchTab(screenId, element) {
  document.querySelectorAll('.app-screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.bottom-nav .nav-item').forEach(i => i.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  element.classList.add('active');
}

function switchLogsSubtab(name, element) {
  activeLogsSubtab = name;
  document.querySelectorAll('.logs-subtab').forEach(s => s.classList.remove('active'));
  document.getElementById(`logs-subtab-${name}`).classList.add('active');
  document.querySelectorAll('#screen-logs .pill').forEach(p => p.classList.remove('active'));
  element.classList.add('active');
}

// ---- Pinch-zoom viewer ------------------------------------------

function openZoomViewer(src) {
  const viewer = document.getElementById('zoom-viewer');
  const img = document.getElementById('zoom-image');
  img.src = src;
  img.style.transform = '';
  viewer.classList.remove('hidden');
  attachPinchZoom(document.getElementById('zoom-container'), img);
}
function closeZoomViewer() { document.getElementById('zoom-viewer').classList.add('hidden'); }

// ---- Settings overlay ------------------------------------------

function openSettings() {
  document.getElementById('settings-overlay').classList.remove('hidden');
  renderSettingsBody();
}
function closeSettings() { document.getElementById('settings-overlay').classList.add('hidden'); }

// ---- Master render ------------------------------------------

function renderAll() {
  renderVehicleSwitcher();
  refreshPeopleLabels();
  renderActionPills();
  selectSettlementType(selectedSettlementType);
  renderDashboard();
  applyFieldsForSelectedType();
  updateOdometerHintForNewEntry();
  renderProfileScreen();
  renderFinanceScreen();
  renderLogsScreen();
  if (!document.getElementById('settings-overlay').classList.contains('hidden')) renderSettingsBody();
}

function renderVehicleSwitcher() {
  const d = DB.getAll();
  const sel = document.getElementById('vehicle-switcher');
  sel.innerHTML = Object.values(d.vehicles).map(v =>
    `<option value="${v.id}" ${v.id === d.activeVehicleId ? 'selected' : ''}>${escapeHtml(v.name)}</option>`
  ).join('');
}

/* =========================================================================
   SCREEN 1 — QUICK ENTRY
   ========================================================================= */

function renderActionPills() {
  const types = DB.listActionTypes();
  if (!types.find(t => t.id === selectedActionTypeId)) selectedActionTypeId = types[0].id;
  const el = document.getElementById('action-pills');
  el.innerHTML = types.map(t => `
    <button type="button" class="pill ${t.id === selectedActionTypeId ? 'active' : ''}"
            onclick="selectActionType('${t.id}')">${t.icon} ${escapeHtml(t.label)}</button>
  `).join('');
}

function getActionType(id) {
  return DB.listActionTypes().find(t => t.id === id) || DB.listActionTypes()[0];
}

function selectActionType(id) {
  selectedActionTypeId = id;
  document.querySelectorAll('#action-pills .pill').forEach(p => p.classList.remove('active'));
  const btn = [...document.querySelectorAll('#action-pills .pill')].find(b => b.getAttribute('onclick') === `selectActionType('${id}')`);
  if (btn) btn.classList.add('active');
  applyFieldsForSelectedType();
}

function applyFieldsForSelectedType() {
  const type = getActionType(selectedActionTypeId);
  const isDamage = type.group === 'damage';

  document.getElementById('fields-category').classList.toggle('hidden', isDamage);
  document.getElementById('fields-damage').classList.toggle('hidden', !isDamage);
  document.getElementById('entry-workshop-group').classList.toggle('hidden', type.group !== 'maintenance');
  document.getElementById('entry-amount-label').textContent = isDamage ? `Repair Cost (${CURRENCY})` : `Amount Paid (${CURRENCY})`;

  if (isDamage) {
    const zoneSelect = document.getElementById('entry-damage-zone');
    zoneSelect.innerHTML = GALLERY_ZONES.map(z => `<option value="${z}">${ZONE_LABELS[z]}</option>`).join('');
  } else {
    const catSelect = document.getElementById('entry-category-select');
    catSelect.innerHTML = (type.categories && type.categories.length ? type.categories : ['Other']).map(c => `<option value="${c}">${c}</option>`).join('');
    handleCategorySelectChange();
  }
}

function handleCategorySelectChange() {
  const val = document.getElementById('entry-category-select').value;
  document.getElementById('entry-category-other-group').classList.toggle('hidden', val !== 'Other');
}

// ---- Odometer ordering (fix #4) ------------------------------------------

function updateOdometerHintForNewEntry() {
  if (editingLogId) return; // edit mode manages its own hint/lock
  const vehicle = DB.getActiveVehicle();
  const maxOdo = DB.getMaxOdometer(vehicle.id);
  const input = document.getElementById('entry-odometer');
  input.min = maxOdo;
  input.disabled = false;
  input.readOnly = false;
  document.getElementById('entry-odometer-hint').textContent = maxOdo > 0
    ? `Must be ${fmt(maxOdo)} KM or higher (your last recorded reading).`
    : 'This is your first entry — enter the current reading.';
}

// ---- Payment split UI (fix #5) ------------------------------------------

let selectedSettlementType = 'personal';

function selectSettlementType(type) {
  if (!activeVehicleHasPartnership()) type = 'personal';
  selectedSettlementType = type;
  document.getElementById('entry-settlement-group')?.classList.toggle('hidden', !activeVehicleHasPartnership());
  document.querySelectorAll('.settlement-type-pills .pill').forEach(p => p.classList.toggle('active', p.dataset.settlement === type));
  const names = peopleNames();
  const paidBySelect = document.getElementById('entry-paid-by');
  const currentKind = splitKind(readCurrentFormSplitGuess());
  if (type === 'personal') {
    document.getElementById('entry-paid-by-label').textContent = 'Who Bore This Cost';
    renderPaidBySelect(paidBySelect, currentKind === 'Split' ? 'You' : currentKind, false);
    document.getElementById('entry-split-group').classList.add('hidden');
    document.getElementById('settlement-type-hint').textContent = `This is ${names.you}'s own expense — it won't affect the settlement ledger.`;
  } else {
    document.getElementById('entry-paid-by-label').textContent = 'Paid By';
    renderPaidBySelect(paidBySelect, currentKind, true);
    document.getElementById('entry-split-group').classList.toggle('hidden', paidBySelect.value !== 'Split');
    document.getElementById('settlement-type-hint').textContent = 'Shared costs (purchase, most maintenance) split the bill between ${names.you} and ${names.partner}. Personal costs (a solo trip, your own fine) don\'t create a debt.';
  }
}
// Best-effort read of whatever's currently selected, used only to keep the
// Paid By choice stable when toggling Shared/Personal mid-entry.
function readCurrentFormSplitGuess() {
  const val = document.getElementById('entry-paid-by').value;
  if (val === 'Split') return { you: 1, partner: 1 };
  return splitFromPayer(val || 'You', 1);
}

function handlePaidByChange() {
  const val = document.getElementById('entry-paid-by').value;
  document.getElementById('entry-split-group').classList.toggle('hidden', val !== 'Split' || selectedSettlementType === 'personal');
  if (val === 'Split') initSplitFields();
}
function currentAmount() { return parseFloat(document.getElementById('entry-amount').value) || 0; }
function initSplitFields() {
  const amount = currentAmount();
  const even = evenSplit(amount);
  document.getElementById('entry-split-you').value = even.you;
  document.getElementById('entry-split-partner').value = even.partner;
  updateSplitRemaining();
}
function handleAmountChange() {
  if (document.getElementById('entry-paid-by').value === 'Split') updateSplitRemaining();
}
function handleSplitYouChange() {
  const amount = currentAmount();
  const you = parseFloat(document.getElementById('entry-split-you').value) || 0;
  document.getElementById('entry-split-partner').value = Math.round((amount - you) * 100) / 100;
  updateSplitRemaining();
}
function handleSplitPartnerChange() {
  const amount = currentAmount();
  const partner = parseFloat(document.getElementById('entry-split-partner').value) || 0;
  document.getElementById('entry-split-you').value = Math.round((amount - partner) * 100) / 100;
  updateSplitRemaining();
}
function updateSplitRemaining() {
  const amount = currentAmount();
  const you = parseFloat(document.getElementById('entry-split-you').value) || 0;
  const partner = parseFloat(document.getElementById('entry-split-partner').value) || 0;
  const diff = Math.round((amount - you - partner) * 100) / 100;
  const el = document.getElementById('entry-split-remaining');
  el.textContent = diff === 0 ? 'Splits match the total ✓' : `Off by ${CURRENCY}${fmt(Math.abs(diff))} — adjust so both add up to the total.`;
  el.classList.toggle('error-text', diff !== 0);
}
// ---- Custom people names (used in place of hardcoded "You"/"Partner") ----

function peopleNames() {
  const vehicle = DB.getActiveVehicle();
  const ownership = vehicle?.ownership || {};
  const fallback = DB.getPeopleNames() || { you: 'You', partner: 'Partner' };
  return { you: ownership.ownerName || fallback.you || 'Owner', partner: ownership.partnerName || fallback.partner || 'Partner' };
}
function activeVehicleHasPartnership() { return DB.getActiveVehicle()?.ownership?.mode === 'partnership'; }
// Display text for a payment split, using the person's actual chosen names.
function paymentDisplay(split) {
  if (!split) return '—';
  const names = peopleNames();
  const kind = splitKind(split);
  if (kind === 'You') return names.you;
  if (kind === 'Partner') return names.partner;
  return `Split (${names.you} ${fmt(split.you)} / ${names.partner} ${fmt(split.partner)})`;
}
function renderPaidBySelect(selectEl, currentKind, allowSplit = true) {
  const names = peopleNames();
  if (!activeVehicleHasPartnership()) {
    selectEl.innerHTML = `<option value="You" selected>${escapeHtml(names.you)}</option>`;
    return;
  }
  selectEl.innerHTML = `
    <option value="You" ${currentKind === 'You' ? 'selected' : ''}>${escapeHtml(names.you)}</option>
    <option value="Partner" ${currentKind === 'Partner' ? 'selected' : ''}>${escapeHtml(names.partner)}</option>
    ${allowSplit ? `<option value="Split" ${currentKind === 'Split' ? 'selected' : ''}>Split (custom amounts)</option>` : ''}
  `;
}
// Re-applies custom names to the Quick Entry form's Paid By select and
// split field labels. Called on every render pass so a name change in
// Settings shows up immediately.
function refreshPeopleLabels() {
  const names = peopleNames();
  const paidBySelect = document.getElementById('entry-paid-by');
  if (paidBySelect) renderPaidBySelect(paidBySelect, paidBySelect.value || 'You', selectedSettlementType !== 'personal');
  const youLabel = document.getElementById('entry-split-you-label');
  const partnerLabel = document.getElementById('entry-split-partner-label');
  if (youLabel) youLabel.textContent = `${names.you} Paid`;
  if (partnerLabel) partnerLabel.textContent = `${names.partner} Paid`;
}

function readSplitFromForm(amount) {
  if (!activeVehicleHasPartnership()) return splitFromPayer('You', amount);
  const paidBy = document.getElementById('entry-paid-by').value;
  if (selectedSettlementType === 'personal') return splitFromPayer(paidBy, amount);
  if (paidBy === 'Split') {
    return {
      you: parseFloat(document.getElementById('entry-split-you').value) || 0,
      partner: parseFloat(document.getElementById('entry-split-partner').value) || 0
    };
  }
  return splitFromPayer(paidBy, amount);
}

// ---- Expandable note (fix #2) ------------------------------------------

function toggleNoteField(forceOpen) {
  const group = document.getElementById('entry-note-group');
  const toggle = document.getElementById('entry-note-toggle');
  const willOpen = forceOpen !== undefined ? forceOpen : group.classList.contains('hidden');
  group.classList.toggle('hidden', !willOpen);
  toggle.textContent = willOpen ? '− Hide Note' : '+ Add Note';
  if (willOpen) document.getElementById('entry-note').focus();
}

// ---- Proof photo ------------------------------------------

function handleProofFileChange(e) {
  const file = e.target.files[0];
  const preview = document.getElementById('entry-proof-preview');
  if (!file) { pendingProofDataUrl = null; preview.innerHTML = ''; return; }
  compressImageFile(file).then(dataUrl => {
    pendingProofDataUrl = dataUrl;
    preview.innerHTML = `<img src="${dataUrl}" alt="Receipt preview">`;
  });
}

// ---- Form submit ------------------------------------------

function handleFormSubmit(event) {
  event.preventDefault();
  const vehicle = DB.getActiveVehicle();
  const type = getActionType(selectedActionTypeId);
  const isDamage = type.group === 'damage';

  const odometer = parseFloat(document.getElementById('entry-odometer').value);
  const odometerInput = document.getElementById('entry-odometer');

  // Enforce increasing odometer order (fix #4)
  if (!odometerInput.disabled) {
    const excludeId = editingLogId || undefined;
    const minAllowed = DB.getMaxOdometer(vehicle.id, excludeId);
    if (odometer < minAllowed) {
      toast(`Odometer must be ${fmt(minAllowed)} KM or higher to keep entries in order.`, 'error');
      return;
    }
  }

  const amount = parseFloat(document.getElementById('entry-amount').value);
  const split = readSplitFromForm(amount);
  if (activeVehicleHasPartnership() && selectedSettlementType === 'shared' && Math.round((amount - split.you - split.partner) * 100) / 100 !== 0) {
    toast('The custom split amounts must add up to the total.', 'error');
    return;
  }

  const entry = {
    actionTypeId: type.id,
    group: type.group,
    time: document.getElementById('entry-date').value, // date-only (fix #3)
    odometer,
    amount,
    split,
    settlementType: activeVehicleHasPartnership() ? selectedSettlementType : 'personal',
    note: capitalizeFirst(document.getElementById('entry-note').value.trim()),
    proof: pendingProofDataUrl
  };

  if (isDamage) {
    entry.zone = document.getElementById('entry-damage-zone').value;
    entry.description = capitalizeFirst(document.getElementById('entry-damage-desc').value);
    entry.status = document.getElementById('entry-damage-status').value;
  } else {
    const catVal = document.getElementById('entry-category-select').value;
    entry.category = catVal === 'Other'
      ? capitalizeFirst(document.getElementById('entry-category-other').value || 'Other')
      : catVal;
    if (type.group === 'maintenance') entry.workshop = capitalizeFirst(document.getElementById('entry-workshop').value);
  }

  if (editingLogId) {
    DB.updateLog(vehicle.id, editingLogId, entry);
    toast('Entry updated');
    cancelEditLog();
  } else {
    DB.addLog(vehicle.id, entry);
    toast('Entry saved ✓');
    resetQuickEntryForm();
  }
  document.activeElement && document.activeElement.blur(); // fix #8: dismiss mobile keyboard
}

function resetQuickEntryForm() {
  document.getElementById('quick-entry-form').reset();
  pendingProofDataUrl = null;
  document.getElementById('entry-proof-preview').innerHTML = '';
  setDefaultEntryDate();
  document.getElementById('entry-split-group').classList.add('hidden');
  toggleNoteField(false);
  selectSettlementType('personal');
  applyFieldsForSelectedType();
  updateOdometerHintForNewEntry();
}

function editLogEntry(logId) {
  const vehicle = DB.getActiveVehicle();
  const log = vehicle.logs.find(l => l.id === logId);
  if (!log) return;

  editingLogId = logId;
  selectActionType(log.actionTypeId);

  document.getElementById('entry-date').value = log.time;

  // Odometer edit lock (fix #4): only the latest reading can be changed.
  const odometerInput = document.getElementById('entry-odometer');
  const isLatest = DB.isLatestOdometerLog(vehicle.id, log.id);
  odometerInput.value = log.odometer;
  const hint = document.getElementById('entry-odometer-hint');
  if (isLatest) {
    odometerInput.disabled = false;
    odometerInput.readOnly = false;
    const minBound = DB.getMaxOdometer(vehicle.id, log.id);
    odometerInput.min = minBound;
    hint.textContent = `Must stay ${fmt(minBound)} KM or higher.`;
  } else {
    odometerInput.disabled = true;
    odometerInput.readOnly = true;
    hint.textContent = 'Only the most recent entry\'s odometer can be edited, to keep readings in increasing order. Delete and re-add this entry if it needs correcting.';
  }

  document.getElementById('entry-amount').value = log.amount;
  pendingProofDataUrl = log.proof || null;
  document.getElementById('entry-proof-preview').innerHTML = log.proof ? `<img src="${log.proof}" alt="Receipt preview">` : '';

  // Settlement type (fix #3) — set this first since it controls whether
  // the Paid By select even offers a Split option.
  selectSettlementType(log.settlementType || 'shared');

  // Payment split
  const kind = log.split ? splitKind(log.split) : 'You';
  const paidBySelect = document.getElementById('entry-paid-by');
  renderPaidBySelect(paidBySelect, kind, log.settlementType !== 'personal');
  if (kind === 'You' || kind === 'Partner') {
    document.getElementById('entry-split-group').classList.add('hidden');
  } else {
    paidBySelect.value = 'Split';
    document.getElementById('entry-split-group').classList.remove('hidden');
    document.getElementById('entry-split-you').value = log.split.you;
    document.getElementById('entry-split-partner').value = log.split.partner;
    updateSplitRemaining();
  }

  // Note (fix #2)
  toggleNoteField(!!log.note);
  document.getElementById('entry-note').value = log.note || '';

  if (log.group === 'damage') {
    document.getElementById('entry-damage-zone').value = log.zone;
    document.getElementById('entry-damage-desc').value = log.description || '';
    document.getElementById('entry-damage-status').value = log.status || 'Pending';
  } else {
    const catSelect = document.getElementById('entry-category-select');
    const hasPreset = [...catSelect.options].some(o => o.value === log.category);
    catSelect.value = hasPreset ? log.category : 'Other';
    handleCategorySelectChange();
    if (!hasPreset) document.getElementById('entry-category-other').value = log.category;
    if (log.group === 'maintenance') document.getElementById('entry-workshop').value = log.workshop || '';
  }

  document.getElementById('entry-submit-btn').textContent = 'Update Entry';
  document.getElementById('entry-cancel-edit').classList.remove('hidden');
  switchTab('screen-quick-entry', document.querySelector('.bottom-nav .nav-item'));
  window.scrollTo(0, 0);
}

function cancelEditLog() {
  editingLogId = null;
  document.getElementById('entry-submit-btn').textContent = 'Save Entry';
  document.getElementById('entry-cancel-edit').classList.add('hidden');
  resetQuickEntryForm();
}

function deleteLogEntry(logId) {
  openModal(`
    <h3>Delete this entry?</h3>
    <p class="hint-text">This can't be undone.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" onclick="DB.deleteLog(DB.getActiveVehicle().id, '${logId}'); closeModal(); toast('Entry deleted')">Delete</button>
    </div>
  `);
}

function renderDashboard() {
  const vehicle = DB.getActiveVehicle();
  const dateEl = document.getElementById('dashboard-date');
  if (dateEl) dateEl.textContent = formatDateOnly(todayDateStr());
  const today = new Date(todayDateStr() + 'T00:00:00');
  const docs = (vehicle.documents || []).filter(d => d.expiryDate && (new Date(d.expiryDate + 'T00:00:00') - today) / 86400000 <= 30).sort((a,b) => a.expiryDate.localeCompare(b.expiryDate));
  const reminders = (vehicle.reminders || []).filter(r => r.dueDate && (new Date(r.dueDate + 'T00:00:00') - today) / 86400000 <= 30).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
  const ownership = vehicle.ownership?.mode === 'partnership' ? `Partnership · ${vehicle.ownership.ownerName || peopleNames().you} & ${vehicle.ownership.partnerName || peopleNames().partner}` : `Single owner · ${vehicle.ownership?.ownerName || peopleNames().you}`;
  const card = (title, items, empty, alert, tone) => `<div class="dashboard-card ${tone || ''} ${alert && items.length ? 'alert' : ''}"><h3>${title}</h3><div class="dashboard-list">${items.length ? items.slice(0,4).map(x => `<div>${escapeHtml(x.label)} <span class="hint-text">· ${escapeHtml(formatDateOnly(x.date))}</span></div>`).join('') : `<span class="hint-text">${empty}</span>`}</div></div>`;
  const el = document.getElementById('dashboard-alerts');
  if (el) el.innerHTML = `<div class="dashboard-card vehicle-card"><h3>MANSKIT Vehicle</h3><div class="dashboard-list vehicle-details"><strong class="vehicle-name">${escapeHtml(vehicle.name)}</strong>${vehicle.registrationNumber ? `<span class="vehicle-registration">Registration: ${escapeHtml(vehicle.registrationNumber)}</span>` : '<span class="vehicle-registration empty-registration">Registration number not added</span>'}</div></div>` + card('Near expiry documents', docs.map(d => ({label:d.type, date:d.expiryDate})), 'All documents are clear for 30 days.', true, 'document-card') + card('Reminders', reminders.map(r => ({label:r.title, date:r.dueDate})), 'No reminders due in the next 30 days.', true, 'reminder-card') + `<div class="dashboard-card ownership-card"><h3>Vehicle ownership</h3><div class="dashboard-list">${escapeHtml(ownership)}</div></div>`;
}

/* =========================================================================
   SCREEN 2 — VEHICLE PROFILE, SPECS & GALLERY
   ========================================================================= */

const SPEC_SECTION_META = {
  keySpecs: { title: 'Key Specifications', fields: KEY_SPEC_FIELDS },
  engineOil: { title: 'Engine Oil & Filter', fields: [['brand', 'Brand'], ['grade', 'Grade'], ['partNumber', 'Part Number']] },
  coolantBrake: { title: 'Coolant & Brake Fluid', fields: [['brand', 'Approved Brand'], ['type', 'Type']] },
  tyre: { title: 'Tyre Specifications', fields: [['brand', 'Brand'], ['size', 'Size'], ['psi', 'Recommended PSI']] },
  filters: { title: 'Filters & Consumables', fields: [['cabinFilter', 'Cabin Filter'], ['airFilter', 'Air Filter'], ['freshenerScent', 'Air Freshener Scent']] },
  serviceStation: { title: 'Preferred Service Station', fields: [['name', 'Workshop Name'], ['contact', 'Contact'], ['mechanicNotes', 'Mechanic Notes']] }
};

function renderProfileScreen() {
  const vehicle = DB.getActiveVehicle();

  const coverPhoto = vehicle.gallery[vehicle.coverZone];
  document.getElementById('cover-card').innerHTML = `
    <div class="cover-photo ${coverPhoto ? '' : 'empty'}" onclick="${coverPhoto ? `openZoomViewer('${coverPhoto}')` : `triggerZoneUpload('${vehicle.coverZone}')`}">
      ${coverPhoto ? `<img src="${coverPhoto}" alt="${escapeHtml(vehicle.name)}">` : `<span>Tap to add cover photo (${ZONE_LABELS[vehicle.coverZone]})</span>`}
    </div>
    <div class="cover-caption">
      <strong>${escapeHtml(vehicle.name)}</strong>
      <span class="hint-text">${capitalizeFirst(vehicle.type)} · ${vehicle.registrationNumber ? escapeHtml(vehicle.registrationNumber) + ' · ' : ''}${vehicle.ownership?.mode === 'partnership' ? 'Partnership' : 'Single owner'}</span>
    </div>
  `;

  Object.keys(SPEC_SECTION_META).forEach(key => {
    const meta = SPEC_SECTION_META[key];
    const data = vehicle.specs[key] || {};
    const el = document.getElementById(`spec-${key}`);
    el.innerHTML = meta.fields.map(([fk, label]) => `
      <div class="spec-row"><span>${label}:</span> <strong>${escapeHtml(data[fk] || '—')}</strong></div>
    `).join('');
  });

  renderGallery();
  renderDamageTable();
  renderDocumentsList();
  renderRemindersList();
}

function openSpecEditor(sectionKey) {
  const vehicle = DB.getActiveVehicle();
  const meta = SPEC_SECTION_META[sectionKey];
  const data = vehicle.specs[sectionKey] || {};
  const rowsHtml = meta.fields.map(([fk, label]) => `
    <div class="form-group">
      <label>${label}</label>
      <input type="text" class="spec-field-input" data-field="${fk}" value="${escapeAttr(data[fk] || '')}">
    </div>
  `).join('');
  openModal(`
    <h3>Edit ${meta.title}</h3>
    <div id="spec-editor-fields">${rowsHtml}</div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveSpecEditor('${sectionKey}')">Save</button>
    </div>
  `);
}
function saveSpecEditor(sectionKey) {
  const inputs = document.querySelectorAll('#spec-editor-fields .spec-field-input');
  const obj = {};
  inputs.forEach(i => { obj[i.dataset.field] = capitalizeFirst(i.value.trim()); });
  DB.updateSpecSection(DB.getActiveVehicle().id, sectionKey, obj);
  closeModal();
  toast('Specs updated');
}

// ---- Gallery ------------------------------------------

function renderGallery() {
  const vehicle = DB.getActiveVehicle();
  const grid = document.getElementById('photo-grid');
  const customZones = Object.keys(vehicle.gallery || {}).filter(zone => !GALLERY_ZONES.includes(zone));
  const zones = [...GALLERY_ZONES, ...customZones];
  grid.innerHTML = zones.map(zone => {
    const photo = vehicle.gallery[zone];
    const isCover = vehicle.coverZone === zone;
    const label = vehicle.galleryLabels?.[zone] || ZONE_LABELS[zone] || 'Custom Photo';
    return `
      <div class="photo-zone ${photo ? 'has-photo' : ''}" onclick="handlePhotoZoneTap('${zone}')">
        ${photo ? `<img src="${photo}" alt="${escapeHtml(label)}">` : `<span>${escapeHtml(label)}</span>`}
        ${isCover ? '<span class="cover-badge">Cover</span>' : ''}
      </div>
    `;
  }).join('');
}

function handlePhotoZoneTap(zone) {
  const vehicle = DB.getActiveVehicle();
  const existing = vehicle.gallery[zone];
  const label = vehicle.galleryLabels?.[zone] || ZONE_LABELS[zone] || 'Custom Photo';
  if (existing) {
    openModal(`
      <h3>${escapeHtml(label)}</h3>
      <img src="${existing}" alt="${escapeHtml(label)}" class="modal-photo-preview" onclick="openZoomViewer('${existing}')">
      <p class="hint-text">Tap the photo to pinch-zoom and inspect closely.</p>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-secondary" onclick="triggerZoneUpload('${zone}')">Replace</button>
        <button class="btn-danger" onclick="removeZonePhoto('${zone}')">Remove</button>
      </div>
      ${vehicle.coverZone !== zone ? `<button class="btn-secondary" onclick="setCoverZoneAction('${zone}')">Set as Cover Photo</button>` : ''}
    `);
  } else {
    triggerZoneUpload(zone);
  }
}

function triggerZoneUpload(zone) {
  closeModal();
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.capture = 'environment';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const dataUrl = await compressImageFile(file);
    DB.setGalleryPhoto(DB.getActiveVehicle().id, zone, dataUrl);
    toast('Photo saved');
  };
  input.click();
}
function openCustomPhotoUpload() {
  openModal(`
    <h3>Add Custom Photo</h3>
    <div class="form-group"><label>Photo Name</label><input type="text" id="custom-photo-label" placeholder="e.g. Insurance Sticker"></div>
    <div class="form-group"><label>Photo</label><input type="file" id="custom-photo-file" accept="image/*" capture="environment"></div>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveCustomPhoto()">Save Photo</button></div>
  `);
}
async function saveCustomPhoto() {
  const label = capitalizeFirst(document.getElementById('custom-photo-label').value.trim()) || 'Custom Photo';
  const file = document.getElementById('custom-photo-file').files[0];
  if (!file) { toast('Choose a photo first'); return; }
  const zone = `custom_${Date.now()}`;
  const dataUrl = await compressImageFile(file);
  const vehicleId = DB.getActiveVehicle().id;
  DB.setGalleryPhoto(vehicleId, zone, dataUrl);
  DB.setGalleryLabel(vehicleId, zone, label);
  closeModal();
  toast('Custom photo saved');
}
function removeZonePhoto(zone) {
  DB.removeGalleryPhoto(DB.getActiveVehicle().id, zone);
  closeModal();
  toast('Photo removed');
}
function setCoverZoneAction(zone) {
  DB.setCoverZone(DB.getActiveVehicle().id, zone);
  closeModal();
  toast('Cover photo updated');
}

// ---- Damage log table ------------------------------------------

function noteHtml(log) {
  if (!log.note) return '';
  return `<details class="log-note"><summary>Note</summary><p>${escapeHtml(log.note)}</p></details>`;
}

function renderDamageTable() {
  const vehicle = DB.getActiveVehicle();
  const entries = vehicle.logs.filter(l => l.group === 'damage').sort(sortByTimeDesc);
  const el = document.getElementById('damage-table');
  if (!entries.length) { el.innerHTML = `<p class="hint-text">No damage logged yet.</p>`; return; }

  el.innerHTML = entries.map(log => `
    <div class="card log-card">
      <div class="log-card-top">
        <strong>${ZONE_LABELS[log.zone] || log.zone}</strong>
        <span class="accent-text">${CURRENCY}${fmt(log.amount)}</span>
      </div>
      <div class="log-card-meta">${escapeHtml(log.description || '')} · ${formatDateOnly(log.time)}</div>
      <div class="log-card-meta">
        <span class="status-badge status-${(log.status || 'Pending').toLowerCase()}">${log.status || 'Pending'}</span>
        · ${log.split ? paymentDisplay(log.split) : ''}
      </div>
      ${log.proof ? `<img src="${log.proof}" class="log-thumb" onclick="openZoomViewer('${log.proof}')" alt="Damage photo">` : ''}
      ${noteHtml(log)}
      <div class="log-card-actions">
        <button class="btn-chip" onclick="toggleDamageStatus('${log.id}')">Toggle Status</button>
        <button class="btn-chip" onclick="editLogEntry('${log.id}')">Edit</button>
        <button class="btn-chip btn-chip-danger" onclick="deleteLogEntry('${log.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}
function toggleDamageStatus(logId) {
  const vehicle = DB.getActiveVehicle();
  const log = vehicle.logs.find(l => l.id === logId);
  if (!log) return;
  DB.updateLog(vehicle.id, logId, { status: log.status === 'Fixed' ? 'Pending' : 'Fixed' });
}

/* =========================================================================
   DOCUMENTS (fix #4)
   ========================================================================= */

function docExpiryBadge(expiryDate) {
  if (!expiryDate) return '';
  const days = Math.ceil((new Date(expiryDate + 'T00:00:00') - new Date(todayDateStr() + 'T00:00:00')) / 86400000);
  if (days < 0) return `<span class="status-badge status-pending">Expired</span>`;
  if (days <= 30) return `<span class="status-badge status-pending">Expires in ${days}d</span>`;
  return `<span class="status-badge status-fixed">Valid</span>`;
}

function renderDocumentsList() {
  const vehicle = DB.getActiveVehicle();
  const el = document.getElementById('documents-list');
  if (!vehicle.documents.length) { el.innerHTML = `<p class="hint-text">No documents added yet.</p>`; return; }
  el.innerHTML = vehicle.documents.map(doc => `
    <div class="card log-card">
      <div class="log-card-top">
        <strong>${escapeHtml(doc.type)}</strong>
        ${docExpiryBadge(doc.expiryDate)}
      </div>
      <div class="log-card-meta">
        ${doc.number ? 'No: ' + escapeHtml(doc.number) : ''}
        ${doc.expiryDate ? ' · Expires ' + formatDateOnly(doc.expiryDate) : ''}
      </div>
      ${doc.photo ? `<img src="${doc.photo}" class="log-thumb" onclick="openZoomViewer('${doc.photo}')" alt="${escapeHtml(doc.type)}">` : ''}
      <div class="log-card-actions">
        <button class="btn-chip" onclick="openEditDocument('${doc.id}')">Edit</button>
        <button class="btn-chip btn-chip-danger" onclick="confirmDeleteDocument('${doc.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function documentFormHtml(doc) {
  const isCustom = doc && !DOCUMENT_TYPES.includes(doc.type);
  return `
    <div class="form-group"><label>Document Type</label>
      <select id="doc-type" onchange="document.getElementById('doc-type-other-group').classList.toggle('hidden', this.value !== 'Other')">
        ${DOCUMENT_TYPES.map(t => `<option value="${t}" ${(doc ? (isCustom ? t === 'Other' : doc.type === t) : t === 'RC (Registration Certificate)') ? 'selected' : ''}>${t}</option>`).join('')}
      </select>
    </div>
    <div class="form-group ${isCustom ? '' : 'hidden'}" id="doc-type-other-group">
      <label>Specify Type</label>
      <input type="text" id="doc-type-other" value="${isCustom ? escapeAttr(doc.type) : ''}">
    </div>
    <div class="form-group"><label>Document Number</label><input type="text" id="doc-number" value="${doc ? escapeAttr(doc.number || '') : ''}" placeholder="Optional"></div>
    <div class="form-group"><label>Expiry Date</label><input type="date" id="doc-expiry" value="${doc ? (doc.expiryDate || '') : ''}"></div>
    <div class="form-group"><label class="checkbox-row"><input type="checkbox" id="doc-renewal-enabled" ${doc?.renewalRecurrence ? 'checked' : ''} onchange="toggleRecurrenceFields('doc')"> Renew automatically</label></div>
    <div id="doc-recurrence-fields" class="recurrence-fields ${doc?.renewalRecurrence ? '' : 'hidden'}"><div class="form-group"><label>Renewal cycle</label><div class="inline-fields"><input type="number" id="doc-renewal-interval" min="1" step="1" value="${doc?.renewalRecurrence?.interval || 1}"><select id="doc-renewal-unit"><option value="months" ${doc?.renewalRecurrence?.unit === 'months' ? 'selected' : ''}>Months</option><option value="years" ${!doc?.renewalRecurrence || doc.renewalRecurrence.unit === 'years' ? 'selected' : ''}>Years</option></select></div><p class="hint-text">A reminder will move to the next renewal date after you acknowledge it.</p></div></div>
    <div class="form-group"><label>Photo / Scan</label>
      <input type="file" id="doc-photo" accept="image/*">
      <div id="doc-photo-preview" class="proof-preview">${doc && doc.photo ? `<img src="${doc.photo}">` : ''}</div>
    </div>
  `;
}
let pendingDocPhoto = null;
function wireDocPhotoInput(existingPhoto) {
  pendingDocPhoto = existingPhoto || null;
  document.getElementById('doc-photo').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    pendingDocPhoto = await compressImageFile(file);
    document.getElementById('doc-photo-preview').innerHTML = `<img src="${pendingDocPhoto}">`;
  });
}
function openAddDocument() {
  openModal(`<h3>Add Document</h3>${documentFormHtml(null)}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveDocumentForm()">Add</button></div>`);
  wireDocPhotoInput(null);
}
function openEditDocument(id) {
  const doc = DB.getActiveVehicle().documents.find(d => d.id === id);
  openModal(`<h3>Edit Document</h3>${documentFormHtml(doc)}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveDocumentForm('${id}')">Save</button></div>`);
  wireDocPhotoInput(doc.photo);
}
function saveDocumentForm(id) {
  const typeVal = document.getElementById('doc-type').value;
  const type = typeVal === 'Other' ? capitalizeFirst(document.getElementById('doc-type-other').value.trim() || 'Other') : typeVal;
  const expiryDate = document.getElementById('doc-expiry').value;
  const entry = {
    type,
    number: document.getElementById('doc-number').value.trim(),
    expiryDate,
    photo: pendingDocPhoto,
    renewalRecurrence: readRecurrenceFields('doc')
  };
  const vehicle = DB.getActiveVehicle();
  let docId = id;
  if (id) DB.updateDocument(vehicle.id, id, entry);
  else docId = DB.addDocument(vehicle.id, entry).id;

  // Keep an auto-reminder in sync with this document's expiry (fix #5)
  if (expiryDate) DB.upsertDocumentReminder(vehicle.id, docId, `${type} Expiry`, expiryDate, readRecurrenceFields('doc'));

  closeModal();
  toast(id ? 'Document updated' : 'Document added');
}
function confirmDeleteDocument(id) {
  openModal(`<h3>Delete this document?</h3>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn-danger" onclick="DB.deleteDocument(DB.getActiveVehicle().id, '${id}'); closeModal(); toast('Document deleted')">Delete</button></div>`);
}

/* =========================================================================
   REMINDERS / NOTIFICATIONS (fix #5)
   ========================================================================= */

function reminderDueBadge(dueDate) {
  const days = Math.ceil((new Date(dueDate + 'T00:00:00') - new Date(todayDateStr() + 'T00:00:00')) / 86400000);
  if (days < 0) return `<span class="status-badge status-pending">Overdue</span>`;
  if (days === 0) return `<span class="status-badge status-pending">Due Today</span>`;
  if (days <= 7) return `<span class="status-badge status-pending">In ${days}d</span>`;
  return `<span class="status-badge status-fixed">Upcoming</span>`;
}

function renderRemindersList() {
  const vehicle = DB.getActiveVehicle();
  const el = document.getElementById('reminders-list');
  const reminders = [...vehicle.reminders].sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
  if (!reminders.length) { el.innerHTML = `<p class="hint-text">No reminders set.</p>`; return; }
  el.innerHTML = reminders.map(r => `
    <div class="row-item">
      <div>
        <strong>${escapeHtml(r.title)}</strong> ${reminderDueBadge(r.dueDate)}
        <div class="hint-text">${formatDateOnly(r.dueDate)}${r.docId ? ' · linked to a document' : ''}${r.recurrence ? ` · Repeats every ${r.recurrence.interval} ${r.recurrence.unit}` : ''}</div>
      </div>
      <div class="row-item-actions">
        ${r.docId ? '' : `<button class="btn-chip" onclick="openEditReminder('${r.id}')">Edit</button>`}
        <button class="btn-chip btn-chip-danger" onclick="DB.deleteReminder(DB.getActiveVehicle().id, '${r.id}'); toast('Reminder removed')">Done</button>
      </div>
    </div>
  `).join('');
}

function toggleRecurrenceFields(kind) {
  const enabled = document.getElementById(`${kind}-recurrence-enabled`)?.checked;
  document.getElementById(`${kind}-recurrence-fields`)?.classList.toggle('hidden', !enabled);
}
function readRecurrenceFields(kind) {
  const enabled = document.getElementById(`${kind}-renewal-enabled`)?.checked || document.getElementById(`${kind}-recurrence-enabled`)?.checked;
  if (!enabled) return null;
  const interval = parseInt(document.getElementById(kind === 'doc' ? 'doc-renewal-interval' : 'rem-recurrence-interval')?.value, 10);
  const unit = document.getElementById(kind === 'doc' ? 'doc-renewal-unit' : 'rem-recurrence-unit')?.value;
  return interval > 0 && unit ? { interval, unit } : null;
}
function advanceRecurringDate(dateStr, recurrence) {
  const date = new Date(dateStr + 'T00:00:00');
  if (!recurrence || !dateStr || !date.getTime()) return dateStr;
  if (recurrence.unit === 'weeks') date.setDate(date.getDate() + recurrence.interval * 7);
  else if (recurrence.unit === 'months') date.setMonth(date.getMonth() + recurrence.interval);
  else date.setFullYear(date.getFullYear() + recurrence.interval);
  return date.toISOString().slice(0, 10);
}

function reminderFormHtml(r) {
  return `
    <div class="form-group"><label>Type</label>
      <select id="rem-type">${REMINDER_TYPES.map(t => `<option value="${t}" ${r && r.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    </div>
    <div class="form-group"><label>Title</label><input type="text" id="rem-title" value="${r ? escapeAttr(r.title) : ''}" placeholder="e.g. Plan water service"></div>
    <div class="form-group"><label>Due Date</label><input type="date" id="rem-date" value="${r ? r.dueDate : todayDateStr()}"></div>
    <div class="form-group"><label class="checkbox-row"><input type="checkbox" id="rem-recurrence-enabled" ${r?.recurrence ? 'checked' : ''} onchange="toggleRecurrenceFields('rem')"> Repeat this reminder</label></div>
    <div id="rem-recurrence-fields" class="recurrence-fields ${r?.recurrence ? '' : 'hidden'}"><div class="form-group"><label>Repeat every</label><div class="inline-fields"><input type="number" id="rem-recurrence-interval" min="1" step="1" value="${r?.recurrence?.interval || 1}"><select id="rem-recurrence-unit"><option value="weeks" ${r?.recurrence?.unit === 'weeks' ? 'selected' : ''}>Weeks</option><option value="months" ${!r?.recurrence || r.recurrence.unit === 'months' ? 'selected' : ''}>Months</option><option value="years" ${r?.recurrence?.unit === 'years' ? 'selected' : ''}>Years</option></select></div></div></div>
  `;
}
function openAddReminder() {
  openModal(`<h3>Add Reminder</h3>${reminderFormHtml(null)}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveReminderForm()">Add</button></div>`);
}
function openEditReminder(id) {
  const r = DB.getActiveVehicle().reminders.find(r => r.id === id);
  openModal(`<h3>Edit Reminder</h3>${reminderFormHtml(r)}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveReminderForm('${id}')">Save</button></div>`);
}
function saveReminderForm(id) {
  const entry = {
    type: document.getElementById('rem-type').value,
    title: capitalizeFirst(document.getElementById('rem-title').value.trim()) || document.getElementById('rem-type').value,
    dueDate: document.getElementById('rem-date').value,
    recurrence: readRecurrenceFields('rem')
  };
  const vehicle = DB.getActiveVehicle();
  if (id) DB.updateReminder(vehicle.id, id, entry);
  else DB.addReminder(vehicle.id, entry);
  closeModal();
  toast(id ? 'Reminder updated' : 'Reminder added');
}

// Checks every reminder across every vehicle once per app load and surfaces
// due/overdue ones. This only fires while MANSKIT is actually open — as a
// fully offline static app there's no server to push background
// notifications from.
function checkRemindersOnLoad() {
  const today = todayDateStr();
  DB.listVehicles().forEach(vehicle => {
    vehicle.reminders.forEach(r => {
      if (r.dueDate > today) return;
      if (r.notifiedDate === today) return;
      const wasOverdue = r.dueDate < today;
      if (r.recurrence) {
        let nextDate = r.dueDate;
        while (nextDate <= today) nextDate = advanceRecurringDate(nextDate, r.recurrence);
        toast(`⏰ ${vehicle.name}: ${r.title} ${wasOverdue ? 'was overdue' : 'is due today'} · next ${formatDateOnly(nextDate)}`, 'error');
        DB.updateReminder(vehicle.id, r.id, { dueDate: nextDate, notifiedDate: null, lastCompletedDate: today });
      } else {
        toast(`⏰ ${vehicle.name}: ${r.title} is ${wasOverdue ? 'overdue' : 'due today'}`, 'error');
        if (window.Notification && Notification.permission === 'granted') {
          new Notification('Manskit Vehicle Hub', { body: `${vehicle.name}: ${r.title}` });
        }
        DB.updateReminder(vehicle.id, r.id, { notifiedDate: today });
      }
    });
  });
}

async function requestNotificationPermission() {
  if (!window.Notification) { toast('Notifications aren\'t supported in this browser', 'error'); return; }
  const perm = await Notification.requestPermission();
  toast(perm === 'granted' ? 'Notifications enabled' : 'Notifications not enabled');
  renderSettingsBody();
}

/* =========================================================================
   SHARE VEHICLE DETAILS (fix #1)
   ========================================================================= */

function openShareVehicleDetails() {
  const rowsHtml = SHARE_SECTIONS.map(([key, label]) => `
    <label class="checkbox-row"><input type="checkbox" class="share-section-check" value="${key}" checked> ${label}</label>
  `).join('');
  openModal(`
    <h3>Share Vehicle Details</h3>
    <p class="hint-text">Pick what to include, then share as a text note — handy for asking a mechanic which oil or tyre pressure to use.</p>
    <div class="modal-actions" style="margin-top:0;margin-bottom:12px;">
      <button class="btn-secondary" onclick="setAllShareChecks(true)">Select All</button>
      <button class="btn-secondary" onclick="setAllShareChecks(false)">Select None</button>
    </div>
    <div id="share-section-rows">${rowsHtml}</div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="doShareVehicleDetails()">Share</button>
    </div>
  `);
}
function setAllShareChecks(checked) {
  document.querySelectorAll('.share-section-check').forEach(c => { c.checked = checked; });
}
function doShareVehicleDetails() {
  const vehicle = DB.getActiveVehicle();
  const checked = [...document.querySelectorAll('.share-section-check:checked')].map(c => c.value);
  if (!checked.length) { toast('Pick at least one section', 'error'); return; }

  let text = `${vehicle.name} — Vehicle Details\n`;
  checked.forEach(key => {
    const meta = SPEC_SECTION_META[key];
    const data = vehicle.specs[key] || {};
    const lines = meta.fields
      .map(([fk, label]) => data[fk] ? `${label}: ${data[fk]}` : null)
      .filter(Boolean);
    if (lines.length) text += `\n${meta.title}\n${lines.join('\n')}\n`;
  });

  closeModal();
  shareOrCopyText(text, `${vehicle.name} — Vehicle Details`);
}
function shareOrCopyText(text, title) {
  if (navigator.share) {
    navigator.share({ title, text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard ✓')).catch(() => toast('Could not copy', 'error'));
  } else {
    toast('Sharing isn\'t supported in this browser', 'error');
  }
}

/* =========================================================================
   SCREEN 3 — PURCHASE & FINANCE
   ========================================================================= */

function renderFinanceScreen() {
  const vehicle = DB.getActiveVehicle();
  const a = vehicle.acquisition;
  const isPaidInFull = vehicle.paymentStatus !== 'financed';
  document.getElementById('contributions-card')?.classList.toggle('hidden', isPaidInFull);
  document.getElementById('loan-card')?.classList.toggle('hidden', isPaidInFull);
  document.getElementById('emi-card')?.classList.toggle('hidden', isPaidInFull);
  const onRoad = (a.exShowroom || 0) + (a.taxes || 0) + (a.registration || 0);

  document.getElementById('acquisition-body').innerHTML = `
    <div class="spec-row"><span>Ex-Showroom Price:</span> <strong>${CURRENCY}${fmt(a.exShowroom)}</strong></div>
    <div class="spec-row"><span>Taxes:</span> <strong>${CURRENCY}${fmt(a.taxes)}</strong></div>
    <div class="spec-row"><span>Registration Fees:</span> <strong>${CURRENCY}${fmt(a.registration)}</strong></div>
    <div class="spec-row"><span>Total On-Road Price:</span> <strong class="accent-text">${CURRENCY}${fmt(onRoad)}</strong></div>
    <div class="spec-row"><span>Payment Status:</span> <strong>${isPaidInFull ? 'Paid in full' : 'Financed'}</strong></div>
  `;

  const youTotal = vehicle.contributions.filter(c => c.payer === 'You').reduce((s, c) => s + c.amount, 0);
  const partnerTotal = vehicle.contributions.filter(c => c.payer === 'Partner').reduce((s, c) => s + c.amount, 0);
  document.getElementById('contributions-summary').innerHTML = `
    <div class="spec-row"><span>${escapeHtml(peopleNames().you)} contributed:</span> <strong>${CURRENCY}${fmt(youTotal)}</strong></div>
    ${activeVehicleHasPartnership() ? `<div class="spec-row"><span>${escapeHtml(peopleNames().partner)} contributed:</span> <strong>${CURRENCY}${fmt(partnerTotal)}</strong></div>` : ''}
  `;
  const contribSorted = [...vehicle.contributions].sort(sortByDateDesc);
  document.getElementById('contributions-list').innerHTML = contribSorted.length ? contribSorted.map(c => `
    <div class="row-item">
      <div>
        <strong>${CURRENCY}${fmt(c.amount)}</strong> — ${escapeHtml(c.payer === 'You' ? peopleNames().you : peopleNames().partner)}
        <div class="hint-text">${c.date || ''} ${c.note ? '· ' + escapeHtml(c.note) : ''}</div>
      </div>
      <div class="row-item-actions">
        <button class="btn-chip" onclick="openEditContribution('${c.id}')">Edit</button>
        <button class="btn-chip btn-chip-danger" onclick="confirmDeleteContribution('${c.id}')">Delete</button>
      </div>
    </div>
  `).join('') : `<p class="hint-text">No contributions logged yet.</p>`;

  const loan = vehicle.loan;
  document.getElementById('loan-body').innerHTML = `
    <div class="spec-row"><span>Bank / Lender:</span> <strong>${escapeHtml(loan.bankName || '—')}</strong></div>
    <div class="spec-row"><span>Total Sanctioned:</span> <strong>${CURRENCY}${fmt(loan.totalLoan)}</strong></div>
    <div class="spec-row"><span>Interest Rate:</span> <strong>${fmt(loan.interestRate)}% p.a.</strong></div>
    <div class="spec-row"><span>Tenure:</span> <strong>${loan.tenureMonths} Months</strong></div>
  `;

  const emiPaidTotal = vehicle.emiPayments.reduce((s, e) => s + (e.amount || 0), 0);
  const remaining = Math.max(0, loan.totalLoan - emiPaidTotal);
  const pct = loan.totalLoan > 0 ? Math.min(100, Math.round((emiPaidTotal / loan.totalLoan) * 100)) : 0;
  document.getElementById('emi-progress').innerHTML = `
    <div class="spec-row"><span>Paid So Far:</span> <strong class="accent-text">${CURRENCY}${fmt(emiPaidTotal)}</strong></div>
    <div class="spec-row"><span>Remaining Balance:</span> <strong>${CURRENCY}${fmt(remaining)}</strong></div>
    <div class="spec-row"><span>Installments Logged:</span> <strong>${vehicle.emiPayments.length} of ${loan.tenureMonths || '—'}</strong></div>
    <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
    <p class="hint-text">${pct}% of sanctioned loan repaid</p>
  `;
  const emiSorted = [...vehicle.emiPayments].sort(sortByDateDesc);
  document.getElementById('emi-list').innerHTML = emiSorted.length ? emiSorted.map(e => `
    <div class="row-item">
      <div>
        <strong>${CURRENCY}${fmt(e.amount)}</strong> — ${e.split ? paymentDisplay(e.split) : ''}
        <div class="hint-text">${e.date || ''}</div>
      </div>
      <div class="row-item-actions">
        <button class="btn-chip" onclick="openEditEmiPayment('${e.id}')">Edit</button>
        <button class="btn-chip btn-chip-danger" onclick="confirmDeleteEmi('${e.id}')">Delete</button>
      </div>
    </div>
  `).join('') : `<p class="hint-text">No EMI payments logged yet.</p>`;
}

function openAcquisitionEditor() {
  const a = DB.getActiveVehicle().acquisition;
  openModal(`
    <h3>Edit Acquisition Cost</h3>
    <div class="form-group"><label>Ex-Showroom Price</label><input type="number" step="0.01" id="acq-ex" value="${a.exShowroom}"></div>
    <div class="form-group"><label>Taxes</label><input type="number" step="0.01" id="acq-tax" value="${a.taxes}"></div>
    <div class="form-group"><label>Registration Fees</label><input type="number" step="0.01" id="acq-reg" value="${a.registration}"></div>
    <div class="form-group"><label>Purchase Payment</label><select id="acq-payment-status"><option value="paid" ${DB.getActiveVehicle().paymentStatus !== 'financed' ? 'selected' : ''}>Ready payment / Paid in full</option><option value="financed" ${DB.getActiveVehicle().paymentStatus === 'financed' ? 'selected' : ''}>Financed / Loan</option></select></div>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveAcquisitionEditor()">Save</button>
    </div>
  `);
}
function saveAcquisitionEditor() {
  DB.updateAcquisition(DB.getActiveVehicle().id, {
    exShowroom: parseFloat(document.getElementById('acq-ex').value) || 0,
    taxes: parseFloat(document.getElementById('acq-tax').value) || 0,
    registration: parseFloat(document.getElementById('acq-reg').value) || 0
  });
  DB.getActiveVehicle().paymentStatus = document.getElementById('acq-payment-status').value;
  DB.save();
  closeModal();
  toast('Acquisition cost updated');
}

function contributionFormHtml(c) {
  const partnership = activeVehicleHasPartnership();
  return `
    <div class="form-group"><label>${partnership ? 'Paid By' : 'Owner'}</label>
      ${partnership ? `<select id="contrib-payer">${['You', 'Partner'].map(p => `<option value="${p}" ${c && c.payer === p ? 'selected' : ''}>${escapeHtml(p === 'You' ? peopleNames().you : peopleNames().partner)}</option>`).join('')}</select>` : `<input type="text" value="${escapeAttr(peopleNames().you)}" disabled>`}
    </div>
    <div class="form-group"><label>Amount</label><input type="number" step="0.01" id="contrib-amount" value="${c ? c.amount : ''}"></div>
    <div class="form-group"><label>Date</label><input type="date" id="contrib-date" value="${c ? c.date : todayDateStr()}"></div>
    <div class="form-group"><label>Note</label><input type="text" id="contrib-note" value="${c ? escapeAttr(c.note || '') : ''}" placeholder="Optional"></div>
  `;
}

function openAddContribution() {
  openModal(`<h3>Add Contribution</h3>${contributionFormHtml(null)}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveContributionForm()">Add</button></div>`);
}
function openEditContribution(id) {
  const c = DB.getActiveVehicle().contributions.find(c => c.id === id);
  openModal(`<h3>Edit Contribution</h3>${contributionFormHtml(c)}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveContributionForm('${id}')">Save</button></div>`);
}
function saveContributionForm(id) {
  const entry = {
    payer: activeVehicleHasPartnership() ? document.getElementById('contrib-payer').value : 'You',
    amount: parseFloat(document.getElementById('contrib-amount').value) || 0,
    date: document.getElementById('contrib-date').value,
    note: capitalizeFirst(document.getElementById('contrib-note').value.trim())
  };
  const vehicle = DB.getActiveVehicle();
  if (id) DB.updateContribution(vehicle.id, id, entry);
  else DB.addContribution(vehicle.id, entry);
  closeModal();
  toast(id ? 'Contribution updated' : 'Contribution added');
}
function confirmDeleteContribution(id) {
  openModal(`<h3>Delete this contribution?</h3>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn-danger" onclick="DB.deleteContribution(DB.getActiveVehicle().id, '${id}'); closeModal(); toast('Contribution deleted')">Delete</button></div>`);
}

function openLoanEditor() {
  const loan = DB.getActiveVehicle().loan;
  openModal(`
    <h3>Edit Loan Details</h3>
    <div class="form-group"><label>Bank / Lender Name</label><input type="text" id="loan-bank" value="${escapeAttr(loan.bankName)}"></div>
    <div class="form-group"><label>Total Sanctioned Amount</label><input type="number" step="0.01" id="loan-total" value="${loan.totalLoan}"></div>
    <div class="form-group"><label>Interest Rate (% p.a.)</label><input type="number" step="0.01" id="loan-rate" value="${loan.interestRate}"></div>
    <div class="form-group"><label>Tenure (Months)</label><input type="number" id="loan-tenure" value="${loan.tenureMonths}"></div>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveLoanEditor()">Save</button></div>
  `);
}
function saveLoanEditor() {
  DB.updateLoan(DB.getActiveVehicle().id, {
    bankName: capitalizeFirst(document.getElementById('loan-bank').value.trim()),
    totalLoan: parseFloat(document.getElementById('loan-total').value) || 0,
    interestRate: parseFloat(document.getElementById('loan-rate').value) || 0,
    tenureMonths: parseInt(document.getElementById('loan-tenure').value, 10) || 0
  });
  closeModal();
  toast('Loan details updated');
}

function emiFormHtml(e) {
  const amount = e ? e.amount : (DB.getActiveVehicle().loan.emi || '');
  const kind = e && e.split ? splitKind(e.split) : 'You';
  const names = peopleNames();
  return `
    <div class="form-group"><label>Amount</label><input type="number" step="0.01" id="emi-amount" value="${amount}" oninput="handleEmiAmountChange()"></div>
    <div class="form-group"><label>Date</label><input type="date" id="emi-date" value="${e ? e.date : todayDateStr()}"></div>
    <div class="form-group"><label>Paid By</label>
      <select id="emi-paidby" onchange="handleEmiPaidByChange()">
        <option value="You" ${kind === 'You' ? 'selected' : ''}>${escapeHtml(names.you)}</option>
        <option value="Partner" ${kind === 'Partner' ? 'selected' : ''}>${escapeHtml(names.partner)}</option>
        <option value="Split" ${kind === 'Split' ? 'selected' : ''}>Split (custom amounts)</option>
      </select>
    </div>
    <div id="emi-split-group" class="${kind === 'Split' ? '' : 'hidden'} split-fields">
      <div class="form-group"><label>${escapeHtml(names.you)} Paid</label><input type="number" step="0.01" id="emi-split-you" value="${e && e.split ? e.split.you : ''}" oninput="handleEmiSplitYouChange()"></div>
      <div class="form-group"><label>${escapeHtml(names.partner)} Paid</label><input type="number" step="0.01" id="emi-split-partner" value="${e && e.split ? e.split.partner : ''}" oninput="handleEmiSplitPartnerChange()"></div>
      <p class="hint-text" id="emi-split-remaining"></p>
    </div>
  `;
}
function emiCurrentAmount() { return parseFloat(document.getElementById('emi-amount').value) || 0; }
function handleEmiPaidByChange() {
  const val = document.getElementById('emi-paidby').value;
  document.getElementById('emi-split-group').classList.toggle('hidden', val !== 'Split');
  if (val === 'Split') {
    const even = evenSplit(emiCurrentAmount());
    document.getElementById('emi-split-you').value = even.you;
    document.getElementById('emi-split-partner').value = even.partner;
    updateEmiSplitRemaining();
  }
}
function handleEmiAmountChange() { if (document.getElementById('emi-paidby').value === 'Split') updateEmiSplitRemaining(); }
function handleEmiSplitYouChange() {
  const amount = emiCurrentAmount();
  const you = parseFloat(document.getElementById('emi-split-you').value) || 0;
  document.getElementById('emi-split-partner').value = Math.round((amount - you) * 100) / 100;
  updateEmiSplitRemaining();
}
function handleEmiSplitPartnerChange() {
  const amount = emiCurrentAmount();
  const partner = parseFloat(document.getElementById('emi-split-partner').value) || 0;
  document.getElementById('emi-split-you').value = Math.round((amount - partner) * 100) / 100;
  updateEmiSplitRemaining();
}
function updateEmiSplitRemaining() {
  const amount = emiCurrentAmount();
  const you = parseFloat(document.getElementById('emi-split-you').value) || 0;
  const partner = parseFloat(document.getElementById('emi-split-partner').value) || 0;
  const diff = Math.round((amount - you - partner) * 100) / 100;
  const el = document.getElementById('emi-split-remaining');
  el.textContent = diff === 0 ? 'Splits match the total ✓' : `Off by ${CURRENCY}${fmt(Math.abs(diff))}.`;
  el.classList.toggle('error-text', diff !== 0);
}
function openAddEmiPayment() {
  openModal(`<h3>Log EMI Payment</h3>${emiFormHtml(null)}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveEmiForm()">Add</button></div>`);
}
function openEditEmiPayment(id) {
  const e = DB.getActiveVehicle().emiPayments.find(e => e.id === id);
  openModal(`<h3>Edit EMI Payment</h3>${emiFormHtml(e)}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveEmiForm('${id}')">Save</button></div>`);
}
function saveEmiForm(id) {
  const amount = parseFloat(document.getElementById('emi-amount').value) || 0;
  const paidBy = document.getElementById('emi-paidby').value;
  const split = paidBy === 'Split'
    ? { you: parseFloat(document.getElementById('emi-split-you').value) || 0, partner: parseFloat(document.getElementById('emi-split-partner').value) || 0 }
    : splitFromPayer(paidBy, amount);
  if (Math.round((amount - split.you - split.partner) * 100) / 100 !== 0) {
    toast('The custom split amounts must add up to the total.', 'error');
    return;
  }
  const entry = { amount, date: document.getElementById('emi-date').value, split };
  const vehicle = DB.getActiveVehicle();
  if (id) DB.updateEmiPayment(vehicle.id, id, entry);
  else DB.addEmiPayment(vehicle.id, entry);
  closeModal();
  toast(id ? 'EMI payment updated' : 'EMI payment logged');
}
function confirmDeleteEmi(id) {
  openModal(`<h3>Delete this EMI payment?</h3>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn-danger" onclick="DB.deleteEmiPayment(DB.getActiveVehicle().id, '${id}'); closeModal(); toast('EMI payment deleted')">Delete</button></div>`);
}

/* =========================================================================
   SCREEN 4 — LOGS & PARTNER LEDGER
   ========================================================================= */

function renderLogsScreen() {
  const vehicle = DB.getActiveVehicle();

  renderLogGroupList(document.getElementById('maintenance-log-list'), vehicle.logs.filter(l => l.group === 'maintenance'));
  renderLogGroupList(document.getElementById('expenses-log-list'), vehicle.logs.filter(l => l.group === 'expense'));

  const stats = DB.computeStats(vehicle.id);
  document.getElementById('stats-grid').innerHTML = `
    <div class="stat-card"><span class="stat-label">Total Lifelong Spend</span><span class="stat-value">${CURRENCY}${fmt(stats.totalExpenditure)}</span></div>
    <div class="stat-card"><span class="stat-label">Cost / KM</span><span class="stat-value">${CURRENCY}${fmt(stats.costPerKm)}</span></div>
    <div class="stat-card"><span class="stat-label">Fuel + Expenses</span><span class="stat-value">${CURRENCY}${fmt(stats.byGroup.expense)}</span></div>
    <div class="stat-card"><span class="stat-label">Maintenance</span><span class="stat-value">${CURRENCY}${fmt(stats.byGroup.maintenance)}</span></div>
    <div class="stat-card"><span class="stat-label">Damage Repairs</span><span class="stat-value">${CURRENCY}${fmt(stats.byGroup.damage)}</span></div>
    <div class="stat-card"><span class="stat-label">Distance Logged</span><span class="stat-value">${fmt(stats.distance)} KM</span></div>
  `;

  const names = peopleNames();
  const personal = DB.computePersonalSpend(vehicle.id);
  document.getElementById('personal-spend-body').innerHTML = `
    <div class="spec-row"><span>${escapeHtml(names.you)}:</span> <strong>${CURRENCY}${fmt(personal.you)}</strong></div>
    <div class="spec-row"><span>${escapeHtml(names.partner)}:</span> <strong>${CURRENCY}${fmt(personal.partner)}</strong></div>
  `;

  const balance = DB.computeSettlement(vehicle.id);
  document.getElementById('settlement-summary').innerHTML = balance >= 0
    ? `${escapeHtml(names.partner)} owes ${escapeHtml(names.you)}: <strong class="accent-text">${CURRENCY}${fmt(Math.abs(balance))}</strong>`
    : `${escapeHtml(names.you)} owes ${escapeHtml(names.partner)}: <strong class="owe-text">${CURRENCY}${fmt(Math.abs(balance))}</strong>`;

  document.getElementById('settle-up-btn').disabled = balance === 0;

  const settlements = [...vehicle.settlements].sort(sortByDateDesc);
  document.getElementById('settlement-history').innerHTML = settlements.length ? `
    <p class="hint-text" style="margin-top:12px;">Settlement history:</p>
    ${settlements.map(s => `
      <div class="row-item">
        <div>${s.amount >= 0 ? escapeHtml(names.partner) + ' paid ' + escapeHtml(names.you) : escapeHtml(names.you) + ' paid ' + escapeHtml(names.partner)}
          <strong>${CURRENCY}${fmt(Math.abs(s.amount))}</strong>
          <div class="hint-text">${formatDateOnly(s.date)}</div>
        </div>
        <div class="row-item-actions"><button class="btn-chip btn-chip-danger" onclick="undoSettlement('${s.id}')">Undo</button></div>
      </div>
    `).join('')}
  ` : '';
}

// ---- Settle up (fix #7) ------------------------------------------

function trySettleUp() {
  const vehicle = DB.getActiveVehicle();
  const balance = DB.computeSettlement(vehicle.id);
  if (balance === 0) { toast('Already settled up'); return; }
  const names = peopleNames();
  const who = balance >= 0
    ? `${names.partner} pays ${names.you} ${CURRENCY}${fmt(Math.abs(balance))}`
    : `${names.you} pays ${names.partner} ${CURRENCY}${fmt(Math.abs(balance))}`;
  openModal(`
    <h3>Settle Up?</h3>
    <p class="hint-text">This records that ${escapeHtml(who)}, bringing the running balance back to ${CURRENCY}0. Past entries stay as they are — this just adds an offsetting record.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="confirmSettleUp()">Confirm</button>
    </div>
  `);
}
function confirmSettleUp() {
  DB.settleBalance(DB.getActiveVehicle().id);
  closeModal();
  toast('Settled up ✓');
}
function undoSettlement(id) {
  DB.deleteSettlement(DB.getActiveVehicle().id, id);
  toast('Settlement record removed');
}

function updateLogFilters() {
  logFilters = {
    text: (document.getElementById('log-filter-text')?.value || '').trim().toLowerCase(),
    from: document.getElementById('log-filter-date-from')?.value || '', to: document.getElementById('log-filter-date-to')?.value || '',
    status: document.getElementById('log-filter-status')?.value || '', type: (document.getElementById('log-filter-type')?.value || '').trim().toLowerCase(),
    paidBy: (document.getElementById('log-filter-paid-by')?.value || '').trim().toLowerCase(),
    min: parseFloat(document.getElementById('log-filter-amount-min')?.value), max: parseFloat(document.getElementById('log-filter-amount-max')?.value)
  };
  renderLogsScreen();
}
function clearLogFilters() { document.querySelectorAll('.log-filters input, .log-filters select').forEach(el => el.value = ''); logFilters = {}; renderLogsScreen(); }
function toggleLogHistory() { showAllLogs = !showAllLogs; const b = document.getElementById('log-history-toggle'); if (b) b.textContent = showAllLogs ? 'Hide older than 30 days' : 'Show all history'; renderLogsScreen(); }
function logMatchesFilters(log) {
  const f = logFilters || {}; const hay = [log.note, log.description, log.category, log.workshop, log.status, log.settlementType, paymentDisplay(log.split)].join(' ').toLowerCase();
  const date = log.time || '';
  if (f.text && !hay.includes(f.text)) return false;
  if (f.from && date < f.from || f.to && date > f.to) return false;
  if (f.status && f.status !== (log.status || (log.settlementType === 'personal' ? 'Personal' : 'Shared'))) return false;
  if (f.type && !(log.category || '').toLowerCase().includes(f.type)) return false;
  if (f.paidBy && !paymentDisplay(log.split).toLowerCase().includes(f.paidBy)) return false;
  if (!isNaN(f.min) && (log.amount || 0) < f.min || !isNaN(f.max) && (log.amount || 0) > f.max) return false;
  if (!showAllLogs) { const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 30); if (date && new Date(date + 'T23:59:59') < cutoff) return false; }
  return true;
}

function renderLogGroupList(el, entries) {
  entries = entries.filter(logMatchesFilters).sort(sortByTimeDesc);
  if (!entries.length) { el.innerHTML = `<p class="hint-text">No entries yet.</p>`; return; }
  el.innerHTML = entries.map(log => {
    const type = getActionType(log.actionTypeId);
    return `
    <div class="card log-card">
      <div class="log-card-top">
        <strong>${type.icon} ${escapeHtml(log.category || type.label)}</strong>
        <span class="accent-text">${CURRENCY}${fmt(log.amount)}</span>
      </div>
      <div class="log-card-meta">
        Odo: ${fmt(log.odometer)} KM · ${log.split ? paymentDisplay(log.split) : ''}
        ${log.settlementType === 'personal' ? '<span class="status-badge status-personal">Personal</span>' : ''}
        · ${formatDateOnly(log.time)}
        ${log.workshop ? ' · ' + escapeHtml(log.workshop) : ''}
      </div>
      ${log.proof ? `<img src="${log.proof}" class="log-thumb" onclick="openZoomViewer('${log.proof}')" alt="Receipt">` : ''}
      ${noteHtml(log)}
      <div class="log-card-actions">
        <button class="btn-chip" onclick="editLogEntry('${log.id}')">Edit</button>
        <button class="btn-chip btn-chip-danger" onclick="deleteLogEntry('${log.id}')">Delete</button>
      </div>
    </div>
  `;
  }).join('');
}

/* =========================================================================
   SETTINGS OVERLAY
   ========================================================================= */

function renderSettingsBody() {
  const d = DB.getAll();
  const el = document.getElementById('settings-body');
  const sec = d.settings.security;
  const fbConfigured = FirebaseSync.isConfigured();

  el.innerHTML = `
    <div class="card">
      <h3>Vehicles &amp; Ownership</h3>
      <div id="vehicle-manager-list">${vehicleManagerListHtml(d)}</div>
      <button class="btn-secondary" onclick="openAddVehicle()">+ Add Vehicle</button>
    </div>

    <div class="card">
      <h3>Quick Entry Buttons</h3>
      <p class="hint-text">Customize the action buttons and their categories.</p>
      <div id="action-type-list">${actionTypeListHtml(d)}</div>
      <button class="btn-secondary" onclick="openAddActionType()">+ Add Button</button>
    </div>

    <div class="card">
      <h3>Notifications</h3>
      <p class="hint-text">
        Status: <strong class="${window.Notification && Notification.permission === 'granted' ? 'accent-text' : 'owe-text'}">
          ${!window.Notification ? 'Not supported' : Notification.permission === 'granted' ? 'Enabled' : Notification.permission === 'denied' ? 'Blocked' : 'Not enabled'}
        </strong><br>
        Reminders (Profile &gt; Reminders) are checked whenever you open MANSKIT. This only works while the app is open — as a fully offline app, there's no server to push notifications when it's closed.
      </p>
      ${window.Notification && Notification.permission !== 'granted' ? `<button class="btn-secondary" onclick="requestNotificationPermission()">Enable Notifications</button>` : ''}
    </div>

    <div class="card">
      <h3>App Lock</h3>
      <p class="hint-text">${sec.enabled ? 'Enabled — a password is required to open this app.' : 'Disabled — anyone with this device can open the app.'}</p>
      ${sec.enabled
        ? `<button class="btn-secondary" onclick="openChangePassword()">Change Password</button>
           <button class="btn-danger" onclick="openDisableAppLock()">Disable App Lock</button>`
        : `<button class="btn-primary" onclick="openAppLockSetup()">Set Up App Lock</button>`}
      <p class="hint-text">This is a local device passcode, not encryption — it just keeps the app screen locked. Since MANSKIT works fully offline, "Forgot Password" uses your security question, not email.</p>
    </div>

    <div class="card">
      <h3>Local Backup</h3>
      <p class="hint-text">Save a backup file to your device, or restore one.</p>
      <button class="btn-secondary" onclick="exportBackup()">⬇ Export Backup File</button>
      <label class="btn-secondary file-btn">
        ⬆ Import Backup File
        <input type="file" id="import-file-input" accept="application/json" onchange="importBackup(event)">
      </label>
    </div>

    <div class="card">
      <h3>Cloud Backup (Firebase Realtime Database)</h3>
      <p class="hint-text">
        Status: <strong class="${fbConfigured ? 'accent-text' : 'owe-text'}">${fbConfigured ? 'Configured' : 'Not configured'}</strong><br>
        ${fbConfigured ? 'Ready to back up.' : 'Edit firebase-config.js with your Firebase project\'s config — see README-FIREBASE.md.'}
      </p>
      <button class="btn-primary" onclick="backupToFirebase()" ${fbConfigured ? '' : 'disabled'}>☁ Backup Now</button>
      <button class="btn-secondary" onclick="restoreFromFirebase()" ${fbConfigured ? '' : 'disabled'}>⬇ Restore from Cloud</button>
      <button class="btn-secondary" onclick="signOutOfApp()">Sign Out</button>
      <p class="hint-text">${d.settings.firebase.lastSyncedAt ? `Last backed up: ${formatDateTime(d.settings.firebase.lastSyncedAt)}` : 'Not backed up yet.'}</p>
    </div>

    <div class="card">
      <h3>About</h3>
      <p class="hint-text">Manskit Vehicle Hub v4.0 — offline-first multi-vehicle log, glovebox, finance and cost-sharing tracker.</p>
    </div>
  `;
}

function savePeopleNames() {
  const you = capitalizeFirst(document.getElementById('people-you-input').value.trim()) || 'You';
  const partner = capitalizeFirst(document.getElementById('people-partner-input').value.trim()) || 'Partner';
  DB.updatePeopleNames({ you, partner });
  toast('Names updated');
}

function vehicleManagerListHtml(d) {
  return Object.values(d.vehicles).map(v => `
    <div class="vehicle-row ${v.id === d.activeVehicleId ? 'active-row' : ''}">
      <div class="vehicle-row-info" onclick="DB.setActiveVehicle('${v.id}')">
        <strong>${escapeHtml(v.name)}</strong>
        <span class="hint-text">${capitalizeFirst(v.type)} · ${v.ownership?.mode === 'partnership' ? 'Partnership' : 'Single owner'}</span>
      </div>
      <div class="vehicle-row-actions">
        <button class="btn-chip" onclick="openEditVehicle('${v.id}')">Edit</button>
        <button class="btn-chip" onclick="tryClearVehicleData('${v.id}')">Clear</button>
        <button class="btn-chip btn-chip-danger" onclick="tryDeleteVehicle('${v.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function vehicleOwnershipFormHtml(current = { mode: 'single', owner: 'you' }) {
  const mode = current?.mode || 'single';
  const owner = current?.owner || 'you';
  const ownerName = current?.ownerName || (owner === 'partner' ? 'Owner' : 'Owner');
  const partnerName = current?.partnerName || '';
  return `<div class="form-group"><label>Ownership</label>
    <select id="veh-ownership-mode" onchange="toggleVehicleOwnershipFields()">
      <option value="single" ${mode === 'single' ? 'selected' : ''}>Single owner</option>
      <option value="partnership" ${mode === 'partnership' ? 'selected' : ''}>Partnership</option>
    </select>
  </div>
  <div class="form-group"><label id="veh-owner-name-label">${mode === 'partnership' ? 'First owner name' : 'Owner name'}</label>
    <input type="text" id="veh-owner-name" value="${escapeAttr(ownerName)}" placeholder="Enter real name">
  </div>
  <div class="form-group ${mode === 'partnership' ? '' : 'hidden'}" id="veh-partner-name-group"><label>Second owner name</label>
    <input type="text" id="veh-partner-name" value="${escapeAttr(partnerName)}" placeholder="Enter real name">
  </div>`;
}
function toggleVehicleOwnershipFields() {
  const partnership = document.getElementById('veh-ownership-mode')?.value === 'partnership';
  document.getElementById('veh-partner-name-group')?.classList.toggle('hidden', !partnership);
  const label = document.getElementById('veh-owner-name-label');
  if (label) label.textContent = partnership ? 'First owner name' : 'Owner name';
}
function readVehicleOwnershipForm() {
  const mode = document.getElementById('veh-ownership-mode')?.value || 'single';
  const ownerName = capitalizeFirst(document.getElementById('veh-owner-name')?.value.trim() || 'Owner');
  const partnerName = capitalizeFirst(document.getElementById('veh-partner-name')?.value.trim() || '');
  return { mode, owner: 'you', ownerName, partnerName: mode === 'partnership' ? partnerName : '' };
}

function openAddVehicle() {
  openModal(`
    <h3>Add Vehicle</h3>
    <div class="form-group"><label>Name</label><input type="text" id="veh-name" placeholder="e.g. Weekend Bike"></div>
    <div class="form-group"><label>Registration Number</label><input type="text" id="veh-registration" placeholder="e.g. MH 12 AB 1234" autocapitalize="characters"></div>
    <div class="form-group"><label>Type</label>
      <select id="veh-type"><option value="car">Car</option><option value="bike">Bike / Scooter</option><option value="other">Other</option></select>
    </div>
    ${vehicleOwnershipFormHtml()}
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveAddVehicle()">Add</button>
    </div>
  `);
}
function saveAddVehicle() {
  const name = capitalizeFirst(document.getElementById('veh-name').value.trim());
  const type = document.getElementById('veh-type').value;
  if (!name) { toast('Give the vehicle a name'); return; }
  const ownership = readVehicleOwnershipForm();
  if (ownership.mode === 'partnership' && !ownership.partnerName) { toast('Enter both real owner names'); return; }
  const registrationNumber = normalizeRegistrationNumber(document.getElementById('veh-registration').value);
  const v = DB.addVehicle(name, type, registrationNumber);
  DB.renameVehicle(v.id, null, null, ownership, registrationNumber);
  closeModal();
  closeSettings(); // fix #8: return to the main app so the new vehicle is visible
  toast('Vehicle added');
}
function openEditVehicle(id) {
  const v = DB.getAll().vehicles[id];
  openModal(`
    <h3>Edit Vehicle</h3>
    <div class="form-group"><label>Name</label><input type="text" id="veh-edit-name" value="${escapeAttr(v.name)}"></div>
    <div class="form-group"><label>Registration Number</label><input type="text" id="veh-edit-registration" value="${escapeAttr(v.registrationNumber || '')}" autocapitalize="characters"></div>
    <div class="form-group"><label>Type</label>
      <select id="veh-edit-type">
        <option value="car" ${v.type === 'car' ? 'selected' : ''}>Car</option>
        <option value="bike" ${v.type === 'bike' ? 'selected' : ''}>Bike / Scooter</option>
        <option value="other" ${v.type === 'other' ? 'selected' : ''}>Other</option>
      </select>
    </div>
    ${vehicleOwnershipFormHtml(v.ownership)}
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveEditVehicle('${id}')">Save</button>
    </div>
  `);
}
function saveEditVehicle(id) {
  const ownership = readVehicleOwnershipForm();
  if (ownership.mode === 'partnership' && !ownership.partnerName) { toast('Enter both real owner names'); return; }
  DB.renameVehicle(id, capitalizeFirst(document.getElementById('veh-edit-name').value.trim()), document.getElementById('veh-edit-type').value, ownership, normalizeRegistrationNumber(document.getElementById('veh-edit-registration').value));
  closeModal();
  toast('Vehicle updated');
}
function tryDeleteVehicle(id) {
  if (Object.keys(DB.getAll().vehicles).length <= 1) { toast('You need at least one vehicle'); return; }
  openModal(`
    <h3>Delete this vehicle?</h3>
    <p class="hint-text">All its logs, specs, and photos will be permanently removed.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" onclick="DB.deleteVehicle('${id}'); closeModal(); toast('Vehicle deleted')">Delete</button>
    </div>
  `);
}

// ---- Clear vehicle data, gated by App Lock password if enabled (fix #6) ----

function tryClearVehicleData(id) {
  const sec = DB.getSecurity();
  if (sec.enabled) {
    openModal(`
      <h3>Confirm Password to Clear Data</h3>
      <p class="hint-text">This wipes all logs, photos, specs, and finance data for this vehicle. The vehicle itself stays.</p>
      <div class="form-group"><label>Password</label><input type="password" id="clear-password-input"></div>
      <p class="hint-text error-text hidden" id="clear-password-error"></p>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-danger" onclick="verifyPasswordThenClear('${id}')">Verify & Clear</button>
      </div>
    `);
  } else {
    openModal(`
      <h3>Clear all data for this vehicle?</h3>
      <p class="hint-text">This wipes all logs, photos, specs, and finance data. The vehicle itself stays. Type CLEAR to confirm.</p>
      <div class="form-group"><input type="text" id="clear-confirm-text" placeholder="Type CLEAR"></div>
      <div class="modal-actions">
        <button class="btn-secondary" onclick="closeModal()">Cancel</button>
        <button class="btn-danger" onclick="confirmClearWithoutPassword('${id}')">Clear Data</button>
      </div>
    `);
  }
}
function confirmClearWithoutPassword(id) {
  if (document.getElementById('clear-confirm-text').value.trim().toUpperCase() !== 'CLEAR') {
    toast('Type CLEAR exactly to confirm', 'error');
    return;
  }
  DB.clearVehicleData(id);
  closeModal();
  toast('Vehicle data cleared');
}
async function verifyPasswordThenClear(id) {
  const entered = document.getElementById('clear-password-input').value;
  const sec = DB.getSecurity();
  const hash = await hashText(entered);
  if (hash !== sec.passwordHash) {
    document.getElementById('clear-password-error').textContent = 'Incorrect password.';
    document.getElementById('clear-password-error').classList.remove('hidden');
    return;
  }
  DB.clearVehicleData(id);
  closeModal();
  toast('Vehicle data cleared');
}

// ---- Action types & categories (fix #9) ------------------------------------------

function actionTypeListHtml(d) {
  return d.settings.actionTypes.map(t => `
    <div class="vehicle-row">
      <div class="vehicle-row-info">
        <strong>${t.icon} ${escapeHtml(t.label)}</strong>
        <span class="hint-text">${capitalizeFirst(t.group)}${t.group !== 'damage' ? ` · ${t.categories.length} categories` : ''}</span>
      </div>
      <div class="vehicle-row-actions">
        ${t.group !== 'damage' ? `<button class="btn-chip" onclick="openCategoryManager('${t.id}')">Categories</button>` : ''}
        <button class="btn-chip" onclick="openEditActionType('${t.id}')">Edit</button>
        <button class="btn-chip btn-chip-danger" onclick="tryDeleteActionType('${t.id}')">Delete</button>
      </div>
    </div>
  `).join('');
}
function actionTypeFormHtml(t) {
  return `
    <div class="form-group"><label>Icon (emoji)</label><input type="text" id="type-icon" maxlength="4" value="${t ? t.icon : '⭐'}"></div>
    <div class="form-group"><label>Label</label><input type="text" id="type-label" value="${t ? escapeAttr(t.label) : ''}" placeholder="e.g. Car Wash"></div>
    <div class="form-group"><label>Feeds Into</label>
      <select id="type-group">
        <option value="expense" ${t && t.group === 'expense' ? 'selected' : ''}>Expenses Log</option>
        <option value="maintenance" ${t && t.group === 'maintenance' ? 'selected' : ''}>Maintenance Log</option>
        <option value="damage" ${t && t.group === 'damage' ? 'selected' : ''}>Damage Log</option>
      </select>
    </div>
  `;
}
function openAddActionType() {
  openModal(`<h3>Add Quick Entry Button</h3>${actionTypeFormHtml(null)}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveActionTypeForm()">Add</button></div>`);
}
function openEditActionType(id) {
  const t = DB.listActionTypes().find(t => t.id === id);
  openModal(`<h3>Edit Quick Entry Button</h3>${actionTypeFormHtml(t)}
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button><button class="btn-primary" onclick="saveActionTypeForm('${id}')">Save</button></div>`);
}
function saveActionTypeForm(id) {
  const patch = {
    icon: document.getElementById('type-icon').value.trim() || '⭐',
    label: capitalizeFirst(document.getElementById('type-label').value.trim()) || 'Untitled',
    group: document.getElementById('type-group').value
  };
  if (id) DB.updateActionType(id, patch);
  else DB.addActionType(patch);
  closeModal();
  toast(id ? 'Button updated' : 'Button added');
}
function tryDeleteActionType(id) {
  openModal(`<h3>Delete this button?</h3>
    <p class="hint-text">Existing entries logged with it are kept, just no longer shown as a live button.</p>
    <div class="modal-actions"><button class="btn-secondary" onclick="closeModal()">Cancel</button>
    <button class="btn-danger" onclick="reallyDeleteActionType('${id}')">Delete</button></div>`);
}
function reallyDeleteActionType(id) {
  const ok = DB.deleteActionType(id);
  closeModal();
  toast(ok ? 'Button deleted' : 'You need at least one button');
}

function openCategoryManager(typeId) {
  const t = DB.listActionTypes().find(t => t.id === typeId);
  const rowsHtml = t.categories.map(c => `
    <div class="form-group category-edit-row">
      <input type="text" class="category-input" value="${escapeAttr(c)}">
      <button type="button" class="btn-icon-danger" onclick="this.closest('.category-edit-row').remove()">✕</button>
    </div>
  `).join('');
  openModal(`
    <h3>Categories — ${escapeHtml(t.label)}</h3>
    <div id="category-edit-rows">${rowsHtml}</div>
    <button type="button" class="btn-secondary" onclick="addCategoryRow()">+ Add Category</button>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveCategoryManager('${typeId}')">Save</button>
    </div>
  `);
}
function addCategoryRow() {
  const container = document.getElementById('category-edit-rows');
  const div = document.createElement('div');
  div.className = 'form-group category-edit-row';
  div.innerHTML = `<input type="text" class="category-input" placeholder="New category">
    <button type="button" class="btn-icon-danger" onclick="this.closest('.category-edit-row').remove()">✕</button>`;
  container.appendChild(div);
}
function saveCategoryManager(typeId) {
  const inputs = document.querySelectorAll('#category-edit-rows .category-input');
  const categories = [...inputs].map(i => capitalizeFirst(i.value.trim())).filter(Boolean);
  if (!categories.includes('Other')) categories.push('Other');
  DB.setActionTypeCategories(typeId, categories);
  closeModal();
  toast('Categories updated');
}

// ---- Backup / restore ------------------------------------------

function exportBackup() {
  const json = DB.exportJSON();
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `manskit-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('Backup file downloaded');
}
function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try { DB.importJSON(reader.result); toast('Backup restored ✓'); }
    catch (e) { toast('That file is not a valid backup', 'error'); }
  };
  reader.readAsText(file);
  event.target.value = '';
}

async function backupToFirebase() {
  if (!FirebaseSync.isConfigured()) { toast('Configure firebase-config.js first', 'error'); return; }
  try {
    toast('Backing up…');
    const updatedAt = await FirebaseSync.backup(DB.getAll());
    DB.updateFirebaseSettings({ lastSyncedAt: updatedAt });
    toast('Backed up to cloud ✓');
  } catch (e) { console.error(e); toast(e.message || 'Backup failed', 'error'); }
}
function restoreFromFirebase() {
  if (!FirebaseSync.isConfigured()) { toast('Configure firebase-config.js first', 'error'); return; }
  openModal(`
    <h3>Restore from cloud?</h3>
    <p class="hint-text">This replaces everything currently on this device with the cloud backup.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="reallyRestoreFromFirebase()">Restore</button>
    </div>
  `);
}
async function reallyRestoreFromFirebase() {
  closeModal();
  try {
    toast('Restoring…');
    const data = await FirebaseSync.restore();
    DB.replaceAll(data);
    toast('Restored from cloud ✓');
  } catch (e) { console.error(e); toast(e.message || 'Restore failed', 'error'); }
}

/* =========================================================================
   REQUIRED FIREBASE EMAIL AUTHENTICATION
   ========================================================================= */

let firebaseAuthReady = false;
let authUnsubscribe = null;

function authErrorMessage(error) {
  const code = error?.code || '';
  const messages = {
    'auth/invalid-credential': 'Email or password is incorrect.',
    'auth/wrong-password': 'Email or password is incorrect.',
    'auth/user-not-found': 'No account was found for this email.',
    'auth/email-already-in-use': 'An account already exists for this email.',
    'auth/weak-password': 'Use a stronger password with at least 6 characters.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Please try again later.'
  };
  return messages[code] || error?.message || 'Authentication failed.';
}

async function requireEmailSignIn() {
  const screen = document.getElementById('auth-screen');
  screen.classList.remove('hidden');
  try {
    authUnsubscribe = await FirebaseSync.onAuthStateChanged((user) => {
      if (user) {
        firebaseAuthReady = true;
        screen.classList.add('hidden');
        applyLockScreenIfNeeded();
        checkRemindersOnLoad();
        document.getElementById('auth-status').textContent = `Signed in as ${user.email}`;
      } else {
        firebaseAuthReady = false;
        screen.classList.remove('hidden');
        document.getElementById('auth-status').textContent = 'Sign in is required to continue.';
      }
    });
  } catch (error) {
    document.getElementById('auth-status').textContent = 'Firebase Authentication is not available.';
    showAuthError(error.message || 'Enable Email/Password in Firebase Console.');
  }
}

function showAuthError(message) {
  const el = document.getElementById('auth-error');
  el.textContent = message;
  el.classList.remove('hidden');
}
function clearAuthError() { document.getElementById('auth-error').classList.add('hidden'); }
function showAuthReset() { clearAuthError(); document.getElementById('auth-signin-view').classList.add('hidden'); document.getElementById('auth-reset-view').classList.remove('hidden'); }
function showAuthSignIn() { clearAuthError(); document.getElementById('auth-reset-view').classList.add('hidden'); document.getElementById('auth-signin-view').classList.remove('hidden'); }
async function signInToApp() {
  clearAuthError();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showAuthError('Enter your email and password.'); return; }
  try { document.getElementById('auth-status').textContent = 'Signing in…'; await FirebaseSync.signIn(email, password); }
  catch (error) { showAuthError(authErrorMessage(error)); document.getElementById('auth-status').textContent = 'Sign in is required to continue.'; }
}
async function createAppAccount() {
  clearAuthError();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  if (!email || !password) { showAuthError('Enter an email and password to create your account.'); return; }
  if (password.length < 6) { showAuthError('Use a password with at least 6 characters.'); return; }
  try { document.getElementById('auth-status').textContent = 'Creating account…'; await FirebaseSync.createAccount(email, password); }
  catch (error) { showAuthError(authErrorMessage(error)); document.getElementById('auth-status').textContent = 'Sign in is required to continue.'; }
}
async function sendAppPasswordReset() {
  clearAuthError();
  const email = document.getElementById('auth-reset-email').value.trim();
  if (!email) { showAuthError('Enter the email address for your account.'); return; }
  try { await FirebaseSync.sendPasswordReset(email); document.getElementById('auth-status').textContent = 'Password reset email sent. Check your inbox.'; }
  catch (error) { showAuthError(authErrorMessage(error)); }
}
async function signOutOfApp() {
  try { await FirebaseSync.signOut(); } catch (error) { toast(authErrorMessage(error), 'error'); }
}

/* =========================================================================
   APP LOCK (fix #7) — local password, security-question recovery
   ========================================================================= */

let unlockedThisSession = false;

function applyLockScreenIfNeeded() {
  const sec = DB.getSecurity();
  if (sec.enabled && !unlockedThisSession) {
    document.getElementById('lock-screen').classList.remove('hidden');
    showPasswordView();
  }
}

function showPasswordView() {
  document.getElementById('lock-password-view').classList.remove('hidden');
  document.getElementById('lock-forgot-view').classList.add('hidden');
  document.getElementById('lock-error').classList.add('hidden');
}
function showForgotPassword() {
  const sec = DB.getSecurity();
  document.getElementById('lock-password-view').classList.add('hidden');
  document.getElementById('lock-forgot-view').classList.remove('hidden');
  document.getElementById('lock-question-text').textContent = sec.question || '(No security question was set.)';
  document.getElementById('lock-recovery-email-hint').textContent = sec.recoveryEmail
    ? `Recovery email on file: ${sec.recoveryEmail} (for your own reference — MANSKIT can't send email, so use the security question below).`
    : '';
}
async function attemptUnlock() {
  const entered = document.getElementById('lock-password-input').value;
  const sec = DB.getSecurity();
  const hash = await hashText(entered);
  if (hash === sec.passwordHash) {
    unlockedThisSession = true;
    document.getElementById('lock-screen').classList.add('hidden');
    document.getElementById('lock-password-input').value = '';
  } else {
    const err = document.getElementById('lock-error');
    err.textContent = 'Incorrect password. Try again.';
    err.classList.remove('hidden');
  }
}
async function attemptRecovery() {
  const answer = document.getElementById('lock-answer-input').value.trim();
  const newPassword = document.getElementById('lock-new-password').value;
  const sec = DB.getSecurity();
  const answerHash = await hashText(answer.toLowerCase());
  if (!newPassword) { showRecoveryError('Enter a new password.'); return; }
  if (answerHash !== sec.answerHash) { showRecoveryError('That answer doesn\'t match.'); return; }
  const passwordHash = await hashText(newPassword);
  DB.updateSecurity({ passwordHash });
  unlockedThisSession = true;
  document.getElementById('lock-screen').classList.add('hidden');
  document.getElementById('lock-answer-input').value = '';
  document.getElementById('lock-new-password').value = '';
  toast('Password reset ✓');
}
function showRecoveryError(msg) {
  const el = document.getElementById('lock-recovery-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function openAppLockSetup() {
  openModal(`
    <h3>Set Up App Lock</h3>
    <div class="form-group"><label>Password</label><input type="password" id="setup-password"></div>
    <div class="form-group"><label>Confirm Password</label><input type="password" id="setup-password-confirm"></div>
    <div class="form-group"><label>Recovery Email (for your reference only — no emails are sent)</label><input type="email" id="setup-email" placeholder="optional"></div>
    <div class="form-group"><label>Security Question</label><input type="text" id="setup-question" placeholder="e.g. What was your first car?"></div>
    <div class="form-group"><label>Answer</label><input type="text" id="setup-answer"></div>
    <p class="hint-text">This locks the app screen on this device. Since MANSKIT works fully offline, there's no server to email you a reset — the security question is how you get back in if you forget your password.</p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveAppLockSetup()">Enable App Lock</button>
    </div>
  `);
}
async function saveAppLockSetup() {
  const pw = document.getElementById('setup-password').value;
  const pwConfirm = document.getElementById('setup-password-confirm').value;
  const question = document.getElementById('setup-question').value.trim();
  const answer = document.getElementById('setup-answer').value.trim();
  if (!pw || pw.length < 4) { toast('Password must be at least 4 characters', 'error'); return; }
  if (pw !== pwConfirm) { toast('Passwords don\'t match', 'error'); return; }
  if (!question || !answer) { toast('Add a security question and answer for recovery', 'error'); return; }

  const passwordHash = await hashText(pw);
  const answerHash = await hashText(answer.toLowerCase());
  DB.updateSecurity({
    enabled: true,
    passwordHash,
    recoveryEmail: document.getElementById('setup-email').value.trim(),
    question,
    answerHash
  });
  unlockedThisSession = true;
  closeModal();
  toast('App Lock enabled');
}

function openChangePassword() {
  openModal(`
    <h3>Change Password</h3>
    <div class="form-group"><label>Current Password</label><input type="password" id="change-current-password"></div>
    <div class="form-group"><label>New Password</label><input type="password" id="change-new-password"></div>
    <div class="form-group"><label>Confirm New Password</label><input type="password" id="change-new-password-confirm"></div>
    <p class="hint-text error-text hidden" id="change-password-error"></p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-primary" onclick="saveChangePassword()">Save</button>
    </div>
  `);
}
async function saveChangePassword() {
  const sec = DB.getSecurity();
  const current = document.getElementById('change-current-password').value;
  const next = document.getElementById('change-new-password').value;
  const confirm = document.getElementById('change-new-password-confirm').value;
  const currentHash = await hashText(current);
  if (currentHash !== sec.passwordHash) { showChangeError('Current password is incorrect.'); return; }
  if (!next || next.length < 4) { showChangeError('New password must be at least 4 characters.'); return; }
  if (next !== confirm) { showChangeError('New passwords don\'t match.'); return; }
  DB.updateSecurity({ passwordHash: await hashText(next) });
  closeModal();
  toast('Password changed');
}
function showChangeError(msg) {
  const el = document.getElementById('change-password-error');
  el.textContent = msg;
  el.classList.remove('hidden');
}

function openDisableAppLock() {
  openModal(`
    <h3>Disable App Lock</h3>
    <p class="hint-text">Enter your password to confirm.</p>
    <div class="form-group"><input type="password" id="disable-password"></div>
    <p class="hint-text error-text hidden" id="disable-password-error"></p>
    <div class="modal-actions">
      <button class="btn-secondary" onclick="closeModal()">Cancel</button>
      <button class="btn-danger" onclick="confirmDisableAppLock()">Disable</button>
    </div>
  `);
}
async function confirmDisableAppLock() {
  const sec = DB.getSecurity();
  const entered = document.getElementById('disable-password').value;
  const hash = await hashText(entered);
  if (hash !== sec.passwordHash) {
    document.getElementById('disable-password-error').textContent = 'Incorrect password.';
    document.getElementById('disable-password-error').classList.remove('hidden');
    return;
  }
  DB.updateSecurity({ enabled: false, passwordHash: '', recoveryEmail: '', question: '', answerHash: '' });
  closeModal();
  toast('App Lock disabled');
}

/* =========================================================================
   Utilities
   ========================================================================= */

function fmt(n) {
  if (n === undefined || n === null || isNaN(n)) return '0';
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}
function formatDateOnly(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}
function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}
function todayDateStr() { return new Date().toISOString().slice(0, 10); }
function sortByTimeDesc(a, b) { return (a.time < b.time ? 1 : a.time > b.time ? -1 : (b.seq || 0) - (a.seq || 0)); }
function sortByDateDesc(a, b) { return new Date(b.date) - new Date(a.date); }
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function escapeAttr(str) { return escapeHtml(str); }
function capitalizeFirst(str) {
  const s = (str || '').toString().trim().replace(/\s+/g, ' ');
  if (!s) return s;
  return s.toLocaleLowerCase().replace(/\b[\p{L}\p{N}]/gu, ch => ch.toLocaleUpperCase());
}
function normalizeRegistrationNumber(str) {
  return (str || '').toString().trim().replace(/\s+/g, ' ').toUpperCase();
}
