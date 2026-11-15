/**
 * GAHONSH social autopilot - shared configuration.
 * Everything here is free. Nothing in this project calls a paid API.
 */

var CONFIG = {
  brand: 'GAHONSH',
  tagline: 'Websites, web apps and APIs, built properly',
  website: 'https://gahonsh-blip.github.io',
  portfolio: 'https://gahonsh-blip.github.io/portfolio.html',
  email: 'gahonsh@gmail.com',
  whatsapp: 'https://wa.me/919999999999',
  timezone: 'Asia/Kolkata',
  driveFolder: 'GAHONSH Social',
  defaultBlogId: '4592871834916952562', // gahonsh.blogspot.com, read from the public feed
  logSheetName: 'GAHONSH Social Post Log',
  logTabName: 'PostLog'
};

/** Read a Script Property with a default. */
function prop_(key, fallback) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  return value === null || value === '' ? (fallback === undefined ? '' : fallback) : value;
}

/** Date key used for idempotency and log rows: 2026-11-15 */
function dateKey_(date) {
  return Utilities.formatDate(date, CONFIG.timezone, 'yyyy-MM-dd');
}

/** Stable small hash so the same date always picks the same topic. */
function dayIndex_(date, modulo) {
  var start = new Date(Date.UTC(date.getFullYear(), 0, 1));
  var diff = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start.getTime()) / 86400000);
  return Math.abs(diff + date.getFullYear()) % modulo;
}
