/**
 * Catalog of merge fields a flyer template can include.
 *
 * - field_key: stable identifier stored in the DB
 * - label: display name in the editor
 * - type: 'text' | 'qr_code' (more types like 'image' could be added later)
 * - source: 'program' | 'location' | 'derived' | 'manual' — where the value comes from when auto-populating
 * - description: shown in the field picker
 * - default: starting style hints when adding a fresh box
 *
 * If you add a new key here, the editor's add-field menu picks it up automatically;
 * the renderer can fill it from program/location data via buildFlyerData().
 */

const FLYER_FIELDS = [
  {
    key: 'location_name',
    label: 'Location Name',
    type: 'text',
    source: 'location',
    description: 'School / venue display name',
    default: { font_size: 12, alignment: 'left', auto_shrink: true },
  },
  {
    key: 'class_name',
    label: 'Class Name',
    type: 'text',
    source: 'program',
    description: 'e.g. "Mad Science"',
    default: { font_size: 18, alignment: 'center', auto_shrink: true },
  },
  {
    key: 'class_dates',
    label: 'Class Dates',
    type: 'text',
    source: 'derived',
    description: 'List of session dates (auto-built from program sessions)',
    default: { font_size: 12, alignment: 'left', auto_shrink: true },
  },
  {
    key: 'class_day',
    label: 'Class Day',
    type: 'text',
    source: 'derived',
    description: 'e.g. "Tuesdays"',
    default: { font_size: 14, alignment: 'center', auto_shrink: true },
  },
  {
    key: 'class_time',
    label: 'Class Time',
    type: 'text',
    source: 'derived',
    description: 'e.g. "2:30 - 3:30 PM"',
    default: { font_size: 14, alignment: 'center', auto_shrink: true },
  },
  {
    key: 'class_day_and_time',
    label: 'Day & Time (combined)',
    type: 'text',
    source: 'derived',
    description: 'e.g. "Tuesdays, 2:30 - 3:30 PM"',
    default: { font_size: 14, alignment: 'center', auto_shrink: true },
  },
  {
    key: 'class_cost',
    label: 'Class Cost',
    type: 'text',
    source: 'program',
    description: 'Parent cost, formatted as currency',
    default: { font_size: 16, alignment: 'center', auto_shrink: true },
  },
  {
    key: 'lab_fee',
    label: 'Lab Fee',
    type: 'text',
    source: 'program',
    description: 'Lab fee, formatted as currency',
    default: { font_size: 12, alignment: 'left', auto_shrink: true },
  },
  {
    key: 'grade_range',
    label: 'Grade Range',
    type: 'text',
    source: 'program',
    description: 'e.g. "K — 5th"',
    default: { font_size: 12, alignment: 'left', auto_shrink: true },
  },
  {
    key: 'session_count',
    label: 'Session Count',
    type: 'text',
    source: 'derived',
    description: 'e.g. "10 weeks"',
    default: { font_size: 12, alignment: 'left', auto_shrink: true },
  },
  {
    key: 'registration_link',
    label: 'Registration Link (text)',
    type: 'text',
    source: 'location',
    description: 'Short URL printed on the flyer',
    default: { font_size: 11, alignment: 'center', auto_shrink: true },
  },
  {
    key: 'qr_code',
    label: 'Registration QR Code',
    type: 'qr_code',
    source: 'location',
    description: 'QR code linking to the registration URL',
    default: {},
  },
  {
    key: 'note',
    label: 'Optional Note',
    type: 'text',
    source: 'manual',
    description: 'Free-text note (only printed if filled in)',
    default: { font_size: 11, alignment: 'left', auto_shrink: true, is_optional: true },
  },
];

const FLYER_FIELD_KEYS = new Set(FLYER_FIELDS.map((f) => f.key));

function isValidFieldKey(key) {
  return FLYER_FIELD_KEYS.has(key);
}

function getFieldDefinition(key) {
  return FLYER_FIELDS.find((f) => f.key === key) || null;
}

module.exports = { FLYER_FIELDS, FLYER_FIELD_KEYS, isValidFieldKey, getFieldDefinition };
