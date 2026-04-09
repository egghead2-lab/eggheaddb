const { google } = require('googleapis');
const pool = require('../db/pool');

const PARTY_CALENDAR_ID = process.env.PARTY_CALENDAR_ID || 'losangeles@professoregghead.com';
// Use Nick's credentials (user id 2) for calendar access
const CALENDAR_USER_ID = 2;

function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
}

async function getCalendarClient() {
  const [[user]] = await pool.query('SELECT google_refresh_token FROM user WHERE id = ?', [CALENDAR_USER_ID]);
  if (!user?.google_refresh_token) throw new Error('No Google refresh token for calendar user');

  const oauth2Client = makeOAuthClient();
  oauth2Client.setCredentials({ refresh_token: user.google_refresh_token });
  return google.calendar({ version: 'v3', auth: oauth2Client });
}

function formatPhone(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  return phone;
}

function combineDateAndTime(dateVal, timeVal) {
  const dateStr = dateVal instanceof Date ? dateVal.toISOString().split('T')[0] : String(dateVal).split('T')[0];
  const timeStr = timeVal ? String(timeVal) : '12:00:00';
  return new Date(`${dateStr}T${timeStr}`);
}

function buildCalendarEvent(party) {
  const startDateTime = combineDateAndTime(party.first_session_date, party.start_time);
  const endDateTime = new Date(startDateTime.getTime() + (party.class_length_minutes || 60) * 60000);

  const lines = [
    `Pay - Lead: $${party.lead_professor_pay || 0}`,
    party.lead_professor_drive_fee ? `Drive Fee - Lead: $${party.lead_professor_drive_fee}` : null,
    party.contact_first ? `Contact: ${party.contact_first} ${party.contact_last || ''} - ${formatPhone(party.contact_phone)}` : null,
    party.birthday_kid_name && party.birthday_kid_age ? `Birthday Kid: ${party.birthday_kid_name} turning ${party.birthday_kid_age}` : null,
    party.birthday_kid_name && !party.birthday_kid_age ? `Birthday Kid: ${party.birthday_kid_name}` : null,
    `Kids Expected: ${party.kids_expected || '?'}`,
    `Event Type: ${party.class_name || party.program_nickname}`,
    party.shirt_size ? `Shirt Size: ${party.shirt_size}` : null,
    party.general_notes ? `Notes: ${party.general_notes}` : null,
    party.glow_slime_amount_needed ? `Add Glow Slime - Amount: ${party.glow_slime_amount_needed}` : null,
    `Lead Professor: ${party.lead_first || ''} ${party.lead_last || ''} - ${formatPhone(party.lead_phone)}`,
    party.asst_email ? `Assistant Professor: ${party.asst_first || ''} ${party.asst_last || ''} - ${formatPhone(party.asst_phone)}` : null,
    party.assistant_professor_pay && party.asst_email ? `Pay - Assistant: $${party.assistant_professor_pay}` : null,
    '',
    'REMINDER: YOU MUST ARRIVE 20 MINUTES PRIOR TO THE PARTY START TIME AT THE LATEST!',
  ].filter(v => v !== null).join('\n');

  const attendees = [{ email: party.lead_email }];
  if (party.asst_email) attendees.push({ email: party.asst_email });

  return {
    summary: `Professor Egghead ${party.class_name || 'Party'}`,
    location: party.party_location_text || '',
    description: lines,
    start: { dateTime: startDateTime.toISOString(), timeZone: 'America/Los_Angeles' },
    end: { dateTime: endDateTime.toISOString(), timeZone: 'America/Los_Angeles' },
    attendees,
  };
}

async function fetchPartyRow(partyId) {
  const [[row]] = await pool.query(
    `SELECT p.id, p.program_nickname, p.first_session_date, p.start_time, p.class_length_minutes,
            p.party_location_text, p.lead_professor_pay, p.lead_professor_drive_fee,
            p.assistant_professor_pay, p.number_enrolled AS kids_expected,
            p.shirt_size, p.general_notes, p.glow_slime_amount_needed,
            p.birthday_kid_name, p.birthday_kid_age, p.calendar_event_id,
            c.class_name,
            lp.email AS lead_email, lp.first_name AS lead_first, lp.last_name AS lead_last, lp.phone_number AS lead_phone,
            ap.email AS asst_email, ap.first_name AS asst_first, ap.last_name AS asst_last, ap.phone_number AS asst_phone,
            par.first_name AS contact_first, par.last_name AS contact_last, par.phone AS contact_phone
     FROM program p
     LEFT JOIN class c ON c.id = p.class_id
     LEFT JOIN professor lp ON lp.id = p.lead_professor_id
     LEFT JOIN professor ap ON ap.id = p.assistant_professor_id
     LEFT JOIN parent par ON par.id = p.parent_id
     WHERE p.id = ?`, [partyId]
  );
  return row;
}

async function addPartyToCalendar(partyId) {
  const party = await fetchPartyRow(partyId);
  if (!party) throw new Error('Party not found');
  if (party.calendar_event_id) return { eventId: party.calendar_event_id, alreadyExists: true };

  const calendar = await getCalendarClient();
  const event = buildCalendarEvent(party);

  const { data } = await calendar.events.insert({
    calendarId: PARTY_CALENDAR_ID,
    requestBody: event,
    sendUpdates: 'all',
  });

  await pool.query('UPDATE program SET calendar_event_id = ?, calendar_event = ? WHERE id = ?', [data.id, 'X', partyId]);

  return { eventId: data.id, created: true };
}

async function syncPartyCalendarEvent(partyId) {
  const party = await fetchPartyRow(partyId);
  if (!party?.calendar_event_id) return { synced: false };

  const calendar = await getCalendarClient();
  const event = buildCalendarEvent(party);

  await calendar.events.patch({
    calendarId: PARTY_CALENDAR_ID,
    eventId: party.calendar_event_id,
    requestBody: event,
    sendUpdates: 'all',
  });

  return { synced: true };
}

async function deletePartyCalendarEvent(partyId) {
  const party = await fetchPartyRow(partyId);
  if (!party?.calendar_event_id) return { deleted: false };

  const calendar = await getCalendarClient();
  try {
    await calendar.events.delete({
      calendarId: PARTY_CALENDAR_ID,
      eventId: party.calendar_event_id,
      sendUpdates: 'all',
    });
  } catch (err) {
    if (err.code !== 410) throw err; // 410 = already deleted
  }

  await pool.query('UPDATE program SET calendar_event_id = NULL WHERE id = ?', [partyId]);
  return { deleted: true };
}

module.exports = { addPartyToCalendar, syncPartyCalendarEvent, deletePartyCalendarEvent, fetchPartyRow };
