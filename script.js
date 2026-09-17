// ==========================================
// 1. GLOBAALIT MUUTTUJAT & TILA (STATE)
// ==========================================
let supabaseClient = null;
let currentUser = null;
let isRegisterMode = false;

let categoryChartInstance = null;
let balanceChartInstance = null;

let state = {
  currentBalance: 0,
  paydayNumber: 15,
  categories: ["Ruoka & Arki", "Asuminen & Laskut", "Vapaa-aika", "Liikenne", "Muut"],
  transactions: [],
  showSettings: false,
};

// ==========================================
// 2. ASETUSTEN LATAUS JSONISTA & ALUSTUS
// ==========================================
async function initApp() {
  try {
    const response = await fetch("settings.json");
    if (!response.ok) {
      throw new Error("settings.json tiedostoa ei löytynyt!");
    }
    const config = await response.json();

    supabaseClient = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

    setupAuthListener();
    setupEventListeners();
  } catch (error) {
    console.error("Sovelluksen alustus epäonnistui:", error);
    alert(
      "Virhe ladattaessa asetuksia (settings.json). Varmista, että ajat sovellusta palvelimella.",
    );
  }
}

function showAlert(message, type = "info") {
  const alertEl = document.getElementById("auth-alert");
  if (!alertEl) return;

  alertEl.classList.remove(
    "hidden",
    "bg-emerald-50",
    "border-emerald-200",
    "text-emerald-800",
    "bg-amber-50",
    "border-amber-200",
    "text-amber-800",
    "bg-rose-50",
    "border-rose-200",
    "text-rose-800",
  );

  if (type === "success") {
    alertEl.classList.add("bg-emerald-50", "border-emerald-200", "text-emerald-800");
  } else if (type === "warning") {
    alertEl.classList.add("bg-amber-50", "border-amber-200", "text-amber-800");
  } else {
    alertEl.classList.add("bg-rose-50", "border-rose-200", "text-rose-800");
  }

  alertEl.innerHTML = message;
}

function hideAlert() {
  const alertEl = document.getElementById("auth-alert");
  if (alertEl) alertEl.classList.add("hidden");
}

// Apufunktio ISO-päivämäärämerkkijonon muotoiluun suomalaiseen muotoon (esim. 17.9.2026 klo 14.30)
function formatFinnishDateTime(isoString) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;

  const dateStr = d.toLocaleDateString("fi-FI", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
  const timeStr = d.toLocaleTimeString("fi-FI", { hour: "2-digit", minute: "2-digit" });

  return `${dateStr} klo ${timeStr}`;
}

// Apufunktio muuntamaan ISO-Aika (tai Date) ISO-stringiksi input[type="datetime-local"] varten (YYYY-MM-THH:mm)
function toDatetimeLocalValue(isoString) {
  const d = isoString ? new Date(isoString) : new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

// ==========================================
// 3. AUTHENTICATION & TILAN SEURANTA
// ==========================================
function setupAuthListener() {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (session && session.user && session.user.email_confirmed_at) {
      currentUser = session.user;

      document.getElementById("auth-section").classList.add("hidden");
      document.getElementById("app-section").classList.remove("hidden");
      document.getElementById("settings-toggle-btn")?.classList.remove("hidden");
      document.getElementById("logout-btn")?.classList.remove("hidden");

      await loadData();
    } else if (session && session.user && !session.user.email_confirmed_at) {
      await supabaseClient.auth.signOut();
      currentUser = null;

      showAlert(
        "<strong>Sähköpostia ei ole vielä vahvistettu!</strong><br>Tarkista sähköpostisi ja klikkaa vahvistuslinkkiä ennen kirjautumista.",
        "warning",
      );
    } else {
      currentUser = null;

      document.getElementById("auth-section").classList.remove("hidden");
      document.getElementById("app-section").classList.add("hidden");
      document.getElementById("settings-section").classList.add("hidden");
      document.getElementById("settings-toggle-btn")?.classList.add("hidden");
      document.getElementById("logout-btn")?.classList.add("hidden");
    }
  });
}

