/*************************************************************
 *  Knollwood — Reserve backend  (Google Apps Script)
 *  Powers the private reservation page (reserve.html):
 *    - verify : checks an access code
 *    - booking: logs a reservation request + emails the team
 *  (verify/submit/request kept for backward compatibility.)
 *************************************************************/

const TEAM_EMAIL  = 'zane@mgrealco.com,knollwood@mollenhourgross.com';  // alerts go to both
const REPLY_TO    = 'knollwood@mollenhourgross.com';
const EXPIRY_DAYS = 30;
const CODES_TAB   = 'Access Codes';
const REQ_TAB     = 'Requests';
const ACCESS_TAB  = 'Access Requests';
const BOOK_TAB    = 'Bookings';

/* ---------- menu ---------- */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Knollwood')
    .addItem('Set up sheet', 'setupSheet')
    .addItem('Generate access code…', 'generateCode')
    .addToUi();
}

/* ---------- one-time tab setup ---------- */
function setupSheet() {
  const ss = SpreadsheetApp.getActive();
  const BOOK_HEADERS = ['Timestamp', 'First', 'Last', 'Name', 'Email', 'Phone', 'Organization',
                        'Area', 'Preferred Date', 'Start', 'End', 'Guests', 'Notes',
                        'Terms Accepted', 'Terms Accepted At', 'Code'];

  let codes = ss.getSheetByName(CODES_TAB) || ss.insertSheet(CODES_TAB);
  if (codes.getLastRow() === 0) {
    codes.appendRow(['Code', 'Issued To', 'Issued', 'Expires', 'Notes']);
    codes.setFrozenRows(1); codes.getRange('A1:E1').setFontWeight('bold');
  }

  let book = ss.getSheetByName(BOOK_TAB) || ss.insertSheet(BOOK_TAB);
  if (book.getLastRow() === 0) {
    book.appendRow(BOOK_HEADERS);
    book.setFrozenRows(1);
    book.getRange(1, 1, 1, BOOK_HEADERS.length).setFontWeight('bold');
  } else {
    // Repair an existing Bookings tab created before the Organization column existed:
    // insert "Organization" between Phone and Area, preserving any data already logged.
    const hdr = book.getRange(1, 1, 1, book.getLastColumn()).getValues()[0];
    if (hdr.indexOf('Organization') === -1) {
      const phoneCol = hdr.indexOf('Phone');                                   // 0-based
      const insertAt = (phoneCol >= 0 ? phoneCol + 2 : book.getLastColumn() + 1); // 1-based column
      book.insertColumnBefore(insertAt);
      book.getRange(1, insertAt).setValue('Organization').setFontWeight('bold');
    }
  }

  SpreadsheetApp.getUi().alert('Setup complete. Use "Knollwood → Generate access code…" to issue codes.');
}

/* ---------- code generation ---------- */
function generateCode() {
  const ui = SpreadsheetApp.getUi();
  const resp = ui.prompt('Generate access code', 'Who is this code for? (name / company)', ui.ButtonSet.OK_CANCEL);
  if (resp.getSelectedButton() !== ui.Button.OK) return;
  const who = resp.getResponseText();
  const code = makeCode();
  const now = new Date();
  const exp = new Date(now.getTime() + EXPIRY_DAYS * 86400000);
  const ss = SpreadsheetApp.getActive();
  let codes = ss.getSheetByName(CODES_TAB);
  if (!codes) { setupSheet(); codes = ss.getSheetByName(CODES_TAB); }
  codes.appendRow([code, who, now, exp, '']);
  ui.alert('New access code for ' + (who || '(unspecified)') + ':\n\n' + code +
           '\n\nExpires ' + Utilities.formatDate(exp, Session.getScriptTimeZone(), 'MMM d, yyyy') + '.');
}

function makeCode() {
  const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous 0/O/1/I
  let s = '';
  for (let i = 0; i < 6; i++) s += A.charAt(Math.floor(Math.random() * A.length));
  return 'KW-' + s;
}

