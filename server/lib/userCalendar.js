// Per-user Google Calendar client.
//
// Like partyCalendar.js, but the calendar is the user's PRIMARY (not a shared
// org calendar) and authentication uses THAT user's refresh token (not Nick's).
// Used by the remote-observe scheduler where each Field Manager is the event
// organizer and is invited along with the Professor.

const crypto = require('crypto');
const { google } = require('googleapis');
const pool = require('../db/pool');

function makeOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI,
  );
}

// Returns a calendar client authenticated as `userId`. Throws a structured
// error if the user has not connected Google (no refresh token). Callers
// should surface that to the UI with a "Connect Google" gate.
async function getCalendarClientForUser(userId) {
  const [[user]] = await pool.query(
    'SELECT id, email, google_refresh_token FROM user WHERE id = ?',
    [userId],
  );
  if (!user) {
    const err = new Error('User not found');
    err.code = 'USER_NOT_FOUND';
    throw err;
  }
  if (!user.google_refresh_token) {
    const err = new Error('This account is not connected to Google. Sign in with Google to enable Calendar access.');
    err.code = 'NO_GOOGLE_TOKEN';
    throw err;
  }
  const oauth2Client = makeOAuthClient();
  oauth2Client.setCredentials({ refresh_token: user.google_refresh_token });
  const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
  return { calendar, user };
}

// Normalize "HH:MM" or "HH:MM:SS" into "HH:MM:SS".
function normalizeTime(timeVal) {
  let s = timeVal ? String(timeVal) : '12:00:00';
  if (/^\d{2}:\d{2}$/.test(s)) s += ':00';
  return s;
}

// Add minutes to a (dateStr, timeStr) pair using UTC-anchored math so the
// server's local TZ is irrelevant (Railway is UTC; a naive `new Date(...)`
// there lands at UTC instead of America/Los_Angeles).
function addMinutes({ dateStr, timeStr }, minutes) {
  const [y, mo, d] = dateStr.split('-').map(Number);
  const [h, m, s] = timeStr.split(':').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d, h, m, s || 0));
  dt.setUTCMinutes(dt.getUTCMinutes() + minutes);
  const pad = n => String(n).padStart(2, '0');
  return {
    dateStr: `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`,
    timeStr: `${pad(dt.getUTCHours())}:${pad(dt.getUTCMinutes())}:${pad(dt.getUTCSeconds())}`,
  };
}

// Compute the event window for a remote observation:
//   start = (sessionDate + classStartTime) - 10 minutes
//   end   = start + (classLengthMinutes + 25) minutes
// The +25 = 10 min pre-class + 15 min post-class debrief.
// All math is in "wall-clock" (LA) units; we hand the string to Google with
// timeZone:'America/Los_Angeles', so Google resolves the offset.
function computeEventWindow(sessionDate, classStartTime, classLengthMinutes) {
  const dateStr = String(sessionDate).split('T')[0];
  const timeStr = normalizeTime(classStartTime);
  const start = addMinutes({ dateStr, timeStr }, -10);
  const end = addMinutes(start, (parseInt(classLengthMinutes) || 60) + 25);
  return { start, end };
}

// "YYYY-MM-DD" -> "M/D/YY"
function formatShortDate(yyyymmdd) {
  const [y, m, d] = String(yyyymmdd).split('T')[0].split('-').map(Number);
  return `${m}/${d}/${String(y).slice(-2)}`;
}

// Create a Meet-enabled event on the user's primary calendar.
// Returns { eventId, calendarId, meetLink, eventStart, eventEnd }.
async function createRemoteObservationEvent({
  userId, title, description, sessionDate, classStartTime, classLengthMinutes,
  attendeeEmails,
}) {
  const { calendar } = await getCalendarClientForUser(userId);
  const { start, end } = computeEventWindow(sessionDate, classStartTime, classLengthMinutes);

  const requestBody = {
    summary: title,
    description,
    start: { dateTime: `${start.dateStr}T${start.timeStr}`, timeZone: 'America/Los_Angeles' },
    end:   { dateTime: `${end.dateStr}T${end.timeStr}`,     timeZone: 'America/Los_Angeles' },
    attendees: attendeeEmails.filter(Boolean).map(email => ({ email })),
    conferenceData: {
      createRequest: {
        requestId: crypto.randomUUID(),
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    guestsCanModify: false,
    reminders: { useDefault: true },
  };

  const { data } = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1,         // REQUIRED for auto-Meet-link
    sendUpdates: 'all',
    requestBody,
  });

  // Pull the Meet URL. `hangoutLink` is the convenient one; fall back to
  // walking entryPoints if Google hasn't filled it in synchronously (rare).
  let meetLink = data.hangoutLink || null;
  if (!meetLink && Array.isArray(data.conferenceData?.entryPoints)) {
    const video = data.conferenceData.entryPoints.find(e => e.entryPointType === 'video');
    meetLink = video?.uri || null;
  }

  return {
    eventId: data.id,
    calendarId: 'primary',
    meetLink,
    eventStart: `${start.dateStr} ${start.timeStr}`,
    eventEnd: `${end.dateStr} ${end.timeStr}`,
  };
}

// Soft-cancel via Calendar API. Swallows 410 (already gone).
async function deleteEvent(userId, eventId) {
  if (!eventId) return { deleted: false };
  const { calendar } = await getCalendarClientForUser(userId);
  try {
    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
      sendUpdates: 'all',
    });
    return { deleted: true };
  } catch (err) {
    if (err.code === 410 || err.response?.status === 410) return { deleted: true, alreadyGone: true };
    throw err;
  }
}

module.exports = {
  getCalendarClientForUser,
  createRemoteObservationEvent,
  deleteEvent,
  formatShortDate,
  computeEventWindow,
};
