import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

const source = readFileSync("netlify/edge-functions/location.ts", "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const exports = {};
new Function("exports", compiled)(exports);
const handler = exports.default;

const validContext = {
  geo: {
    city: "  Seattle  ",
    subdivision: { name: "Washington" },
    country: { name: "United States", code: "US" },
    latitude: 47.60621,
    longitude: -122.33207,
  },
  ip: "203.0.113.10",
};

const getResponse = await handler(new Request("https://askarc.chat/api/location"), validContext);
assert.equal(getResponse.status, 200);
const getPayload = await getResponse.json();
assert.deepEqual(getPayload, {
  location: {
    city: "Seattle",
    region: "Washington",
    country: "United States",
    latitude: 47.61,
    longitude: -122.33,
    source: "ip",
  },
});
assert.equal(getResponse.headers.get("access-control-allow-origin"), "*");
assert.match(getResponse.headers.get("cache-control"), /no-store/);
assert.equal(getResponse.headers.get("access-control-allow-methods"), "GET, OPTIONS");
assert.equal(JSON.stringify(getPayload).includes("203.0.113.10"), false);

const unavailable = await handler(new Request("https://askarc.chat/api/location"), {
  geo: { city: "Seattle", latitude: 91, longitude: -122 },
  ip: "203.0.113.10",
});
assert.deepEqual(await unavailable.json(), { location: null });

const missingCity = await handler(new Request("https://askarc.chat/api/location"), {
  geo: { latitude: 47, longitude: -122 },
});
assert.deepEqual(await missingCity.json(), { location: null });

const preflight = await handler(new Request("https://askarc.chat/api/location", { method: "OPTIONS" }), { geo: {} });
assert.equal(preflight.status, 204);
assert.equal(preflight.headers.get("access-control-allow-origin"), "*");
assert.equal(await preflight.text(), "");

const notAllowed = await handler(new Request("https://askarc.chat/api/location", { method: "POST" }), { geo: {} });
assert.equal(notAllowed.status, 405);
assert.equal(notAllowed.headers.get("access-control-allow-origin"), "*");

console.log("Netlify location edge endpoint checks passed.");
