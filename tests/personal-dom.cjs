process.chdir(require("node:path").resolve(__dirname, ".."));
const { JSDOM } = require("jsdom");
const fs = require("node:fs"),
  assert = require("node:assert/strict");
const html = fs.readFileSync("tests/fixtures/personal.html", "utf8");
const dom = new JSDOM(html, {
  runScripts: "outside-only",
  url: "https://example.test/",
});
const w = dom.window;
w.HTMLDialogElement.prototype.showModal = function () {
  this.open = true;
};
w.HTMLDialogElement.prototype.close = function () {
  this.open = false;
};
w.eval(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
w.eval(fs.readFileSync("frontend/hig-ui.js", "utf8"));
w.eval(fs.readFileSync("frontend/personal.js", "utf8"));
w.document.dispatchEvent(new w.Event("DOMContentLoaded"));
const $ = (selector) => w.document.querySelector(selector),
  click = (selector) => $(selector).click();
const field = (selector, value) => {
  $(selector).value = value;
};
const submit = (selector, button) =>
  $(selector).dispatchEvent(
    new w.SubmitEvent("submit", {
      cancelable: true,
      bubbles: true,
      submitter: button ? $(button) : null,
    }),
  );
const tick = () => new Promise((r) => setTimeout(r, 0));
(async () => {
  click("[data-action=wallets]");
  field("#personalWallet [name=name]", "Tiền mặt");
  field("#personalWallet [name=opening]", "1000000");
  submit("#personalWallet");
  await tick();
  assert(!$("#personalDialog").open);
  click("[data-action=entry]");
  field("#personalEntry [name=title]", "Bữa trưa");
  field("#personalEntry [name=amount]", "85000");
  submit("#personalEntry");
  submit("#personalEntry");
  await tick();
  assert.equal(w.eval("Object.keys(memory.financeEntries).length"), 1);
  assert.match($("#view-finance").textContent, /Bữa trưa/);
  click(".personal-row [data-action=entry]");
  field("#personalEntry [name=kind]", "transfer");
  submit("#personalEntry");
  await tick();
  assert.match($(".personal-error").textContent, /hai ví/);
  click("[data-action=close]");
  click("[data-action=budget]");
  field("#personalBudget [name=amount]", "10000000");
  submit("#personalBudget");
  await tick();
  assert.equal(
    w.eval("Object.values(memory.financeBudgets)[0].amount"),
    10000000,
  );
  click("[data-action=goal]");
  field("#personalGoal [name=title]", "Đà Lạt");
  field("#personalGoal [name=target]", "8000000");
  submit("#personalGoal");
  await tick();
  assert.match($("#view-finance").textContent, /Đà Lạt/);
  click("[data-action=capsule]");
  assert.equal(w.document.querySelectorAll(".capsule-cover-option").length, 7);
  click('#personalCapsule input[name=cover][value=midnight]');
  assert.ok($("#capsuleCoverLive .capsule-cover-midnight"));
  field("#personalCapsule [name=title]", "Một lá thư");
  field("#personalCapsule [name=body]", "<img src=x onerror=alert(1)>");
  field("#personalCapsule [name=email]", "sally@example.com");
  submit("#personalCapsule", "#personalCapsule button[value=draft]");
  await tick();
  assert.equal(w.eval("Object.keys(memory.capsuleDrafts).length"), 1);
  assert.equal($("#view-capsules .capsule-card h2").textContent, "Một lá thư");
  assert.ok($(".capsule-card .capsule-cover-midnight"));
  click(".capsule-card");
  assert.equal($('#personalCapsule input[name=cover]:checked').value, "midnight");
  assert.equal(
    $("#personalCapsule [name=body]").value,
    "<img src=x onerror=alert(1)>",
  );
  assert.equal($("#personalDialog img"), null);
  click("[data-action=close]");
  w.eval("lang='en';document.dispatchEvent(new Event('akk:languagechange'))");
  assert.match($("#view-finance h1").textContent, /KimKim/);
  assert.match($("#view-capsules").textContent, /drafts/i);
  w.eval("authenticated=null;authListener(null)");
  assert.equal(w.document.querySelectorAll(".capsule-card").length, 0);
  assert(!$("#view-finance").textContent.includes("Bữa trưa"));
  console.log(
    "Passed duplicate-submit prevention, finance save/edit validation, budget, goal, capsule draft, XSS escaping, VI/EN and account cleanup.",
  );
  dom.window.close();
})().catch((error) => {
  console.error(error);
  dom.window.close();
  process.exitCode = 1;
});