function setupEventListeners() {
  const authForm = document.getElementById("auth-form");
  if (authForm) {
    authForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      hideAlert();

      const email = document.getElementById("auth-email").value;
      const password = document.getElementById("auth-password").value;

      if (isRegisterMode) {
        const { data, error } = await supabaseClient.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.href,
          },
        });

        if (error) {
          showAlert(`Rekisteröityminen epäonnistui: ${error.message}`, "error");
        } else if (data.user && !data.user.email_confirmed_at) {
          isRegisterMode = false;
          updateAuthUI();
          showAlert(
            `<strong>Rekisteröinti onnistui!</strong><br>Lähetimme vahvistuslinkin osoitteeseen <b>${email}</b>. Vahvista sähköpostisi ennen kirjautumista.`,
            "success",
          );
        }
      } else {
        const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
          if (error.message.includes("Email not confirmed")) {
            showAlert(
              "<strong>Sähköpostia ei ole vahvistettu!</strong> Tarkista sähköpostilaatikkosi.",
              "warning",
            );
          } else {
            showAlert(`Kirjautuminen epäonnistui: ${error.message}`, "error");
          }
        } else if (data.user && !data.user.email_confirmed_at) {
          await supabaseClient.auth.signOut();
          showAlert(
            "<strong>Sähköpostia ei ole vielä vahvistettu!</strong> Vahvista osoitteesi sähköpostistasi löytyvästä linkistä.",
            "warning",
          );
        }
      }
    });
  }

  const toggleAuthBtn = document.getElementById("toggle-auth-mode-btn");
  if (toggleAuthBtn) {
    toggleAuthBtn.addEventListener("click", (e) => {
      e.preventDefault();
      hideAlert();
      isRegisterMode = !isRegisterMode;
      updateAuthUI();
    });
  }

  const logoutBtn = document.getElementById("logout-btn");
  if (logoutBtn) {
    logoutBtn.addEventListener("click", () => {
      supabaseClient.auth.signOut();
    });
  }

  const toggleTesterBtn = document.getElementById("toggle-tester-btn");
  const heroTesterBox = document.getElementById("hero-tester-box");

  if (toggleTesterBtn && heroTesterBox) {
    toggleTesterBtn.addEventListener("click", (e) => {
      e.preventDefault();
      heroTesterBox.classList.toggle("hidden");
    });
  }

  const heroTestAmount = document.getElementById("hero-test-amount");
  const heroTestType = document.getElementById("hero-test-type");

  if (heroTestAmount && heroTestType) {
    heroTestAmount.addEventListener("input", updateHeroTester);
    heroTestType.addEventListener("change", updateHeroTester);
  }

  // UUSI TAPAHTUMA - LOMAKE
  const txForm = document.getElementById("tx-form");
  if (txForm) {
    txForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const type = document.getElementById("tx-type").value;
      const amount = parseFloat(document.getElementById("tx-amount").value);
      const category = document.getElementById("tx-category").value;
      const description = document.getElementById("tx-description").value;
      const datetimeInput = document.getElementById("tx-datetime").value;

      if (isNaN(amount) || amount <= 0) return;

      if (type === "expense") {
        state.currentBalance -= amount;
      } else {
        state.currentBalance += amount;
      }

      const isoDate = datetimeInput
        ? new Date(datetimeInput).toISOString()
        : new Date().toISOString();

      state.transactions.push({
        id: Date.now(),
        type,
        amount,
        category,
        description,
        timestamp: isoDate,
      });

      // Järjestetään tapahtumat aikajärjestykseen (uusin ensin)
      sortTransactions();

      document.getElementById("tx-amount").value = "";
      document.getElementById("tx-description").value = "";
      document.getElementById("tx-datetime").value = "";

      render();
      await saveData();
    });
  }

  // MODALIN TAPAHTUMANKUUNTELIJAT
  const closeModalBtn = document.getElementById("close-modal-btn");
  const cancelEditBtn = document.getElementById("cancel-edit-btn");
  if (closeModalBtn) closeModalBtn.addEventListener("click", closeEditModal);
  if (cancelEditBtn) cancelEditBtn.addEventListener("click", closeEditModal);

  const editTxForm = document.getElementById("edit-tx-form");
  if (editTxForm) {
    editTxForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      const id = parseInt(document.getElementById("edit-tx-id").value);
      const newAmount = parseFloat(document.getElementById("edit-tx-amount").value);
      const newCategory = document.getElementById("edit-tx-category").value;
      const newType = document.getElementById("edit-tx-type").value;
      const newDescription = document.getElementById("edit-tx-description").value;
      const newDatetime = document.getElementById("edit-tx-datetime").value;

      if (isNaN(newAmount) || newAmount <= 0) return;

      const index = state.transactions.findIndex((t) => t.id === id);
      if (index !== -1) {
        const oldTx = state.transactions[index];

        // 1. Perutaan vanhan tapahtuman vaikutus saldoon
        if (oldTx.type === "expense") {
          state.currentBalance += oldTx.amount;
        } else {
          state.currentBalance -= oldTx.amount;
        }

        // 2. Lisätään uusi vaikutus saldoon
        if (newType === "expense") {
          state.currentBalance -= newAmount;
        } else {
          state.currentBalance += newAmount;
        }

        // 3. Päivitetään tapahtuma
        state.transactions[index] = {
          ...oldTx,
          amount: newAmount,
          category: newCategory,
          type: newType,
          description: newDescription,
          timestamp: new Date(newDatetime).toISOString(),
        };

        sortTransactions();
        closeEditModal();
        render();
        await saveData();
      }
    });
  }

  const addCategoryBtn = document.getElementById("add-category-btn");
  if (addCategoryBtn) {
    addCategoryBtn.addEventListener("click", (e) => {
      e.preventDefault();
      const input = document.getElementById("new-category-input");
      const val = input.value.trim();
      if (val && !state.categories.includes(val)) {
        state.categories.push(val);
        input.value = "";
        renderCategoryTags();
      }
    });
  }

  const saveSettingsBtn = document.getElementById("save-settings-btn");
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      const bal = parseFloat(document.getElementById("setting-balance").value);
      const pay = parseInt(document.getElementById("setting-payday").value);

      if (!isNaN(bal)) state.currentBalance = bal;
      if (!isNaN(pay) && pay >= 1 && pay <= 31) state.paydayNumber = pay;

      state.showSettings = false;
      render();
      await saveData();
    });
  }

  const settingsToggleBtn = document.getElementById("settings-toggle-btn");
  if (settingsToggleBtn) {
    settingsToggleBtn.addEventListener("click", (e) => {
      e.preventDefault();
      state.showSettings = !state.showSettings;
      render();
    });
  }
}

