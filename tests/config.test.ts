import assert from "node:assert/strict";
import test from "node:test";
import { parseBentleyEnvironment } from "../src/config.js";

test("defaults Bentley environment to prod", () => {
  assert.equal(parseBentleyEnvironment(undefined), "prod");
});

test("accepts qa and production aliases", () => {
  assert.equal(parseBentleyEnvironment("qa"), "qa");
  assert.equal(parseBentleyEnvironment("prod"), "prod");
  assert.equal(parseBentleyEnvironment("production"), "prod");
});

test("rejects unknown Bentley environments", () => {
  assert.throws(() => parseBentleyEnvironment("staging"), /Unsupported ITWIN_ENV/);
});
