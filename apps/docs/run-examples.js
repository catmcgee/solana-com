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
 * Terminal panels (.sol-term, src/lib/terminal.ts in packages/docs-tooling:
 * the job-path examples and demos) are server-rendered with the complete
 * output. This script turns each into a run: the screen starts with the
 * prompt only, Run shows a pending status, then streams the output lines back
 * in (a pause after each prompt while the transaction or request is in
 * flight, then the lines it printed, fast), shows the step's result badges,
 * the total time of the run, and offers Next step / Run all / Run again.
 * Values shortened with a middle ellipsis copy their full text on click (or
 * Enter/Space). Under prefers-reduced-motion every step appears at once and
 * the footer shows just "Done" (no total time). It only sets attributes (and text on the empty
 * status/time slots), never adds or removes elements, and re-applies its
 * state when React re-creates the markup.
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

  // ---------------------------------------------------------------------
  // Terminal panels (.sol-term)
  // ---------------------------------------------------------------------
  var terms = {}; // key -> run state
  var gen = 0; // bumps on every reset so stale timers stop

  function termList() {
    var roots = document.querySelectorAll(".sol-term:not([data-norun])");
    var seen = {};
    var list = [];
    for (var i = 0; i < roots.length; i++) {
      var r = roots[i];
      var id =
        (r.getAttribute("data-term") || "") +
        "|" +
        (r.getAttribute("data-tab") || "");
      var n = seen[id] || 0;
      seen[id] = n + 1;
      list.push({ root: r, key: location.pathname + "|" + id + "|" + n });
    }
    return list;
  }
  function termKey(root) {
    var list = termList();
    for (var i = 0; i < list.length; i++)
      if (list[i].root === root) return list[i].key;
    return "";
  }
  function termRoot(key) {
    var list = termList();
    for (var i = 0; i < list.length; i++)
      if (list[i].key === key) return list[i].root;
    return null;
  }

  function label(root, name, fallback) {
    return root.getAttribute("data-l-" + name) || fallback;
  }
  function setAttr(el, name, value) {
    if (!el) return;
    if (value === null) {
      if (el.hasAttribute(name)) el.removeAttribute(name);
    } else if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
  function setText(el, value) {
    if (el && el.textContent !== value) el.textContent = value;
  }
  function seconds(ms) {
    return (Math.max(ms, 100) / 1000).toFixed(1) + " s";
  }

  function stepsOf(root) {
    return root.querySelectorAll(".sol-term-step");
  }
  function rowsOf(step) {
    return step.querySelectorAll(".sol-term-row");
  }
  /** Rows shown before a step runs: its heading and first prompt. */
  function leadOf(step) {
    var rows = rowsOf(step);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].classList.contains("sol-term-cmd")) return i + 1;
      if (!rows[i].classList.contains("sol-term-note")) return i;
    }
    return rows.length;
  }

  function freshState(root) {
    return {
      total: stepsOf(root).length,
      done: 0, // completed steps
      cur: -1, // running step
      shown: 0, // rows shown in the running step
      all: false,
      status: "",
      durs: [],
      t0: 0,
      confirming: false, // the running step's status reached "Confirming…"
    };
  }

  /** Make shortened values copyable from the keyboard (idempotent). */
  function enhanceValues(root) {
    var hs = root.querySelectorAll(".sol-h");
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      var short = h.querySelector(".sol-h-s");
      setAttr(h, "tabindex", "0");
      setAttr(h, "role", "button");
      setAttr(
        h,
        "aria-label",
        "Copy " + (short ? short.textContent : h.getAttribute("title")),
      );
    }
  }

  function applyTerm(root, st) {
    var multi = st.total > 1;
    // Run all: the pause between two steps still counts as running.
    var running = st.cur >= 0 || !!st.chain;
    var finished = st.done >= st.total;
    var state = running
      ? "running"
      : finished
        ? "done"
        : st.done > 0
          ? "paused"
          : "idle";
    setAttr(root, "data-state", state);
    setAttr(root, "data-progress", String(st.done));
    setAttr(root, "aria-busy", running ? "true" : null);

    var steps = stepsOf(root);
    var next = st.cur >= 0 ? st.cur : st.done;
    for (var i = 0; i < steps.length; i++) {
      var step = steps[i];
      var rows = rowsOf(step);
      var show =
        i < st.done
          ? rows.length
          : i === next
            ? st.cur >= 0
              ? st.shown
              : leadOf(step)
            : 0;
      var caret = i === next && !finished ? show - 1 : -1;
      for (var r = 0; r < rows.length; r++) {
        setAttr(rows[r], "data-on", r < show ? "" : null);
        setAttr(rows[r], "data-caret", r === caret ? "" : null);
      }
      setAttr(step, "data-on", show > 0 || i === next ? "" : null);
      setAttr(step, "data-done", i < st.done ? "" : null);
      setAttr(step, "data-current", i === next && !finished ? "" : null);
    }

    var plan = root.querySelectorAll(".sol-term-plan > li");
    for (var p = 0; p < plan.length; p++)
      setAttr(
        plan[p],
        "data-state",
        p < st.done
          ? "done"
          : p === next
            ? running
              ? "running"
              : "current"
            : "todo",
      );

    var run = root.querySelector('.sol-term-btn[data-act="run"]');
    var all = root.querySelector('.sol-term-btn[data-act="all"]');
    if (run) {
      setText(
        run,
        running
          ? label(root, "running", "Running…")
          : finished
            ? label(root, "again", "Run again")
            : st.done > 0
              ? label(root, "next", "Next step")
              : multi
                ? label(root, "run-step", "Run step") + " 1"
                : label(root, "run", "Run"),
      );
      setAttr(run, "aria-disabled", running ? "true" : null);
    }
    if (all) setAttr(all, "hidden", finished || running ? "" : null);

    var status = root.querySelector(".sol-term-status");
    setText(status, st.status);
    setAttr(status, "data-busy", running ? "" : null);
    enhanceValues(root);
  }

  function announce(root, text) {
    setText(root.querySelector(".sol-term-sr"), text);
  }

  function badgesText(step) {
    var out = [];
    var bs = step.querySelectorAll(".sol-term-badge");
    for (var i = 0; i < bs.length; i++) out.push(bs[i].textContent);
    return out.join(", ");
  }

  /**
   * Pause before revealing a row. The wait sits where the real program waits:
   * after a prompt, until the call returns its first line (a transaction
   * being sent and confirmed, an HTTP round trip). The lines a call prints
   * after that come out together, so they are fast. Under a second for a
   * one-transaction step.
   */
  function delayFor(step, rows, index) {
    var row = rows[index];
    var jitter = ((index * 37) % 100) / 100; // deterministic, 0..1
    if (row.classList.contains("sol-term-cmd")) return 180 + jitter * 120;
    if (row.classList.contains("sol-term-note")) return 100;
    var prev = rows[index - 1];
    var first =
      !prev ||
      prev.classList.contains("sol-term-cmd") ||
      prev.classList.contains("sol-term-note");
    if (!first) return 35 + jitter * 50;
    var kind = step.getAttribute("data-pending") || "call";
    if (kind === "tx") return 380 + jitter * 120;
    if (kind === "http") return 300 + jitter * 150;
    return 140 + jitter * 100;
  }
  /** Is the wait before this row a call in flight (not local printing)? */
  function isSlow(rows, index) {
    var row = rows[index];
    if (!row || row.classList.contains("sol-term-cmd")) return false;
    if (row.classList.contains("sol-term-note")) return false;
    var prev = rows[index - 1];
    return (
      !prev ||
      prev.classList.contains("sol-term-cmd") ||
      prev.classList.contains("sol-term-note")
    );
  }
  /**
   * Status while a step runs. It only moves forward: a transaction step says
   * "Sending transaction…", then "Confirming…" from halfway through the first
   * wait to the end of the step.
   */
  function pendingText(root, step, st) {
    var kind = step.getAttribute("data-pending") || "call";
    if (kind === "tx" && st.confirming)
      return label(root, "confirming", "Confirming…");
    return label(
      root,
      kind,
      kind === "tx"
        ? "Sending transaction…"
        : kind === "http"
          ? "Requesting…"
          : "Running…",
    );
  }

  function scrollScreen(root) {
    var screen = root.querySelector(".sol-term-screen");
    if (screen && screen.scrollHeight > screen.clientHeight)
      screen.scrollTop = screen.scrollHeight;
  }

  function finishStep(key, st, root, i) {
    var steps = stepsOf(root);
    st.durs[i] = Date.now() - st.t0;
    st.confirming = false;
    st.done = i + 1;
    st.cur = -1;
    var finished = st.done >= st.total;
    var step = steps[i];
    var summary = step ? badgesText(step) : "";
    var multi = st.total > 1;
    // Under reduced motion the output appears at once, so a sub-second total
    // for several transactions would read as fake: show just "Done".
    st.status = finished
      ? reducedMotion()
        ? label(root, "done", "Done")
        : label(root, "done", "Done") +
          " · " +
          seconds(
            st.durs.reduce(function (sum, d) {
              return sum + (d || 0);
            }, 0),
          )
      : label(root, "step", "Step") +
        " " +
        st.done +
        "/" +
        st.total +
        " · " +
        label(root, "done", "Done");
    applyTerm(root, st);
    announce(
      root,
      (multi ? label(root, "step", "Step") + " " + st.done + ": " : "") +
        (summary || label(root, "done", "Done")),
    );
    scrollScreen(root);
    if (!finished && st.all) {
      st.chain = true;
      applyTerm(root, st);
      var g = gen;
      setTimeout(
        function () {
          if (g !== gen) return;
          st.chain = false;
          startStep(key, st.done);
        },
        reducedMotion() ? 0 : 450,
      );
    }
  }

  function startStep(key, i) {
    var st = terms[key];
    var root = termRoot(key);
    if (!st || !root) return;
    var step = stepsOf(root)[i];
    if (!step) return;
    var rows = rowsOf(step);
    st.cur = i;
    st.t0 = Date.now();
    st.shown = leadOf(step);
    st.confirming = false;
    st.status = pendingText(root, step, st);
    applyTerm(root, st);
    announce(root, st.status);

    if (reducedMotion()) {
      st.shown = rows.length;
      finishStep(key, st, root, i);
      return;
    }
    var g = gen;
    (function tick() {
      if (g !== gen) return;
      var r = termRoot(key);
      if (!r) return; // navigated away
      var s = stepsOf(r)[i];
      var rs = rowsOf(s);
      if (st.shown >= rs.length) {
        setTimeout(function () {
          if (g !== gen) return;
          var r2 = termRoot(key);
          if (r2) finishStep(key, st, r2, i);
        }, 150);
        return;
      }
      var wait = delayFor(s, rs, st.shown);
      st.status = pendingText(r, s, st);
      setText(r.querySelector(".sol-term-status"), st.status);
      if (
        isSlow(rs, st.shown) &&
        !st.confirming &&
        s.getAttribute("data-pending") === "tx"
      )
        // Sent; the rest of the wait is the confirmation.
        setTimeout(function () {
          if (g !== gen || st.cur !== i) return;
          st.confirming = true;
          st.status = pendingText(r, s, st);
          var r4 = termRoot(key);
          if (r4) setText(r4.querySelector(".sol-term-status"), st.status);
        }, wait / 2);
      setTimeout(function () {
        if (g !== gen) return;
        st.shown++;
        var r3 = termRoot(key);
        if (!r3) return;
        applyTerm(r3, st);
        scrollScreen(r3);
        tick();
      }, wait);
    })();
  }

  function termAction(root, act, button) {
    var key = termKey(root);
    if (!key) return;
    var st = terms[key] || (terms[key] = freshState(root));
    if (act === "copy") return copyOutput(root, button);
    if (st.cur >= 0 || st.chain) return; // already running
    if (st.done >= st.total) {
      // Run again: back to the empty prompt, then run step 1.
      gen++;
      st = terms[key] = freshState(root);
      st.all = act === "all";
      applyTerm(root, st);
      root.querySelector(".sol-term-screen").scrollTop = 0;
      startStep(key, 0);
      return;
    }
    st.all = act === "all";
    if (act === "all" && button && document.activeElement === button) {
      // The Run all button hides while running; keep focus on the panel.
      var run = root.querySelector('.sol-term-btn[data-act="run"]');
      if (run) run.focus();
    }
    startStep(key, st.done);
  }

  // Copy: full values (title) instead of the shortened ones.
  function plainText(node) {
    var out = "";
    for (var c = node.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3) out += c.nodeValue;
      else if (c.nodeType === 1) {
        if (c.classList.contains("sol-h-s")) continue;
        if (c.classList.contains("sol-h")) out += c.getAttribute("title") || "";
        else out += plainText(c);
      }
    }
    return out;
  }
  function screenText(root) {
    var rows = root.querySelectorAll(
      ".sol-term-screen .sol-term-cmd, .sol-term-screen .sol-term-ln",
    );
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
      var ind = Number(rows[i].getAttribute("data-indent") || 0);
      lines.push(new Array(ind + 1).join(" ") + plainText(rows[i]));
    }
    return lines.join("\n");
  }
  function writeClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText)
      return navigator.clipboard.writeText(text);
    return Promise.reject(new Error("no clipboard"));
  }
  function flash(el, root) {
    setAttr(el, "data-copied", label(root, "copied", "Copied"));
    clearTimeout(el.__solCopied);
    el.__solCopied = setTimeout(function () {
      el.removeAttribute("data-copied");
    }, 1400);
  }
  function copyOutput(root, button) {
    writeClipboard(screenText(root)).then(
      function () {
        flash(button, root);
        announce(root, label(root, "copied", "Copied"));
      },
      function () {},
    );
  }
  function copyValue(h) {
    var root = h.closest(".sol-term");
    writeClipboard(h.getAttribute("title") || "").then(
      function () {
        if (root) {
          flash(h, root);
          announce(root, label(root, "copied", "Copied"));
        }
      },
      function () {},
    );
  }

  function reapplyTerms() {
    var list = termList();
    for (var i = 0; i < list.length; i++) {
      var st = terms[list[i].key];
      applyTerm(list[i].root, st || freshState(list[i].root));
    }
  }

  var pending = false;
  function reapply() {
    pending = false;
    reapplyTerms();
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
    var h = target.closest(".sol-term .sol-h");
    if (h) {
      copyValue(h);
      return;
    }
    var act = target.closest(".sol-term [data-act]");
    if (act) {
      var root = act.closest(".sol-term");
      if (root && !root.hasAttribute("data-norun")) {
        event.preventDefault();
        if (act.getAttribute("aria-disabled") !== "true")
          termAction(root, act.getAttribute("data-act"), act);
      }
      return;
    }
    var button = target.closest(".sol-run-btn");
    if (!button) return;
    var box = button.closest(".sol-run");
    if (!box) return;
    event.preventDefault();
    run(box, button);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Enter" && event.key !== " ") return;
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;
    var h = target.closest(".sol-term .sol-h");
    if (!h) return;
    event.preventDefault();
    copyValue(h);
  });
})();