function sortTransactions() {
  state.transactions.sort((a, b) => new Date(b.timestamp || a.id) - new Date(a.timestamp || b.id));
}

function updateAuthUI() {
  const titleEl = document.getElementById("auth-title");
  const submitBtn = document.getElementById("auth-submit-btn");
  const toggleAuthBtn = document.getElementById("toggle-auth-mode-btn");

  if (titleEl) titleEl.textContent = isRegisterMode ? "Luo uusi tili" : "Kirjaudu sisään";
  if (submitBtn) submitBtn.textContent = isRegisterMode ? "Rekisteröidy" : "Kirjaudu";
  if (toggleAuthBtn) {
    toggleAuthBtn.textContent = isRegisterMode
      ? "Onko sinulla jo tili? Kirjaudu sisään"
      : "Eikö sinulla ole tiliä? Rekisteröidy tästä";
  }
}

// ==========================================
// 4. TESTERILOGIIKKA & KATEGORIATAGIT
// ==========================================

function updateHeroTester() {
  const amountVal = parseFloat(document.getElementById("hero-test-amount")?.value);
  const typeVal = document.getElementById("hero-test-type")?.value;
  const resultsBox = document.getElementById("hero-test-results");
  const heroTestDaily = document.getElementById("hero-test-daily");
  const heroTestBalance = document.getElementById("hero-test-balance");

  if (!resultsBox || !heroTestDaily || !heroTestBalance) return;

  if (isNaN(amountVal) || amountVal <= 0) {
    resultsBox.classList.add("hidden");
    return;
  }

  resultsBox.classList.remove("hidden");

  const simulatedBalance =
    typeVal === "expense" ? state.currentBalance - amountVal : state.currentBalance + amountVal;

  const daysLeft = getDaysUntilPayday();
  const simulatedDaily = daysLeft > 0 ? simulatedBalance / daysLeft : simulatedBalance;

  heroTestDaily.textContent = `${simulatedDaily.toFixed(2)} € / pv`;
  heroTestBalance.textContent = `${simulatedBalance.toFixed(2)} €`;
}

function removeCategory(catName) {
  state.categories = state.categories.filter((c) => c !== catName);
  renderCategoryTags();
}

