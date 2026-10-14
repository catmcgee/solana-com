/*
 * Run button for recorded example output (WP5).
 *
 * Generated snippets (apps/docs/snippets/examples/**, built by
 * packages/docs-tooling) render each recorded output as
 *
 *   <div class="sol-run" data-run="<block id>" data-tab="Kit" [data-runner="generate-keypair"]>
 *     <div class="sol-run-bar"><button class="sol-run-btn">Run</button><span class="sol-run-note">…</span></div>
 *     <div class="sol-run-out"> …recorded output code block… </div>
 *     [<pre class="sol-run-live"></pre>]
 *   </div>
 *
 * Without JavaScript the output is simply visible and the button is hidden
 * (styles/run.css). This script only enhances: it marks <html data-sol-run>
 * so the CSS hides outputs and shows the Run buttons, then reveals an output
 * after a short "Running" state (500 ms, none under prefers-reduced-motion).
 * Nothing is executed against a network.
 *
 * Mintlify injects this file on every page and navigates client-side, so all
 * handling is delegated from `document`; no per-element setup is needed.
 * Mintlify custom JS cannot import npm packages, hence the inline base58.
 */
(function () {
  if (window.__solRunExamples) return;
  window.__solRunExamples = true;

  var MIN_RUN_MS = 500;
  document.documentElement.setAttribute("data-sol-run", "");

  function reducedMotion() {
    return (
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  // ---------------------------------------------------------------------
  // Browser runners: produce fresh output instead of the recorded sample.
  // ---------------------------------------------------------------------
  var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  function base58(bytes) {
    var digits = [0];
    for (var i = 0; i < bytes.length; i++) {
      var carry = bytes[i];
      for (var j = 0; j < digits.length; j++) {
        carry += digits[j] << 8;
        digits[j] = carry % 58;
        carry = (carry / 58) | 0;
      }
      while (carry > 0) {
        digits.push(carry % 58);
        carry = (carry / 58) | 0;
      }
    }
    var out = "";
    for (var k = 0; k < bytes.length && bytes[k] === 0; k++) out += "1";
    for (var d = digits.length - 1; d >= 0; d--) out += B58[digits[d]];
    return out;
  }

  /** Python's repr() of a bytes object, e.g. b'G\xcd\x7e' (solders prints this). */
  function pythonBytes(bytes) {
    var hasSingle = false;
    var hasDouble = false;
    for (var i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x27) hasSingle = true;
      if (bytes[i] === 0x22) hasDouble = true;
    }
    var quote = hasSingle && !hasDouble ? '"' : "'";
    var out = "";
    for (var j = 0; j < bytes.length; j++) {
      var b = bytes[j];
      var c = String.fromCharCode(b);
      if (c === "\\" || c === quote) out += "\\" + c;
      else if (b === 0x0a) out += "\\n";
      else if (b === 0x0d) out += "\\r";
      else if (b === 0x09) out += "\\t";
      else if (b >= 0x20 && b < 0x7f) out += c;
      else out += "\\x" + (b < 16 ? "0" : "") + b.toString(16);
    }
    return "b" + quote + out + quote;
  }

  function generateKeyPair() {
    var subtle = window.crypto && window.crypto.subtle;
    if (!subtle) return Promise.reject(new Error("WebCrypto unavailable"));
    return subtle
      .generateKey({ name: "Ed25519" }, true, ["sign", "verify"])
      .then(function (kp) {
        return Promise.all([
          subtle.exportKey("raw", kp.publicKey),
          subtle.exportKey("pkcs8", kp.privateKey),
        ]);
      })
      .then(function (keys) {
        var pub = new Uint8Array(keys[0]);
        var pkcs8 = new Uint8Array(keys[1]);
        // PKCS#8 Ed25519 keys end with the 32-byte seed (the Solana "secret").
        return { address: base58(pub), secret: pkcs8.slice(pkcs8.length - 32) };
      });
  }

  var RUNNERS = {
    // cookbook/wallets/create-keypair: every run prints a new address, so
    // generate a real Ed25519 key pair in the browser. Formats match what each
    // flavour prints (see the recorded .output.txt files).
    "generate-keypair": function (tab) {
      return generateKeyPair().then(function (k) {
        if (tab === "Kit") return "address:  " + k.address; // console.log("address: ", x)
        if (tab === "Python")
          return "address: " + k.address + "\nsecret: " + pythonBytes(k.secret);
        return "address: " + k.address;
      });
    },
  };

  // ---------------------------------------------------------------------
  // Run button
  // ---------------------------------------------------------------------
  // React may re-create the snippet DOM (breakpoint changes, tab remounts),
  // which drops attributes this script set. Finished runs are therefore
  // remembered by key and re-applied to re-created elements.
  var finished = {};

  // One pass over the page: key = path | block | tab | nth occurrence.
  function indexBoxes() {
    var boxes = document.querySelectorAll(".sol-run");
    var seen = {};
    var list = [];
    for (var i = 0; i < boxes.length; i++) {
      var b = boxes[i];
      var id =
        (b.getAttribute("data-run") || "") +
        "|" +
        (b.getAttribute("data-tab") || "");
      var n = seen[id] || 0;
      seen[id] = n + 1;
      list.push({ box: b, key: location.pathname + "|" + id + "|" + n });
    }
    return list;
  }

  function keyOf(box) {
    var list = indexBoxes();
    for (var i = 0; i < list.length; i++)
      if (list[i].box === box) return list[i].key;
    return "";
  }

  function findByKey(key) {
    var list = indexBoxes();
    for (var i = 0; i < list.length; i++)
      if (list[i].key === key) return list[i].box;
    return null;
  }

  // Button semantics: it discloses the output region it controls.
  var outIds = 0;
  function ensureAria(box) {
    var button = box.querySelector(".sol-run-btn");
    var out = box.querySelector(".sol-run-out");
    if (!button || !out) return;
    var n = ++outIds;
    if (!out.id) out.id = "sol-run-out-" + n;
    var controls = out.id;
    // Browser runners show fresh output in .sol-run-live instead.
    var live = box.querySelector(".sol-run-live");
    if (live) {
      if (!live.id) live.id = "sol-run-live-" + n;
      controls += " " + live.id;
    }
    if (button.getAttribute("aria-controls") !== controls)
      button.setAttribute("aria-controls", controls);
    if (!button.hasAttribute("aria-expanded"))
      button.setAttribute("aria-expanded", "false");
  }

  function applyDone(box, record) {
    var button = box.querySelector(".sol-run-btn");
    var live = box.querySelector(".sol-run-live");
    if (record.live && live) {
      if (live.textContent !== record.live) live.textContent = record.live;
      box.setAttribute("data-live", "");
    } else {
      box.removeAttribute("data-live");
    }
    var out = box.querySelector(".sol-run-out");
    if (out) out.setAttribute("aria-live", "polite");
    box.setAttribute("data-state", "done");
    box.removeAttribute("aria-busy");
    if (button) {
      button.disabled = false;
      button.textContent = record.runner ? "Run again" : "Run";
      button.setAttribute("aria-expanded", "true");
    }
  }

  function run(box, button) {
    if (box.getAttribute("data-state") === "running") return;
    var key = keyOf(box);
    box.setAttribute("data-state", "running");
    box.setAttribute("aria-busy", "true");
    ensureAria(box);
    button.disabled = true;
    button.textContent = "Running\u2026";

    var delay = new Promise(function (resolve) {
      setTimeout(resolve, reducedMotion() ? 0 : MIN_RUN_MS);
    });
    var runnerId = box.getAttribute("data-runner") || "";
    var runner = RUNNERS[runnerId];
    var fresh = runner
      ? runner(box.getAttribute("data-tab") || "").catch(function () {
          return null; // e.g. no Ed25519 in this browser: show the recorded sample
        })
      : Promise.resolve(null);

    Promise.all([fresh, delay]).then(function (results) {
      var record = { live: results[0], runner: !!runner };
      finished[key] = record;
      var target = box.isConnected ? box : findByKey(key);
      if (target) applyDone(target, record);
    });
  }

  var pending = false;
  function reapply() {
    pending = false;
    var list = indexBoxes();
    for (var i = 0; i < list.length; i++) {
      var box = list[i].box;
      ensureAria(box);
      if (box.hasAttribute("data-state")) continue;
      var record = finished[list[i].key];
      if (record) applyDone(box, record);
    }
  }
  function schedule() {
    if (pending) return;
    pending = true;
    (window.requestAnimationFrame || setTimeout)(reapply);
  }
  if (typeof MutationObserver === "function") {
    new MutationObserver(schedule).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule);

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;
    var button = target.closest(".sol-run-btn");
    if (!button) return;
    var box = button.closest(".sol-run");
    if (!box) return;
    event.preventDefault();
    run(box, button);
  });
})();
