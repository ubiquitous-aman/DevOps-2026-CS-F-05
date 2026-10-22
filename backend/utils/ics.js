/** ics.js — minimal iCalendar (.ics) builder for deadlines and interview rounds. */
const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => {
  const x = new Date(d);
  return `${x.getUTCFullYear()}${pad(x.getUTCMonth() + 1)}${pad(x.getUTCDate())}T${pad(x.getUTCHours())}${pad(x.getUTCMinutes())}${pad(x.getUTCSeconds())}Z`;
};
const esc = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
// RFC 5545: lines longer than 75 octets are folded
const fold = (line) => {
  const out = [];
  let rest = line;
  while (Buffer.byteLength(rest) > 74) {
    let cut = 74;
    while (Buffer.byteLength(rest.slice(0, cut)) > 74) cut -= 1;
    out.push(rest.slice(0, cut));
    rest = ` ${rest.slice(cut)}`;
  }
  out.push(rest);
  return out.join('\r\n');
};

/** events: [{ uid, start, end?, summary, description?, location? }] */
const buildIcs = (events, name = 'Placement Portal') => {
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Placement Portal//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(name)}`];
  events.forEach((e) => {
    const start = new Date(e.start);
    const end = e.end ? new Date(e.end) : new Date(start.getTime() + 60 * 60 * 1000);
    lines.push('BEGIN:VEVENT', `UID:${e.uid}@placement-portal`, `DTSTAMP:${stamp(new Date())}`,
      `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`, `SUMMARY:${esc(e.summary)}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.location) lines.push(`LOCATION:${esc(e.location)}`);
    lines.push('END:VEVENT');
  });
  lines.push('END:VCALENDAR');
  return `${lines.map(fold).join('\r\n')}\r\n`;
};

module.exports = { buildIcs };
