/* Personal modules. Account-scoped Firestore data and authenticated capsule API. */
(() => {
  "use strict";
  const FC = window.FirebaseClient;
  const state = {
    uid: null,
    entries: [],
    wallets: [],
    goals: [],
    budgets: [],
    drafts: [],
    sent: [],
    stops: [],
    month: localDate().slice(0, 7),
    tab: "waiting",
    wallet: "",
    ready: false,
    mailReady: false,
  };
  const categories = {
    food: ["Ăn uống", "Food", "heart"],
    travel: ["Di chuyển", "Transport", "next"],
    shopping: ["Mua sắm", "Shopping", "save"],
    home: ["Sinh hoạt", "Living", "home"],
    health: ["Sức khỏe", "Health", "heart"],
    study: ["Học tập", "Learning", "note"],
    fun: ["Giải trí", "Leisure", "music"],
    other: ["Khác", "Other", "more"],
  };
  const tr = (vi, en) =>
    typeof lang !== "undefined" && lang === "en" ? en : vi;
  const esc = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  const icon = (name) => HIG.icon(name).outerHTML;
  const money = (amount) =>
    new Intl.NumberFormat(tr("vi-VN", "en-US"), {
      style: "currency",
      currency: "VND",
      maximumFractionDigits: 0,
    }).format(amount);
  function localDate(date = new Date()) {
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, "0"),
      String(date.getDate()).padStart(2, "0"),
    ].join("-");
  }
  const amount = (value) => {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n <= 0 || n > 1e12)
      throw Error(
        tr(
          "Nhập số tiền nguyên từ 1 đến 1.000 tỷ đồng.",
          "Enter a whole amount between 1 and 1 trillion VND.",
        ),
      );
    return n;
  };
  const category = (id) => (categories[id] || categories.other)[tr("0", "1")];
  const button = (label, action, primary = false) =>
    `<button type="button" class="personal-btn ${primary ? "primary" : ""}" data-action="${action}">${label}</button>`;
  function col(name) {
    const collection = FC.userCol(name);
    if (!collection) throw Error(tr("Vui lòng đăng nhập.", "Please sign in."));
    return collection;
  }
  function feedback(error) {
    const messages = {
      "capsule/not-configured": tr(
        "Dịch vụ gửi thư chưa được cấu hình. Bản nháp của bạn đã được giữ lại.",
        "Email delivery is not configured. Your draft is safe.",
      ),
      "capsule/state-changed": tr(
        "Trạng thái thư đã thay đổi. Hãy làm mới danh sách.",
        "The letter status changed. Please refresh.",
      ),
      "capsule/already-sending": tr(
        "KimKim đã bắt đầu gửi thư, không thể hủy lúc này.",
        "KimKim has started sending. Cancellation is no longer available.",
      ),
      "capsule/invalid-date": tr(
        "Chọn thời điểm gửi sau ít nhất một phút.",
        "Choose a delivery time at least a minute ahead.",
      ),
      "capsule/limit-reached": tr(
        "Bạn đã đạt giới hạn 100 capsule trong bản thử nghiệm.",
        "You reached the beta limit of 100 capsules.",
      ),
      "capsule/storage-unavailable": tr(
        "Chưa kết nối được kho thư. Vui lòng thử lại.",
        "Could not connect to letter storage. Please retry.",
      ),
      "capsule/invalid-email": tr(
        "Kiểm tra lại email người nhận.",
        "Check the recipient email.",
      ),
    };
    if (messages[error?.message]) return messages[error.message];
    return error?.code === "permission-denied"
      ? tr(
          "Không có quyền lưu dữ liệu. Vui lòng kiểm tra cấu hình tài khoản.",
          "Saving is not permitted. Please check account configuration.",
        )
      : error?.message ||
          tr(
            "Chưa thực hiện được. Vui lòng thử lại.",
            "Could not complete this action. Please retry.",
          );
  }
  async function capsuleApi(path, body) {
    const response = await apiFetch(
      getApiUrl() + "/api/capsules" + path,
      body === undefined
        ? {}
        : {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          },
    );
    return response.json();
  }
  function modal(title, content) {
    const dialog = document.getElementById("personalDialog");
    dialog.innerHTML = `<header class="personal-dialog-header"><h2>${esc(title)}</h2><button type="button" data-action="close" aria-label="${tr("Đóng", "Close")}">×</button></header><div class="personal-dialog-body">${content}</div>`;
    if (!dialog.open) dialog.showModal();
    return dialog;
  }
  function formError(form, error) {
    form.querySelector(".personal-error").textContent = feedback(error);
  }
  async function submitForm(form, task) {
    if (form.dataset.busy) return;
    form.dataset.busy = "true";
    const owner = state.uid;
    const buttons = [...form.querySelectorAll("button[type=submit]")];
    buttons.forEach((b) => (b.disabled = true));
    try {
      await task(owner);
      if (owner === state.uid)
        document.getElementById("personalDialog").close();
    } catch (error) {
      if (owner === state.uid) formError(form, error);
    } finally {
      delete form.dataset.busy;
      buttons.forEach((b) => (b.disabled = false));
    }
  }
  function financialRows() {
    return state.entries.filter(
      (e) =>
        e.date?.startsWith(state.month) &&
        (!state.wallet ||
          e.wallet === state.wallet ||
          e.toWallet === state.wallet),
    );
  }
  function balance(walletId) {
    return state.entries.reduce(
      (total, e) => {
        if (e.wallet === walletId)
          total += e.kind === "income" ? e.amount : -e.amount;
        if (e.kind === "transfer" && e.toWallet === walletId) total += e.amount;
        return total;
      },
      state.wallets.find((w) => w.id === walletId)?.opening || 0,
    );
  }
  function renderFinance() {
    const view = document.getElementById("view-finance");
    if (!view) return;
    const rows = financialRows(),
      income = rows
        .filter((e) => e.kind === "income")
        .reduce((a, e) => a + e.amount, 0),
      expense = rows
        .filter((e) => e.kind === "expense")
        .reduce((a, e) => a + e.amount, 0);
    const budget = state.budgets.find((b) => b.id === state.month)?.amount || 0;
    const allExpense = state.entries
      .filter((e) => e.date?.startsWith(state.month) && e.kind === "expense")
      .reduce((a, e) => a + e.amount, 0);
    const totals = {};
    rows
      .filter((e) => e.kind === "expense")
      .forEach(
        (e) => (totals[e.category] = (totals[e.category] || 0) + e.amount),
      );
    view.innerHTML = `<div class="personal-kicker">KIMKIM FINANCE</div><header class="personal-head"><div><h1>${tr("Tiền của mình, KimKim ghi giúp.", "Your money, kept with KimKim.")}</h1><p>${tr("Một chút rõ ràng cho những kế hoạch của bạn.", "A little clarity for the plans that matter to you.")}</p></div>${button(icon("plus") + tr("Thêm giao dịch", "Add transaction"), "entry", true)}</header>
      <div class="personal-toolbar"><label><span class="sr-only">${tr("Tháng", "Month")}</span><input aria-label="${tr("Tháng", "Month")}" type="month" id="financeMonth" value="${state.month}"></label><select id="financeWallet" aria-label="${tr("Lọc ví", "Filter wallet")}"><option value="">${tr("Tất cả ví", "All wallets")}</option>${state.wallets.map((w) => `<option value="${w.id}" ${state.wallet === w.id ? "selected" : ""}>${esc(w.name)}</option>`).join("")}</select>${button(tr("Ví của tôi", "My wallets"), "wallets")}${button(tr("Xuất CSV", "Export CSV"), "export")}</div>
      <div class="personal-status" id="financeStatus" role="status">${state.ready ? "" : tr("KimKim đang mở sổ…", "KimKim is opening your ledger…")}</div>
      <div class="personal-metrics">${[
        [tr("Chênh lệch thu chi", "Net cash flow"), income - expense],
        [tr("Thu nhập", "Income"), income],
        [tr("Chi tiêu", "Expenses"), expense],
      ]
        .map(
          ([label, value]) =>
            `<div class="personal-card personal-metric"><span>${label}</span><strong>${money(value)}</strong></div>`,
        )
        .join("")}</div>
      <div class="personal-columns"><section class="personal-card"><h2>${tr("KimKim ghi lại gần đây", "Recently in your KimKim ledger")}</h2>${
        rows.length
          ? rows
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map(
                (e) =>
                  `<div class="personal-row"><span class="personal-icon">${icon(e.kind === "transfer" ? "next" : categories[e.category]?.[2] || "save")}</span><div class="personal-row-copy"><b>${esc(e.title)}</b><small>${esc(e.date)} · ${esc(e.kind === "transfer" ? tr("Chuyển ví", "Transfer") : category(e.category))}</small></div><span class="personal-row-amount">${e.kind === "income" ? "+" : e.kind === "expense" ? "−" : ""}${money(e.amount)}</span><button data-action="entry" data-id="${e.id}" aria-label="${tr("Sửa giao dịch", "Edit transaction")}">${icon("edit")}</button></div>`,
              )
              .join("")
          : `<div class="personal-empty">${tr("Tháng này còn là một trang mới.<br>Ghi khoản đầu tiên cùng KimKim nhé.", "A fresh page for this month.<br>Add your first transaction with KimKim.")}</div>`
      }</section>
      <div class="personal-stack"><section class="personal-card"><h2>${tr("KimKim giữ nhịp ngân sách", "Your budget with KimKim")}</h2><div class="personal-stat-line"><b>${money(allExpense)}</b><span>${budget ? "/ " + money(budget) : tr("Chưa đặt ngân sách", "No budget set")}</span></div>${budget ? `<progress class="personal-bar" max="${budget}" value="${Math.min(allExpense, budget)}"></progress><p class="personal-muted">${allExpense > budget ? tr("Đã vượt ngân sách ", "Over budget by ") + money(allExpense - budget) : tr("Còn ", "Remaining ") + money(budget - allExpense)}</p>` : ""}${button(tr("Đặt ngân sách tháng", "Set monthly budget"), "budget")}</section>
      <section class="personal-card"><h2>${tr("Bạn đã chi cho điều gì?", "Where did your money go?")}</h2>${
        Object.entries(totals)
          .sort((a, b) => b[1] - a[1])
          .map(
            ([key, value]) =>
              `<div class="personal-stat-line"><span>${esc(category(key))}</span><b>${money(value)} · ${Math.round((value / expense) * 100)}%</b></div><progress class="personal-bar" max="${expense}" value="${value}"></progress>`,
          )
          .join("") ||
        `<p class="personal-muted">${tr("Biểu đồ sẽ xuất hiện khi bạn có khoản chi.", "Your breakdown appears after your first expense.")}</p>`
      }</section>
      <section class="personal-card"><h2>${tr("Để dành cùng KimKim", "Save for something with KimKim")}</h2>${state.goals.map((g) => `<div class="personal-row"><div class="personal-row-copy"><b>${esc(g.title)}</b><small>${money(g.saved || 0)} / ${money(g.target)} ${g.date ? "· " + esc(g.date) : ""}</small><progress class="personal-bar" max="${g.target}" value="${Math.min(g.saved || 0, g.target)}"></progress></div><button data-action="goal-add" data-id="${g.id}" aria-label="${tr("Thêm tiền mục tiêu", "Add goal contribution")}">${icon("plus")}</button></div>`).join("") || `<p class="personal-muted">${tr("Một chuyến đi, một món quà, một điều bạn mong.", "A trip, a gift, something to look forward to.")}</p>`}${button(tr("Tạo mục tiêu", "Create goal"), "goal")}</section></div></div>`;
  }
  function walletOptions(selected) {
    return state.wallets
      .map(
        (w) =>
          `<option value="${w.id}" ${selected === w.id ? "selected" : ""}>${esc(w.name)}</option>`,
      )
      .join("");
  }
  function entryForm(id) {
    if (!state.wallets.length) {
      walletForm();
      return;
    }
    const old = state.entries.find((e) => e.id === id) || {};
    const entryId = old.id || crypto.randomUUID();
    modal(
      tr("KimKim ghi khoản này", "Add it to your KimKim ledger"),
      `<form id="personalEntry" class="personal-form"><input type="hidden" name="id" value="${old.id || ""}"><div class="personal-form-grid"><label>${tr("Loại giao dịch", "Transaction type")}<select name="kind">${[
        ["expense", tr("Chi tiêu", "Expense")],
        ["income", tr("Thu nhập", "Income")],
        ["transfer", tr("Chuyển ví", "Transfer")],
      ]
        .map(
          ([v, l]) =>
            `<option value="${v}" ${old.kind === v ? "selected" : ""}>${l}</option>`,
        )
        .join(
          "",
        )}</select></label><label>${tr("Số tiền (VND)", "Amount (VND)")}<input name="amount" type="number" min="1" max="1000000000000" step="1" required value="${old.amount || ""}" inputmode="numeric" autofocus></label></div><label>${tr("Tên giao dịch", "Title")}<input name="title" maxlength="100" required value="${esc(old.title || "")}" placeholder="${tr("Ví dụ: Bữa trưa", "For example: Lunch")}"></label><div class="personal-form-grid"><label>${tr("Ví", "Wallet")}<select name="wallet">${walletOptions(old.wallet)}</select></label><label>${tr("Ngày", "Date")}<input name="date" type="date" required value="${old.date || localDate()}"></label><label>${tr("Danh mục", "Category")}<select name="category">${Object.keys(
        categories,
      )
        .map(
          (k) =>
            `<option value="${k}" ${old.category === k ? "selected" : ""}>${category(k)}</option>`,
        )
        .join(
          "",
        )}</select></label><label id="destinationWallet">${tr("Ví nhận (chuyển ví)", "Destination (transfer)")}<select name="toWallet">${walletOptions(old.toWallet || state.wallets[1]?.id)}</select></label></div><label>${tr("Ghi chú", "Note")}<input name="note" maxlength="500" value="${esc(old.note || "")}"></label><p class="personal-error" role="alert"></p><div class="personal-actions">${id ? button(tr("Xóa", "Delete"), "delete-entry") : ""}<button class="personal-btn primary" type="submit">${tr("Nhờ KimKim ghi lại", "Save with KimKim")}</button></div></form>`,
    );
    const form = document.getElementById("personalEntry");
    const sync = () => {
      document.getElementById("destinationWallet").hidden =
        form.elements.kind.value !== "transfer";
    };
    form.elements.kind.onchange = sync;
    sync();
    form.onsubmit = (e) => {
      e.preventDefault();
      submitForm(form, async (owner) => {
        const values = Object.fromEntries(new FormData(form));
        const id = entryId;
        delete values.id;
        values.amount = amount(values.amount);
        if (values.kind === "transfer" && values.wallet === values.toWallet)
          throw Error(
            tr("Hãy chọn hai ví khác nhau.", "Choose two different wallets."),
          );
        if (values.kind !== "transfer") values.toWallet = "";
        values.title = values.title.trim();
        if (!values.title)
          throw Error(tr("Nhập tên giao dịch.", "Enter a title."));
        await FC.db
          .collection("users")
          .doc(owner)
          .collection("financeEntries")
          .doc(id)
          .set({ ...values, updatedAt: FC.serverTimestamp() });
      });
    };
  }
  function walletForm() {
    const walletId = crypto.randomUUID();
    modal(
      tr("Ví của bạn cùng KimKim", "Your wallets with KimKim"),
      `<div>${state.wallets.map((w) => `<div class="personal-row"><span class="personal-icon">${icon("save")}</span><div class="personal-row-copy"><b>${esc(w.name)}</b><small>${tr("Số dư hiện tại", "Current balance")}</small></div><b>${money(balance(w.id))}</b></div>`).join("")}</div><form id="personalWallet" class="personal-form"><label>${tr("Tên ví mới", "New wallet name")}<input name="name" maxlength="60" required placeholder="${tr("Tiền mặt, ngân hàng…", "Cash, bank…")}"></label><label>${tr("Số dư đầu kỳ (VND)", "Opening balance (VND)")}<input name="opening" type="number" step="1" min="0" max="1000000000000" required value="0"></label><p class="personal-error" role="alert"></p><button class="personal-btn primary" type="submit">${tr("Tạo ví", "Create wallet")}</button></form>`,
    );
    const form = document.getElementById("personalWallet");
    form.onsubmit = (e) => {
      e.preventDefault();
      submitForm(form, async () => {
        const name = form.elements.name.value.trim(),
          opening = Number(form.elements.opening.value);
        if (
          !name ||
          !Number.isSafeInteger(opening) ||
          opening < 0 ||
          opening > 1e12
        )
          throw Error(
            tr("Kiểm tra tên và số dư ví.", "Check wallet name and balance."),
          );
        await col("financeWallets")
          .doc(walletId)
          .set({ name, opening, createdAt: FC.serverTimestamp() });
      });
    };
  }
  function budgetForm() {
    modal(
      tr("Ngân sách tháng cùng KimKim", "Monthly budget with KimKim"),
      `<form id="personalBudget" class="personal-form"><p class="personal-muted">${esc(state.month)}</p><label>${tr("Hạn mức chi tiêu (VND)", "Spending limit (VND)")}<input name="amount" type="number" min="1" step="1" max="1000000000000" required value="${state.budgets.find((b) => b.id === state.month)?.amount || ""}"></label><p class="personal-error" role="alert"></p><button type="submit" class="personal-btn primary">${tr("Lưu ngân sách", "Save budget")}</button></form>`,
    );
    const month = state.month,
      form = document.getElementById("personalBudget");
    form.onsubmit = (e) => {
      e.preventDefault();
      submitForm(form, () =>
        col("financeBudgets")
          .doc(month)
          .set({ amount: amount(form.elements.amount.value) }),
      );
    };
  }
  function goalForm(id) {
    const g = state.goals.find((g) => g.id === id);
    const goalId = crypto.randomUUID(),
      depositId = crypto.randomUUID();
    modal(
      tr("Để dành cùng KimKim", "Save with KimKim"),
      `<form id="personalGoal" class="personal-form">${g ? `<p>${esc(g.title)}</p><label>${tr("Đóng góp thêm (VND)", "Add contribution (VND)")}<input name="contribution" type="number" min="1" step="1" max="1000000000000" required></label><p class="personal-muted">${tr("Ghi nhận tiến độ mục tiêu. Hãy ghi khoản chuyển ví riêng nếu cần điều chỉnh số dư.", "This tracks goal progress. Record a wallet transfer separately to adjust balances.")}</p>` : `<label>${tr("Tên mục tiêu", "Goal name")}<input name="title" maxlength="100" required></label><label>${tr("Số tiền mục tiêu (VND)", "Target amount (VND)")}<input name="target" type="number" min="1" step="1" max="1000000000000" required></label><label>${tr("Ngày mong muốn", "Target date")}<input name="date" type="date"></label>`}<p class="personal-error" role="alert"></p><button class="personal-btn primary" type="submit">${tr("Lưu cùng KimKim", "Save with KimKim")}</button></form>`,
    );
    const form = document.getElementById("personalGoal");
    form.onsubmit = (e) => {
      e.preventDefault();
      submitForm(form, async () => {
        if (g) {
          const contribution = amount(form.elements.contribution.value);
          const ref = col("financeGoals").doc(g.id);
          await FC.db.runTransaction(async (tx) => {
            const deposit = col("financeDeposits").doc(depositId);
            const [snap, already] = await Promise.all([
              tx.get(ref),
              tx.get(deposit),
            ]);
            if (already.exists) return;
            if (!snap.exists)
              throw Error(tr("Mục tiêu đã bị xóa.", "Goal no longer exists."));
            const saved = (snap.data().saved || 0) + contribution;
            if (saved > 1e12)
              throw Error(
                tr("Vượt giới hạn số tiền.", "Amount limit exceeded."),
              );
            tx.update(ref, { saved });
            tx.set(deposit, {
              goalId: g.id,
              amount: contribution,
              createdAt: FC.serverTimestamp(),
            });
          });
        } else {
          const title = form.elements.title.value.trim();
          if (!title)
            throw Error(tr("Nhập tên mục tiêu.", "Enter a goal name."));
          await col("financeGoals")
            .doc(goalId)
            .set({
              title,
              target: amount(form.elements.target.value),
              saved: 0,
              date: form.elements.date.value,
            });
        }
      });
    };
  }
  function exportEntries() {
    const safeCell = (value) =>
      '"' +
      String(value ?? "")
        .replace(/^[=+@\-]/, "'$&")
        .replaceAll('"', '""') +
      '"';
    const text =
      "\uFEFF" +
      [
        ["Date", "Type", "Title", "Amount (VND)", "Category", "Wallet", "Note"],
        ...financialRows().map((e) => [
          e.date,
          e.kind,
          e.title,
          e.amount,
          e.category,
          state.wallets.find((w) => w.id === e.wallet)?.name || "",
          e.note,
        ]),
      ]
        .map((row) => row.map(safeCell).join(","))
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "kimkim-finance-" + state.month + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const capsuleStatus = (item) =>
    ({
      draft: tr("Bản nháp", "Draft"),
      scheduled: tr("KimKim đang giữ thư", "KimKim is keeping your letter"),
      sending: tr("KimKim đang gửi", "KimKim is sending"),
      sent: tr("KimKim đã gửi thư", "KimKim sent your letter"),
      failed: tr("Gửi chưa thành công", "Delivery failed"),
      cancelled: tr("Đã hủy lịch gửi", "Delivery cancelled"),
    })[item.status] || item.status;
  function renderCapsules() {
    const items = [
      ...state.drafts
        .filter((d) => !state.sent.some((c) => c.draftId === d.id))
        .map((d) => ({ ...d, status: "draft" })),
      ...state.sent,
    ].filter((c) =>
      state.tab === "draft"
        ? c.status === "draft"
        : state.tab === "sent"
          ? ["sent", "cancelled"].includes(c.status)
          : ["scheduled", "sending", "failed"].includes(c.status),
    );
    const view = document.getElementById("view-capsules");
    if (!view) return;
    view.innerHTML = `<div class="personal-kicker">KIMKIM CAPSULE</div><header class="personal-head"><div><h1>${tr("Gửi một chút hôm nay,<br>để KimKim giữ hộ.", "A little of today,<br>kept for tomorrow by KimKim.")}</h1><p>${tr("Những lời nhắn hôm nay, dành cho một ngày mai.", "Today’s words, for a day yet to come.")}</p></div>${button(icon("plus") + tr("Tạo KimKim Capsule", "Create KimKim Capsule"), "capsule", true)}</header>
    ${!state.mailReady ? `<div class="personal-notice">${tr("Bạn có thể soạn thư và lưu bản nháp. Gửi email hẹn giờ sẽ mở khi dịch vụ gửi thư được cấu hình.", "You can write and save drafts. Scheduled email delivery becomes available when the mail service is configured.")}</div>` : ""}
    <div class="personal-toolbar"><div class="personal-tabs">${[
      ["waiting", tr("Đang chờ", "Waiting")],
      ["sent", tr("Đã gửi / Đã hủy", "Sent / Cancelled")],
      ["draft", tr("Bản nháp", "Drafts")],
    ]
      .map(
        ([id, label]) =>
          `<button data-action="capsule-tab" data-id="${id}" aria-pressed="${state.tab === id}">${label}</button>`,
      )
      .join(
        "",
      )}</div>${button(tr("Làm mới", "Refresh"), "refresh-capsules")}</div><div class="personal-status" id="capsuleStatus" role="status"></div>
    <div class="personal-grid">${items.map((c) => `<button type="button" class="personal-card capsule-card" data-action="${c.status === "draft" ? "capsule" : "capsule-detail"}" data-id="${c.id}"><div class="capsule-cover">${c.photos?.[0] ? `<img src="${esc(c.photos[0])}" alt="">` : icon("message")}</div><div class="capsule-card-body"><span class="personal-badge">${esc(capsuleStatus(c))}</span><h2>${esc(c.title)}</h2><p class="personal-muted">${esc(c.email || "")}<br>${c.sendAt ? esc(new Date(c.sendAt).toLocaleString(tr("vi-VN", "en-US"))) : tr("Chưa chọn ngày gửi", "Choose a delivery date")}</p></div></button>`).join("")}</div>${items.length ? "" : `<div class="personal-empty">${icon("message")}<p>${tr("Có điều gì bạn muốn gửi đến tương lai?<br>KimKim sẽ giữ giúp bạn từ lời nhắn đầu tiên.", "Something you want to send into the future?<br>Start with a letter, kept by KimKim.")}</p>${button(tr("Viết lá thư đầu tiên", "Write your first letter"), "capsule", true)}</div>`}`;
  }
  async function refreshCapsules() {
    const owner = state.uid;
    if (!owner) return;
    try {
      const capabilities = await capsuleApi("/capabilities");
      if (owner !== state.uid) return;
      state.mailReady = capabilities.ready;
      if (state.mailReady) {
        const data = await capsuleApi("");
        if (owner !== state.uid) return;
        state.sent = data.items;
      }
      renderCapsules();
    } catch (error) {
      if (owner === state.uid) {
        state.mailReady = false;
        renderCapsules();
        document.getElementById("capsuleStatus").textContent = tr(
          "Chưa tải được trạng thái gửi thư. Hãy thử làm mới.",
          "Could not load deliveries. Please refresh.",
        );
      }
    }
  }
  async function compressPhotos(files) {
    if (files.length > 3)
      throw Error(tr("Chọn tối đa 3 ảnh.", "Choose up to 3 photos."));
    return Promise.all(
      [...files].map(async (file) => {
        if (
          !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
          file.size > 10 * 1024 * 1024
        )
          throw Error(
            tr(
              "Chọn ảnh JPG, PNG hoặc WebP dưới 10 MB.",
              "Choose JPG, PNG or WebP images under 10 MB.",
            ),
          );
        const image = await createImageBitmap(file);
        try {
          const scale = Math.min(1, 1000 / Math.max(image.width, image.height));
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas
            .getContext("2d")
            .drawImage(image, 0, 0, canvas.width, canvas.height);
          return canvas.toDataURL("image/jpeg", 0.65);
        } finally {
          image.close();
        }
      }),
    );
  }
  function capsuleForm(id) {
    const old = state.drafts.find((d) => d.id === id) || {},
      draftId = old.id || crypto.randomUUID();
    let photos = old.photos || [];
    modal(
      tr("Gửi cùng KimKim", "Send with KimKim"),
      `<form id="personalCapsule" class="personal-form" data-id="${draftId}"><label>${tr("Tiêu đề", "Title")}<input name="title" maxlength="100" required value="${esc(old.title || "")}" placeholder="${tr("Gửi tôi của một năm sau", "To me, a year from now")}"></label><label>${tr("Lời nhắn của bạn", "Your letter")}<textarea name="body" maxlength="12000" required placeholder="${tr("Hôm nay bạn muốn kể điều gì?", "What would you like to remember about today?")}">${esc(old.body || "")}</textarea></label><label>${tr("Ảnh đính kèm (tối đa 3)", "Photos (up to 3)")}<input id="capsulePhotos" type="file" accept="image/jpeg,image/png,image/webp" multiple></label><div class="capsule-photo-strip" id="capsulePhotoPreview">${photos.map((p) => `<img src="${esc(p)}" alt="">`).join("")}</div><div class="personal-form-grid"><label>${tr("Email người nhận", "Recipient email")}<input name="email" type="email" maxlength="254" value="${esc(old.email || "")}" placeholder="sally@example.com"></label><label>${tr("Ngày KimKim gửi", "Delivery date")}<input name="sendAt" type="datetime-local" value="${old.sendAt ? localDate(new Date(old.sendAt)) + "T" + new Date(old.sendAt).toTimeString().slice(0, 5) : ""}"></label></div><p class="personal-muted">${tr("Gửi tới email bên ngoài. Người nhận mở thư qua liên kết riêng, không cần tài khoản KimKim. Giờ gửi theo múi giờ của thiết bị.", "Send to any email. The recipient opens a private link without a KimKim account. Delivery time uses your device timezone.")}</p><p class="personal-error" role="alert"></p><div class="personal-actions">${id ? button(tr("Xóa nháp", "Delete draft"), "delete-draft") : ""}<button type="submit" class="personal-btn" name="mode" value="draft">${tr("Lưu nháp", "Save draft")}</button><button type="submit" class="personal-btn primary" name="mode" value="preview">${tr("Xem trước", "Preview")}</button></div></form>`,
    );
    const form = document.getElementById("personalCapsule");
    let photosReady = Promise.resolve();
    document.getElementById("capsulePhotos").onchange = (e) => {
      photosReady = compressPhotos(e.target.files)
        .then((result) => {
          photos = result;
          document.getElementById("capsulePhotoPreview").innerHTML = photos
            .map((p) => `<img src="${esc(p)}" alt="">`)
            .join("");
        })
        .catch((error) => {
          formError(form, error);
          throw error;
        });
      photosReady.catch(() => {});
    };
    form.onsubmit = (e) => {
      e.preventDefault();
      const preview = e.submitter?.value === "preview";
      if (form.dataset.busy) return;
      form.dataset.busy = "true";
      const owner = state.uid;
      (async () => {
        await photosReady;
        if (owner !== state.uid) return;
        const data = Object.fromEntries(new FormData(form));
        data.title = data.title.trim();
        data.body = data.body.trim();
        data.photos = photos;
        delete data.mode;
        data.sendAt = data.sendAt ? new Date(data.sendAt).toISOString() : "";
        if (!data.title || !data.body)
          throw Error(
            tr("Nhập tiêu đề và lời nhắn.", "Enter a title and letter."),
          );
        if (JSON.stringify(data).length > 420000)
          throw Error(
            tr(
              "Ảnh quá lớn. Hãy chọn ít ảnh hơn.",
              "Images are too large. Please select fewer photos.",
            ),
          );
        if (
          preview &&
          (!data.email ||
            !data.sendAt ||
            Date.parse(data.sendAt) < Date.now() + 60000)
        )
          throw Error(
            tr(
              "Nhập email và chọn thời điểm gửi sau ít nhất một phút.",
              "Enter an email and choose a delivery time at least a minute ahead.",
            ),
          );
        await FC.db
          .collection("users")
          .doc(owner)
          .collection("capsuleDrafts")
          .doc(draftId)
          .set({ ...data, updatedAt: FC.serverTimestamp() });
        if (owner !== state.uid) return;
        if (preview) capsulePreview({ ...data, id: draftId });
        else {
          state.tab = "draft";
          document.getElementById("personalDialog").close();
          renderCapsules();
        }
      })()
        .catch((error) => {
          if (owner === state.uid) formError(form, error);
        })
        .finally(() => {
          delete form.dataset.busy;
        });
    };
  }
  function capsulePreview(data) {
    modal(
      tr("Xem trước cùng KimKim", "Preview with KimKim"),
      `<span class="personal-badge">${tr("Bản xem trước", "Preview")}</span><h2>${esc(data.title)}</h2><p class="personal-muted">${esc(data.email)} · ${esc(new Date(data.sendAt).toLocaleString(tr("vi-VN", "en-US")))}</p><div class="capsule-letter">${esc(data.body)}</div><div class="capsule-photo-strip">${data.photos.map((p) => `<img src="${esc(p)}" alt="">`).join("")}</div><form id="capsuleSeal" class="personal-form"><p class="personal-muted">${tr("Sau khi niêm phong, nội dung và người nhận được chốt. Bạn có thể hủy lịch gửi trước khi KimKim bắt đầu gửi.", "Sealing fixes the letter and recipient. You can cancel before KimKim starts delivery.")}</p><p class="personal-error" role="alert"></p><div class="personal-actions">${button(tr("Sửa bản nháp", "Edit draft"), "capsule-back")}<button class="personal-btn primary" type="submit" ${state.mailReady ? "" : "disabled"}>${tr("Nhờ KimKim giữ hộ", "Let KimKim keep it")}</button></div></form>`,
    );
    const form = document.getElementById("capsuleSeal");
    form.querySelector("[data-action=capsule-back]").onclick = () =>
      capsuleForm(data.id);
    form.onsubmit = (e) => {
      e.preventDefault();
      submitForm(form, async (owner) => {
        const result = await capsuleApi("/seal", {
          ...data,
          language: tr("vi", "en"),
        });
        if (owner !== state.uid) return;
        state.sent = [result, ...state.sent.filter((c) => c.id !== result.id)];
        await FC.db
          .collection("users")
          .doc(owner)
          .collection("capsuleDrafts")
          .doc(data.id)
          .delete()
          .catch(() => {});
        state.tab =
          result.status === "sent" || result.status === "cancelled"
            ? "sent"
            : "waiting";
        renderCapsules();
      });
    };
  }
  function capsuleDetail(id) {
    const c = state.sent.find((c) => c.id === id);
    if (!c) return;
    modal(
      c.title,
      `<span class="personal-badge">${esc(capsuleStatus(c))}</span><div class="personal-row"><div class="personal-row-copy"><b>${tr("Email người nhận", "Recipient email")}</b><small>${esc(c.email)}</small></div></div><div class="personal-row"><div class="personal-row-copy"><b>${tr("Ngày KimKim gửi", "Delivery date")}</b><small>${esc(new Date(c.sendAt).toLocaleString(tr("vi-VN", "en-US")))}</small></div></div><p class="personal-muted">${tr("KimKim giữ nội dung thư đến thời điểm đã hẹn.", "KimKim keeps the letter until its scheduled delivery.")}</p>${c.status === "scheduled" ? `<form id="capsuleCancel" class="personal-form"><p class="personal-error" role="alert"></p><button class="personal-btn" type="submit">${tr("Hủy lịch gửi", "Cancel delivery")}</button></form>` : ""}`,
    );
    const form = document.getElementById("capsuleCancel");
    if (form)
      form.onsubmit = (e) => {
        e.preventDefault();
        submitForm(form, async () => {
          await capsuleApi("/" + id + "/cancel", {});
          await refreshCapsules();
        });
      };
  }
  async function actions(event) {
    const el = event.target.closest("[data-action]");
    if (!el) return;
    if (!el.closest(".personal-view,.personal-dialog")) return;
    const action = el.dataset.action,
      id = el.dataset.id;
    if (action === "close") {
      document.getElementById("personalDialog").close();
      return;
    }
    if (!state.uid) return;
    if (action === "entry") entryForm(id);
    if (action === "wallets") walletForm();
    if (action === "budget") budgetForm();
    if (action === "goal") goalForm();
    if (action === "goal-add") goalForm(id);
    if (action === "export") exportEntries();
    if (action === "capsule") capsuleForm(id);
    if (action === "capsule-detail") capsuleDetail(id);
    if (action === "capsule-tab") {
      state.tab = id;
      renderCapsules();
    }
    if (action === "refresh-capsules") await refreshCapsules();
    if (action === "delete-entry" || action === "delete-draft") {
      const form = el.closest("form"),
        recordId =
          action === "delete-entry" ? form.elements.id.value : form.dataset.id;
      if (!recordId) return;
      if (!(await window.confirm(tr("Xóa mục này?", "Delete this item?"))))
        return;
      await submitForm(form, () =>
        col(action === "delete-entry" ? "financeEntries" : "capsuleDrafts")
          .doc(recordId)
          .delete(),
      );
    }
  }
  function boot() {
    const main = document.querySelector("#app>.main");
    for (const id of ["finance", "capsules"]) {
      const view = document.createElement("section");
      view.id = "view-" + id;
      view.className = "view hidden personal-view";
      main.append(view);
    }
    const rail = document.querySelector(".sidebar"),
      heading = document.createElement("p");
    heading.className = "shell-nav-heading";
    heading.dataset.personalHeading = "true";
    const anchor =
      rail.querySelector(".shell-plan-card") ||
      rail.querySelector(".side-user");
    rail.insertBefore(heading, anchor);
    for (const [id, name, glyph] of [
      ["capsules", "KimKim Capsule", "message"],
      ["finance", "KimKim Finance", "save"],
    ]) {
      const nav = document.createElement("button");
      nav.type = "button";
      nav.className = "nav-item";
      nav.dataset.view = id;
      nav.innerHTML = `<span class="ic">${icon(glyph)}</span><span>${name}</span>`;
      nav.onclick = () => showView(id, nav);
      rail.insertBefore(nav, anchor);
    }
    const dialog = document.createElement("dialog");
    dialog.id = "personalDialog";
    dialog.className = "personal-dialog";
    document.body.append(dialog);
    document.addEventListener("click", (event) =>
      actions(event).catch((error) => notify(feedback(error))),
    );
    document.addEventListener("change", (e) => {
      if (e.target.id === "financeMonth") {
        state.month = e.target.value || localDate().slice(0, 7);
        renderFinance();
      }
      if (e.target.id === "financeWallet") {
        state.wallet = e.target.value;
        renderFinance();
      }
    });
    const labels = () => {
      heading.textContent = tr("CÁ NHÂN", "PERSONAL");
      renderFinance();
      renderCapsules();
    };
    document.addEventListener("akk:languagechange", () => {
      dialog.close();
      labels();
    });
    document.addEventListener("akk:viewchange", (e) => {
      if (e.detail.view === "capsules") refreshCapsules();
    });
    firebase.auth().onAuthStateChanged((user) => {
      state.stops.forEach((stop) => stop());
      state.stops = [];
      state.uid = user?.uid || null;
      state.ready = false;
      state.mailReady = false;
      for (const name of [
        "entries",
        "wallets",
        "goals",
        "budgets",
        "drafts",
        "sent",
      ])
        state[name] = [];
      state.wallet = "";
      dialog.close();
      labels();
      if (!user) return;
      const uid = user.uid;
      for (const [key, name] of [
        ["entries", "financeEntries"],
        ["wallets", "financeWallets"],
        ["goals", "financeGoals"],
        ["budgets", "financeBudgets"],
        ["drafts", "capsuleDrafts"],
      ]) {
        state.stops.push(
          col(name).onSnapshot(
            (snap) => {
              if (state.uid !== uid) return;
              state[key] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
              state.ready = true;
              renderFinance();
              renderCapsules();
            },
            (error) => {
              if (state.uid !== uid) return;
              document.getElementById("financeStatus").textContent =
                feedback(error);
              document.getElementById("capsuleStatus").textContent =
                feedback(error);
            },
          ),
        );
      }
      refreshCapsules();
    });
  }
  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
