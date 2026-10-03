const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const mainSource = fs.readFileSync(path.join(__dirname, "..", "main.js"), "utf8");
const functionStart = mainSource.indexOf("function showShortcutGuide(");
const functionEnd = mainSource.indexOf("\n}\n\napp.whenReady()", functionStart);
assert.notEqual(functionStart, -1, "production showShortcutGuide function exists");
assert.notEqual(functionEnd, -1, "production showShortcutGuide function boundary exists");
const functionSource = mainSource.slice(functionStart, functionEnd + 2);

function loadProductionFunction({ full = null, isRegistered = true, showMessageBox }) {
  const context = {
    SHORTCUT: "CommandOrControl+Shift+A",
    SHORTCUT_LABEL: "⌘⇧A",
    globalShortcut: { isRegistered: () => isRegistered },
    full,
    dialog: { showMessageBox },
    shortcutGuidePromise: null,
  };
  return vm.runInNewContext(`(${functionSource})`, context);
}

test("uses the parent-window Electron dialog overload when the full window exists", async () => {
  const parent = { isDestroyed: () => false };
  let args;
  const showShortcutGuide = loadProductionFunction({
    full: parent,
    showMessageBox: (...values) => {
      args = values;
      return Promise.resolve({ response: 0 });
    },
  });

  await showShortcutGuide();
  assert.equal(args.length, 2);
  assert.equal(args[0], parent);
  assert.equal(args[1].title, "ArcAI Keyboard Shortcut");
  assert.deepEqual(Array.from(args[1].buttons), ["Got it"]);
});

test("uses the options-only overload when there is no live parent window", async (t) => {
  for (const full of [null, { isDestroyed: () => true }]) {
    await t.test(full ? "destroyed parent" : "missing parent", async () => {
      let args;
      const showShortcutGuide = loadProductionFunction({
        full,
        showMessageBox: (...values) => {
          args = values;
          return Promise.resolve({ response: 0 });
        },
      });

      await showShortcutGuide();
      assert.equal(args.length, 1);
      assert.equal(args[0].title, "ArcAI Keyboard Shortcut");
      assert.equal(args[0].detail.includes("being used"), false);
    });
  }
});

test("deduplicates concurrent guide requests and allows a later request", async () => {
  const resolveDialogs = [];
  let calls = 0;
  const showShortcutGuide = loadProductionFunction({
    showMessageBox: () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveDialogs.push(resolve);
      });
    },
  });

  const first = showShortcutGuide();
  const second = showShortcutGuide();
  assert.equal(second, first);
  assert.equal(calls, 1);

  resolveDialogs[0]({ response: 0 });
  await Promise.all([first, second]);
  const later = showShortcutGuide();
  resolveDialogs[1]({ response: 0 });
  await later;
  assert.equal(calls, 2);
});
