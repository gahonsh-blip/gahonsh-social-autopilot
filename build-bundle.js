#!/usr/bin/env node
/**
 * Builds ONE paste-ready file from the .gs modules.
 *
 * The Apps Script editor accepts multiple files, but one paste is far less
 * error-prone on a phone, so the single file is the recommended install.
 *
 *   node build-bundle.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const ORDER = ['config.gs', 'calendar.gs', 'content.gs', 'media.gs', 'publishers.gs', 'code.gs', 'backfill.gs'];
const OUT = path.join(ROOT, 'GAHONSH_AUTOPILOT.gs');

const header = `/**
 * GAHONSH social autopilot - single file build.
 * Generated from the modules in this repo by build-bundle.js. Do not edit here.
 *
 * Paste this whole file into script.google.com as Code.gs, then run setupAll().
 * Full instructions: SETUP.md
 */

`;

const body = ORDER.map((file) => {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  return `/* ======================= ${file} ======================= */\n\n${src.trim()}\n`;
}).join('\n');

fs.writeFileSync(OUT, header + body, 'utf8');
const lines = (header + body).split('\n').length;
console.log(`${path.basename(OUT)} written: ${lines} lines, ${(header + body).length} bytes`);