function renderCategoryTags() {
  const container = document.getElementById("category-tags-container");
  if (!container) return;

  container.innerHTML = state.categories
    .map(
      (c) => `
      <span class="inline-flex items-center space-x-1 px-2.5 py-1 bg-emerald-100/70 text-emerald-800 rounded-lg text-xs font-medium">
        <span>${c}</span>
        <button type="button" onclick="removeCategory('${c}')" class="hover:text-rose-600 font-bold ml-1">✕</button>
      </span>
    `,
    )
    .join("");
}

// ==========================================
// 5. PILVITALLENNUS & LATAUS (SUPABASE)
// ==========================================

async function loadData() {
  if (!currentUser) return;

  try {
    const { data, error } = await supabaseClient
      .from("user_budgets")
      .select("data")
      .eq("id", currentUser.id)
      .maybeSingle();

    if (error) {
      console.error("Virhe ladattaessa tietokannasta:", error);
      return;
    }

    if (data && data.data) {
      state = { ...state, ...data.data };

      // Varmistetaan vanhojen tapahtumien yhteensopivuus aikaleimoissa
      state.transactions = state.transactions.map((t) => ({
        ...t,
        timestamp:
          t.timestamp || (t.date ? new Date(t.date).toISOString() : new Date(t.id).toISOString()),
      }));

      sortTransactions();
    } else {
      await saveData();
    }
  } catch (err) {
    console.error("Latausvirhe:", err);
  } finally {
    render();
  }
}

async function saveData() {
  if (!currentUser) return;

  const payload = {
    currentBalance: state.currentBalance,
    paydayNumber: state.paydayNumber,
    categories: state.categories,
    transactions: state.transactions,
  };

  const { error } = await supabaseClient.from("user_budgets").upsert({
    id: currentUser.id,
    data: payload,
  });

  if (error) {
    console.error("Tallennusvirhe Supabaseen:", error);
  }
}

// ==========================================
// 6. SOVELLUSLOGIIKKA, MUOKKAUS & POISTO
// ==========================================

function getDaysUntilPayday() {
  const today = new Date();
  let target = new Date(today.getFullYear(), today.getMonth(), state.paydayNumber);

  if (today.getDate() >= state.paydayNumber) {
    target.setMonth(target.getMonth() + 1);
  }

  const diffTime = target - today;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

async function removeTransaction(id) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;

  if (tx.type === "expense") {
    state.currentBalance += tx.amount;
  } else {
    state.currentBalance -= tx.amount;
  }

  state.transactions = state.transactions.filter((t) => t.id !== id);

  render();
  await saveData();
}

// TAPAHTUMAN MUOKKAUSMODALIN AVAUS & SULKU
function openEditModal(id) {
  const tx = state.transactions.find((t) => t.id === id);
  if (!tx) return;

  document.getElementById("edit-tx-id").value = tx.id;
  document.getElementById("edit-tx-amount").value = tx.amount;
  document.getElementById("edit-tx-type").value = tx.type;
  document.getElementById("edit-tx-description").value = tx.description || "";
  document.getElementById("edit-tx-datetime").value = toDatetimeLocalValue(tx.timestamp);

  const editCatSelect = document.getElementById("edit-tx-category");
  if (editCatSelect) {
    editCatSelect.innerHTML = state.categories
      .map((c) => `<option value="${c}" ${c === tx.category ? "selected" : ""}>${c}</option>`)
      .join("");
  }

  document.getElementById("edit-modal").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("edit-modal").classList.add("hidden");
}

