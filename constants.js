/* =========================================================================
   MANSKIT Vehicle Hub — Shared Constants
   ========================================================================= */

// App-wide currency is fixed to the rupee symbol (no currency picker).
const CURRENCY = '₹';

// Multi-angle gallery zones. 'left' doubles as the default cover / thumbnail
// photo (side-profile exterior shot), per spec.
const ZONE_LABELS = {
  front: 'Front View', rear: 'Rear View', left: 'Left Side (Cover)',
  right: 'Right Side', bumpers: 'Bumpers', doors: 'Doors', interior: 'Interior'
};
const GALLERY_ZONES = Object.keys(ZONE_LABELS);
const DEFAULT_COVER_ZONE = 'left';

// Built-in quick-entry action types, each with its own editable category
// list. Users can add more types from Settings; custom types start from
// the group's default preset list and can be edited/deleted freely.
const BUILTIN_ACTION_TYPES = [
  { id: 'fuel', label: 'Fuel', icon: '⛽', group: 'expense', builtin: true,
    categories: ['Petrol', 'Diesel', 'CNG', 'Electric Charging', 'Other'] },
  { id: 'maintenance', label: 'Maintenance', icon: '🔧', group: 'maintenance', builtin: true,
    categories: ['Oil Change', 'Tyre Rotation / Replacement', 'Brake Servicing', 'Engine Repair', 'Battery Replacement', 'General Service', 'Other'] },
  { id: 'expense', label: 'Expense / Toll / Fine', icon: '💸', group: 'expense', builtin: true,
    categories: ['Parking', 'Highway Toll', 'Traffic Fine / Challan', 'Car Wash', 'Other'] },
  { id: 'damage', label: 'Damage / Scratch', icon: '📸', group: 'damage', builtin: true, categories: [] }
];

// Fallback starter category list for a newly created custom action type,
// keyed by its group.
const CATEGORY_PRESETS_BY_GROUP = {
  expense: ['Parking', 'Highway Toll', 'Traffic Fine / Challan', 'Car Wash', 'Other'],
  maintenance: ['Oil Change', 'Tyre Rotation / Replacement', 'Brake Servicing', 'Engine Repair', 'Battery Replacement', 'General Service', 'Other']
};

const DAMAGE_STATUSES = ['Pending', 'Fixed'];
const PAYERS = ['You', 'Partner', 'Split'];
const GROUP_ICON = { expense: '💸', maintenance: '🔧', damage: '📸' };

// Key Specifications card fields (Screen 2) — general "what is this vehicle"
// facts, separate from the consumable/maintenance-focused glovebox cards.
const KEY_SPEC_FIELDS = [
  ['model', 'Model'],
  ['variant', 'Variant / Trim'],
  ['engine', 'Engine'],
  ['cylinders', 'Number of Cylinders'],
  ['transmission', 'Transmission Type'],
  ['seatingCapacity', 'Seating Capacity'],
  ['fuelType', 'Fuel Type']
];

// Document types (Screen 2 > Documents) and reminder types (Screen 2 >
// Reminders). Both lists include 'Other' / 'Custom' as an escape hatch.
const DOCUMENT_TYPES = ['RC (Registration Certificate)', 'Insurance', 'Pollution Certificate (PUC)', 'Driving License', 'Other'];
const REMINDER_TYPES = ['Oil Change', 'Insurance Renewal', 'Pollution Certificate', 'License Renewal', 'Custom'];

// Sections offered in the "Share Vehicle Details" tool (fix #1).
const SHARE_SECTIONS = [
  ['keySpecs', 'Key Specifications'],
  ['engineOil', 'Engine Oil & Filter'],
  ['coolantBrake', 'Coolant & Brake Fluid'],
  ['tyre', 'Tyre Specifications'],
  ['filters', 'Filters & Consumables'],
  ['serviceStation', 'Preferred Service Station']
];
