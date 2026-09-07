"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { absolute } = require("../src/numbers.js");

test("absolute remains available", () => {
  assert.equal(absolute(-2), 2);
});
