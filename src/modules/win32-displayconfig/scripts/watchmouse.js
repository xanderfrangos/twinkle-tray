/*
 * scripts/watchmouse.js: part of the "win32-displayconfig" Node package.
 * See the COPYRIGHT file at the top-level directory of this distribution.
 */
"use strict";
const robotjs = require("robotjs");
const { VerticalRefreshRateContext } = require("../index");

const ctx = new VerticalRefreshRateContext();
let didShutdown = false;
let outstanding = 0;

setTimeout(() => {
  ctx.close();
  didShutdown = true;
  console.log(`Shutting down with ${outstanding} outstanding`);
}, 60 * 1000);

const pollInterval = setInterval(async () => {
  outstanding++;
  if (didShutdown) {
    clearInterval(pollInterval);
    outstanding--;
    return;
  }
  const pos = robotjs.getMousePos();
  const refreshRate = await ctx.findVerticalRefreshRateForDisplayPoint(
    pos.x,
    pos.y
  );
  console.log(
    `Refresh rate for position ${pos.x}, ${
      pos.y
    }: ${refreshRate} with ${outstanding--} outstanding`
  );
}, 250);
