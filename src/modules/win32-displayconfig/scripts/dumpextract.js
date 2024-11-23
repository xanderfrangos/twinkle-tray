/*
 * scripts/dumpextract.js: part of the "win32-displayconfig" Node package.
 * See the COPYRIGHT file at the top-level directory of this distribution.
 */
"use strict";
const w32mon = require("../index");
const util = require("util");

w32mon.extractDisplayConfig().then((output) => {
  console.log(util.inspect(output, { depth: 10 }));
});
