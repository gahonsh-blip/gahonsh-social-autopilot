/**
 * Calendar + festival awareness.
 *
 * Three sources, in priority order:
 *   1. An all-day event on the owner's Google Calendar that looks like a festival
 *      or a special day (the reliable path: Google already puts most of them there).
 *   2. A built-in list of fixed observances and the major Indian festivals whose
 *      dates are known for 2026.
 *   3. A ContentCalendar sheet the owner can edit without touching code.
 */

var FIXED_OBSERVANCES = {
  '01-01': 'New Year',
  '01-26': 'Republic Day',
  '02-14': 'Valentine\u2019s Day',
  '03-08': 'International Women\u2019s Day',
  '04-22': 'Earth Day',
  '05-01': 'Labour Day',
  '06-05': 'World Environment Day',
  '06-21': 'International Yoga Day',
  '08-15': 'Independence Day',
  '09-05': 'Teachers\u2019 Day',
  '10-02': 'Gandhi Jayanti',
  '10-24': 'United Nations Day',
  '11-14': 'Children\u2019s Day',
  '12-25': 'Christmas',
  '12-31': 'New Year\u2019s Eve'
};

/**
 * Major Indian festivals. Lunar dates move every year, so only 2026 is filled in
 * and 2027 is intentionally left to the calendar. Verify before relying on it.
 */
var INDIAN_FESTIVALS = {
  '2026-01-14': 'Makar Sankranti',
  '2026-02-15': 'Maha Shivratri',
  '2026-03-03': 'Holika Dahan',
  '2026-03-04': 'Holi',
  '2026-03-20': 'Eid al-Fitr',
  '2026-03-26': 'Ram Navami',
  '2026-04-03': 'Good Friday',
  '2026-05-27': 'Eid al-Adha',
  '2026-08-28': 'Raksha Bandhan',
  '2026-09-04': 'Janmashtami',
  '2026-09-14': 'Ganesh Chaturthi',
  '2026-10-20': 'Dussehra',
  '2026-11-08': 'Diwali',
  '2026-11-10': 'Bhai Dooj',
  '2026-11-24': 'Guru Nanak Jayanti'
};

var BUSINESS_DAYS = {
  '2026-09-13': 'Programmers\u2019 Day',
  '2026-11-27': 'Black Friday',
  '2026-11-30': 'Cyber Monday'
};

var FESTIVAL_WORDS = /diwali|holi|eid|christmas|new year|independence|republic|rakhi|raksha|janmashtami|ganesh|dussehra|navratri|durga|puja|pongal|sankranti|lohri|baisakhi|onam|bihu|shivratri|navami|jayanti|birthday|anniversary|festival|holiday/i;

function calendarEventsForDay_(date) {
  try {
    var events = CalendarApp.getDefaultCalendar().getEventsForDay(date);
    return events.map(function (event) {
      return { title: event.getTitle(), allDay: event.isAllDayEvent() };
    });
  } catch (err) {
    return [];
  }
}

/** Owner editable sheet: date | type | topic | caption | imageUrl */
function contentCalendarOverrides_() {
  var sheetId = prop_('CONTENT_CALENDAR_SHEET_ID');
  if (!sheetId) return [];
  try {
    var sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    var values = sheet.getDataRange().getValues();
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (!row[0]) continue;
      var key = row[0];
      if (Object.prototype.toString.call(key) === '[object Date]') {
        key = dateKey_(key);
      } else {
        key = String(key).trim();
      }
      rows.push({
        date: key,
        type: String(row[1] || '').toLowerCase() || 'business',
        topic: String(row[2] || ''),
        caption: String(row[3] || ''),
        imageUrl: String(row[4] || '')
      });
    }
    return rows;
  } catch (err) {
    return [];
  }
}

/**
 * Decide what today's post is about.
 * Returns { type: 'festival'|'business', occasion: string|null, source: string }
 */
function classifyDay_(date) {
  var key = dateKey_(date);
  var monthDay = key.slice(5);

  var overrides = contentCalendarOverrides_();
  for (var i = 0; i < overrides.length; i++) {
    if (overrides[i].date === key) {
      return { type: overrides[i].type, occasion: overrides[i].topic || null, source: 'content-sheet', override: overrides[i] };
    }
  }

  var events = calendarEventsForDay_(date);
  for (var j = 0; j < events.length; j++) {
    if (FESTIVAL_WORDS.test(events[j].title)) {
      return { type: 'festival', occasion: events[j].title, source: 'google-calendar' };
    }
  }

  if (INDIAN_FESTIVALS[key]) {
    return { type: 'festival', occasion: INDIAN_FESTIVALS[key], source: 'builtin-festival' };
  }
  if (BUSINESS_DAYS[key]) {
    return { type: 'occasion', occasion: BUSINESS_DAYS[key], source: 'builtin-business' };
  }
  if (FIXED_OBSERVANCES[monthDay]) {
    return { type: 'occasion', occasion: FIXED_OBSERVANCES[monthDay], source: 'builtin-fixed' };
  }

  return { type: 'business', occasion: null, source: 'rotation' };
}

/** Next 7 days, used by the preview command and by the backlog filler. */
function upcomingDays_(days) {
  var out = [];
  var today = new Date();
  for (var i = 0; i < days; i++) {
    var d = new Date(today.getTime() + i * 86400000);
    var classified = classifyDay_(d);
    out.push({ date: dateKey_(d), type: classified.type, occasion: classified.occasion });
  }
  return out;
}