// ==========================================
// 7. CHART.JS VISUALISOINTILOGIIKKA
// ==========================================
function renderCharts() {
  if (typeof Chart === "undefined") return;

  const expensesByCategory = {};
  state.transactions.forEach((tx) => {
    if (tx.type === "expense") {
      expensesByCategory[tx.category] = (expensesByCategory[tx.category] || 0) + tx.amount;
    }
  });

  const catLabels = Object.keys(expensesByCategory);
  const catData = Object.values(expensesByCategory);

  const ctxCategory = document.getElementById("category-chart")?.getContext("2d");
  if (ctxCategory) {
    if (categoryChartInstance) categoryChartInstance.destroy();

    categoryChartInstance = new Chart(ctxCategory, {
      type: "doughnut",
      data: {
        labels: catLabels.length > 0 ? catLabels : ["Ei menoja"],
        datasets: [
          {
            data: catData.length > 0 ? catData : [1],
            backgroundColor: [
              "#10b981",
              "#3b82f6",
              "#f59e0b",
              "#ef4444",
              "#8b5cf6",
              "#ec4899",
              "#14b8a6",
              "#64748b",
            ],
            borderWidth: 2,
            borderColor: "#ffffff",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: { boxWidth: 12, font: { size: 10 } },
          },
        },
      },
    });
  }

  const ctxBalance = document.getElementById("balance-chart")?.getContext("2d");
  if (ctxBalance) {
    let runningBalance = state.currentBalance;
    const balanceHistory = [runningBalance];
    const labels = ["Nyt"];

    const sortedTxs = [...state.transactions].reverse();

    sortedTxs.forEach((tx) => {
      if (tx.type === "expense") {
        runningBalance += tx.amount;
      } else {
        runningBalance -= tx.amount;
      }
      balanceHistory.unshift(runningBalance);
      labels.unshift(formatFinnishDateTime(tx.timestamp).split(" klo")[0]);
    });

    if (balanceChartInstance) balanceChartInstance.destroy();

    balanceChartInstance = new Chart(ctxBalance, {
      type: "line",
      data: {
        labels: labels.slice(-7),
        datasets: [
          {
            label: "Saldo (€)",
            data: balanceHistory.slice(-7),
            borderColor: "#059669",
            backgroundColor: "rgba(5, 150, 105, 0.1)",
            fill: true,
            tension: 0.3,
            pointRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
        scales: {
          x: { ticks: { font: { size: 9 } } },
          y: { ticks: { font: { size: 9 } } },
        },
      },
    });
  }
}

// ==========================================
// 8. RENDERÖINTI (KÄYTTÖLIITTYMÄN PÄIVITYS)
// ==========================================
function render() {
  const settingsSec = document.getElementById("settings-section");
  if (settingsSec) {
    if (state.showSettings) {
      settingsSec.classList.remove("hidden");
      document.getElementById("setting-balance").value = state.currentBalance;
      document.getElementById("setting-payday").value = state.paydayNumber;
      renderCategoryTags();
    } else {
      settingsSec.classList.add("hidden");
    }
  }

  const daysLeft = getDaysUntilPayday();
  const dailyBudget = daysLeft > 0 ? state.currentBalance / daysLeft : state.currentBalance;

  const dailyDisplay = document.getElementById("daily-budget-display");
  const daysLeftDisplay = document.getElementById("days-left-display");

  if (dailyDisplay) dailyDisplay.textContent = `${dailyBudget.toFixed(2)} €`;
  if (daysLeftDisplay) {
    daysLeftDisplay.textContent = `Seuraavaan palkkapäivään (${state.paydayNumber}. pvm) on ${daysLeft} päivää. Kokonaissaldo: ${state.currentBalance.toFixed(2)} €`;
  }

  const categorySelect = document.getElementById("tx-category");
  if (categorySelect) {
    categorySelect.innerHTML = state.categories
      .map((c) => `<option value="${c}">${c}</option>`)
      .join("");
  }

  const listEl = document.getElementById("tx-list");
  if (listEl) {
    if (state.transactions.length === 0) {
      listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Ei tapahtumia.</p>`;
    } else {
      listEl.innerHTML = state.transactions
        .map((tx) => {
          const isExpense = tx.type === "expense";
          const colorClass = isExpense ? "text-slate-900 font-bold" : "text-emerald-600 font-bold";
          const formattedDate = formatFinnishDateTime(tx.timestamp);

          return `
            <div class="flex justify-between items-center py-3 first:pt-0">
              <div class="space-y-1">
                <div class="text-sm font-medium text-slate-800">${tx.description || tx.category}</div>
                <div class="flex items-center space-x-2">
                  <span class="inline-block px-2 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-semibold rounded-md border border-emerald-100">
                    ${tx.category}
                  </span>
                  <span class="text-xs text-slate-400">${formattedDate}</span>
                </div>
              </div>
              <div class="flex items-center space-x-2">
                <span class="text-sm ${colorClass}">${isExpense ? "-" : "+"}${tx.amount.toFixed(2)} €</span>
                <button onclick="openEditModal(${tx.id})" title="Muokkaa" class="text-xs text-slate-400 hover:text-emerald-600 p-1 transition">
                  ✏️
                </button>
                <button onclick="removeTransaction(${tx.id})" title="Poista" class="text-xs text-slate-400 hover:text-rose-500 p-1 transition">
                  ✕
                </button>
              </div>
            </div>
          `;
        })
        .join("");
    }
  }

  updateHeroTester();
  renderCharts();
}

// Käynnistetään sovellus
initApp();