/* ---------- web endpoint (handles GET/JSONP and POST) ---------- */
function doGet(e)  { return handle(e); }
function doPost(e) { return handle(e); }

function handle(e) {
  const p = (e && e.parameter) || {};
  let out;
  try {
    if (p.action === 'verify') {
      out = { ok: isValid(p.code) };

    } else if (p.action === 'booking') {
      if (!isValid(p.code)) {
        out = { ok: false, error: 'code' };
      } else {
        SpreadsheetApp.getActive().getSheetByName(BOOK_TAB).appendRow([
          new Date(), p.first || '', p.last || '', p.name || '', p.email || '', p.phone || '', p.organization || '',
          p.area || '', p.date || '', p.start || '', p.end || '', p.guests || '', p.notes || '',
          p.terms_accepted || '', p.terms_accepted_at || '', String(p.code || '').toUpperCase()
        ]);
        notifyBooking(p);
        try { confirmGuest(p); } catch (e2) { /* never fail the booking over a confirmation email */ }
        out = { ok: true };
      }

    } else {
      out = { ok: false, error: 'unknown_action' };
    }
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  const body = JSON.stringify(out);
  if (p.callback) {   // JSONP (used by the website)
    return ContentService.createTextOutput(p.callback + '(' + body + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function isValid(code) {
  if (!code) return false;
  code = String(code).trim().toUpperCase();
  const sh = SpreadsheetApp.getActive().getSheetByName(CODES_TAB);
  if (!sh) return false;
  const data = sh.getDataRange().getValues();
  const now = new Date();
  for (let i = 1; i < data.length; i++) {
    const c = String(data[i][0] || '').trim().toUpperCase();
    if (c && c === code) {
      const exp = data[i][3];
      return (exp instanceof Date) ? (now <= exp) : true;
    }
  }
  return false;
}

function notifyBooking(p) {
  if (!TEAM_EMAIL) return;
  const subject = 'Knollwood reservation request — ' + (p.name || 'guest') + ' — ' + (p.date || '');
  const body = [
    'A new reservation request came in through the Knollwood reserve page:', '',
    'Name:            ' + (p.name || ''),
    'Email:           ' + (p.email || ''),
    'Phone:           ' + (p.phone || ''),
    'Organization:    ' + (p.organization || ''),
    'Area:            ' + (p.area || ''),
    'Preferred date:  ' + (p.date || ''),
    'Start:           ' + (p.start || ''),
    'End:             ' + (p.end || ''),
    'Guests:          ' + (p.guests || ''),
    'Notes:           ' + (p.notes || ''),
    'Code used:       ' + (p.code || ''),
    'Terms accepted:  ' + (p.terms_accepted || '') + (p.terms_accepted_at ? ('  (' + p.terms_accepted_at + ')') : ''), '',
    'Logged in the "Bookings" tab. Add it to the Google Calendar once confirmed.'
  ].join('\n');
  MailApp.sendEmail(TEAM_EMAIL, subject, body);
}

function confirmGuest(p) {
  if (!p.email) return;
  const name = (p.first || p.name || '').trim();
  const greeting = name ? ('Dear ' + name + ',') : 'Hello,';
  const body = [
    greeting, '',
    'Thank you for your reservation request at Knollwood. We are grateful that you are considering our home for your gathering, and we are pleased to confirm that we have received your request.',
    '',
    'A member of our team will follow up with you by email shortly to confirm availability and discuss the details.',
    '',
    'For your records, here is what you shared with us:',
    '  Area:             ' + (p.area || '—'),
    '  Preferred date:   ' + (p.date || '—'),
    '  Time:             ' + ((p.start || '—') + ' – ' + (p.end || '—')),
    '  Estimated guests: ' + (p.guests || '—'),
    '',
    'We look forward to being in touch.',
    '',
    'With gratitude,',
    'The Knollwood Team',
    'Mollenhour Gross · 150 Major Reynolds Pl, Knoxville, TN 37919'
  ].join('\n');
  MailApp.sendEmail(p.email, 'Thank you — we received your Knollwood reservation request', body, {
    name: 'Knollwood',
    replyTo: REPLY_TO
  });
}
