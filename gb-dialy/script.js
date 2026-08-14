/* =========================================================
   G & B Diary - script.js
   データ保存(localStorage) / タブ切り替え / 書く・読む・見る の処理
   ========================================================= */

(function () {
  "use strict";

  var STORAGE_KEY = "gbDiaryEntries";

  var MOOD_LABEL = { good: "GOOD", bad: "BAD", flat: "FLAT" };

  /* ---------------------------------------------------------
     データ操作まわり
  --------------------------------------------------------- */

  function loadEntries() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (e) {
      console.error("読み込みエラー:", e);
      return [];
    }
  }

  function saveEntries(entries) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      return true;
    } catch (e) {
      console.error("保存エラー:", e);
      return false;
    }
  }

  var entries = loadEntries();

  function toDateKey(d) {
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function toTimeLabel(iso) {
    var d = new Date(iso);
    var h = String(d.getHours()).padStart(2, "0");
    var m = String(d.getMinutes()).padStart(2, "0");
    return h + ":" + m;
  }

  function toDateHeading(dateKey) {
    var parts = dateKey.split("-").map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    var weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return (parts[1]) + "月" + parts[2] + "日（" + weekdays[d.getDay()] + "）";
  }

  function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /* ---------------------------------------------------------
     トースト通知
  --------------------------------------------------------- */

  var toastEl = document.getElementById("toast");
  var toastTimer = null;

  function showToast(message) {
    toastEl.textContent = message;
    toastEl.hidden = false;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.hidden = true;
    }, 1800);
  }

  /* ---------------------------------------------------------
     タブ切り替え
  --------------------------------------------------------- */

  var tabButtons = document.querySelectorAll(".tab-btn");
  var tabPanels = document.querySelectorAll(".tab-panel");

  tabButtons.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var target = btn.getAttribute("data-tab");
      tabButtons.forEach(function (b) { b.classList.toggle("is-active", b === btn); });
      tabPanels.forEach(function (p) {
        p.classList.toggle("is-active", p.id === "tab-" + target);
      });
      if (target === "read") renderEntryList();
      if (target === "view") {
        renderCalendar();
        renderBarGraph();
      }
    });
  });

  /* ---------------------------------------------------------
     書くタブ
  --------------------------------------------------------- */

  var writeMoodSelect = document.getElementById("writeMoodSelect");
  var writeForm = document.getElementById("writeForm");
  var selectedMoodChip = document.getElementById("selectedMoodChip");
  var diaryText = document.getElementById("diaryText");
  var charCount = document.getElementById("charCount");
  var saveBtn = document.getElementById("saveBtn");
  var writeCancelBtn = document.getElementById("writeCancelBtn");

  var currentWriteMood = null;

  writeMoodSelect.addEventListener("click", function (e) {
    var btn = e.target.closest(".mood-btn");
    if (!btn) return;
    currentWriteMood = btn.getAttribute("data-mood");

    writeMoodSelect.querySelectorAll(".mood-btn").forEach(function (b) {
      b.classList.toggle("is-selected", b === btn);
    });

    selectedMoodChip.textContent = MOOD_LABEL[currentWriteMood];
    selectedMoodChip.className = "selected-mood-chip mood-" + currentWriteMood;

    writeForm.hidden = false;
    diaryText.focus();
  });

  writeCancelBtn.addEventListener("click", function () {
    resetWriteForm();
  });

  diaryText.addEventListener("input", function () {
    charCount.textContent = diaryText.value.length;
    saveBtn.disabled = diaryText.value.trim().length === 0;
  });

  saveBtn.addEventListener("click", function () {
    var text = diaryText.value.trim();
    if (!text || !currentWriteMood) return;

    var now = new Date();
    var entry = {
      id: genId(),
      mood: currentWriteMood,
      text: text,
      date: toDateKey(now),
      timestamp: now.toISOString()
    };

    entries.unshift(entry);
    saveEntries(entries);

    showToast(MOOD_LABEL[currentWriteMood] + "を記録しました");
    resetWriteForm();
  });

  function resetWriteForm() {
    currentWriteMood = null;
    diaryText.value = "";
    charCount.textContent = "0";
    saveBtn.disabled = true;
    writeForm.hidden = true;
    writeMoodSelect.querySelectorAll(".mood-btn").forEach(function (b) {
      b.classList.remove("is-selected");
    });
  }

  /* ---------------------------------------------------------
     読むタブ
  --------------------------------------------------------- */

  var filterBar = document.getElementById("filterBar");
  var entryList = document.getElementById("entryList");
  var emptyState = document.getElementById("emptyState");
  var currentFilter = "good";

  filterBar.addEventListener("click", function (e) {
    var btn = e.target.closest(".filter-btn");
    if (!btn) return;
    currentFilter = btn.getAttribute("data-filter");
    filterBar.querySelectorAll(".filter-btn").forEach(function (b) {
      b.classList.toggle("is-active", b === btn);
    });
    renderEntryList();
  });

  function renderEntryList() {
    var filtered = entries.filter(function (en) {
      return currentFilter === "all" ? true : en.mood === currentFilter;
    });

    entryList.innerHTML = "";

    if (filtered.length === 0) {
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    // 日付ごとにグループ化（新しい日付が上）
    var groups = {};
    var order = [];
    filtered.forEach(function (en) {
      if (!groups[en.date]) {
        groups[en.date] = [];
        order.push(en.date);
      }
      groups[en.date].push(en);
    });
    order.sort(function (a, b) { return a < b ? 1 : -1; });

    order.forEach(function (dateKey) {
      var groupEl = document.createElement("div");
      groupEl.className = "entry-date-group";

      var heading = document.createElement("div");
      heading.className = "entry-date-heading";
      heading.textContent = toDateHeading(dateKey);
      groupEl.appendChild(heading);

      groups[dateKey].forEach(function (en) {
        groupEl.appendChild(buildEntryCard(en));
      });

      entryList.appendChild(groupEl);
    });
  }

  function buildEntryCard(en) {
    var card = document.createElement("div");
    card.className = "entry-card";

    var top = document.createElement("div");
    top.className = "entry-card-top";

    var tag = document.createElement("span");
    tag.className = "entry-tag mood-" + en.mood;
    tag.textContent = MOOD_LABEL[en.mood];

    var time = document.createElement("span");
    time.className = "entry-time";
    time.textContent = toTimeLabel(en.timestamp);

    top.appendChild(tag);
    top.appendChild(time);

    var text = document.createElement("div");
    text.className = "entry-text";
    text.textContent = en.text;

    var actions = document.createElement("div");
    actions.className = "entry-card-actions";

    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "icon-btn";
    editBtn.textContent = "編集";
    editBtn.addEventListener("click", function () { openEditModal(en.id); });

    var delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.className = "icon-btn danger";
    delBtn.textContent = "削除";
    delBtn.addEventListener("click", function () { deleteEntry(en.id); });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    card.appendChild(top);
    card.appendChild(text);
    card.appendChild(actions);

    return card;
  }

  function deleteEntry(id) {
    if (!confirm("この日記を削除しますか？")) return;
    entries = entries.filter(function (en) { return en.id !== id; });
    saveEntries(entries);
    renderEntryList();
    showToast("削除しました");
  }

  /* ---------------------------------------------------------
     編集モーダル
  --------------------------------------------------------- */

  var editModal = document.getElementById("editModal");
  var editMoodSelect = document.getElementById("editMoodSelect");
  var editText = document.getElementById("editText");
  var editCharCount = document.getElementById("editCharCount");
  var editCancelBtn = document.getElementById("editCancelBtn");
  var editSaveBtn = document.getElementById("editSaveBtn");

  var editingId = null;
  var editingMood = null;

  function openEditModal(id) {
    var en = entries.find(function (e) { return e.id === id; });
    if (!en) return;

    editingId = id;
    editingMood = en.mood;
    editText.value = en.text;
    editCharCount.textContent = en.text.length;

    editMoodSelect.querySelectorAll(".mood-btn").forEach(function (b) {
      b.classList.toggle("is-selected", b.getAttribute("data-mood") === editingMood);
    });

    editModal.hidden = false;
  }

  editMoodSelect.addEventListener("click", function (e) {
    var btn = e.target.closest(".mood-btn");
    if (!btn) return;
    editingMood = btn.getAttribute("data-mood");
    editMoodSelect.querySelectorAll(".mood-btn").forEach(function (b) {
      b.classList.toggle("is-selected", b === btn);
    });
  });

  editText.addEventListener("input", function () {
    editCharCount.textContent = editText.value.length;
  });

  editCancelBtn.addEventListener("click", closeEditModal);

  editModal.addEventListener("click", function (e) {
    if (e.target === editModal) closeEditModal();
  });

  function closeEditModal() {
    editModal.hidden = true;
    editingId = null;
    editingMood = null;
  }

  editSaveBtn.addEventListener("click", function () {
    var text = editText.value.trim();
    if (!text || !editingId) return;

    var en = entries.find(function (e) { return e.id === editingId; });
    if (!en) return;

    en.text = text;
    en.mood = editingMood;

    saveEntries(entries);
    closeEditModal();
    renderEntryList();
    showToast("更新しました");
  });

  /* ---------------------------------------------------------
     見るタブ：カレンダー
  --------------------------------------------------------- */

  var calendarMonthLabel = document.getElementById("calendarMonthLabel");
  var calendarGrid = document.getElementById("calendarGrid");
  var prevMonthBtn = document.getElementById("prevMonth");
  var nextMonthBtn = document.getElementById("nextMonth");
  var calendarDayEntries = document.getElementById("calendarDayEntries");
  var calendarDaySelectedLabel = document.getElementById("calendarDaySelectedLabel");
  var calendarDayList = document.getElementById("calendarDayList");
  var calendarDayClose = document.getElementById("calendarDayClose");

  var today = new Date();
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth(); // 0-11
  var selectedDateKey = null;

  prevMonthBtn.addEventListener("click", function () {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    selectedDateKey = null;
    calendarDayEntries.hidden = true;
    renderCalendar();
  });

  nextMonthBtn.addEventListener("click", function () {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    selectedDateKey = null;
    calendarDayEntries.hidden = true;
    renderCalendar();
  });

  calendarDayClose.addEventListener("click", function () {
    calendarDayEntries.hidden = true;
    selectedDateKey = null;
    renderCalendar();
  });

  function goodDateKeySet() {
    var set = {};
    entries.forEach(function (en) {
      if (en.mood === "good") set[en.date] = true;
    });
    return set;
  }

  function renderCalendar() {
    calendarMonthLabel.textContent = viewYear + "年" + (viewMonth + 1) + "月";
    calendarGrid.innerHTML = "";

    var firstDay = new Date(viewYear, viewMonth, 1);
    var startWeekday = firstDay.getDay(); // 0=日
    var daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    var goodSet = goodDateKeySet();
    var todayKey = toDateKey(today);

    for (var i = 0; i < startWeekday; i++) {
      var empty = document.createElement("div");
      empty.className = "calendar-day is-empty";
      calendarGrid.appendChild(empty);
    }

    for (var day = 1; day <= daysInMonth; day++) {
      var dateKey = viewYear + "-" + String(viewMonth + 1).padStart(2, "0") + "-" + String(day).padStart(2, "0");

      var cell = document.createElement("button");
      cell.type = "button";
      cell.className = "calendar-day";
      if (dateKey === todayKey) cell.classList.add("is-today");
      if (dateKey === selectedDateKey) cell.classList.add("is-selected");

      var num = document.createElement("span");
      num.textContent = day;
      cell.appendChild(num);

      if (goodSet[dateKey]) {
        var dot = document.createElement("span");
        dot.className = "calendar-day-dot";
        cell.appendChild(dot);
      }

      cell.addEventListener("click", function () {
        var key = this.getAttribute("data-key");
        selectedDateKey = key;
        renderCalendar();
        showDayEntries(key);
      });
      cell.setAttribute("data-key", dateKey);

      calendarGrid.appendChild(cell);
    }
  }

  function showDayEntries(dateKey) {
    var parts = dateKey.split("-").map(Number);
    calendarDaySelectedLabel.textContent = parts[1] + "月" + parts[2] + "日のGOOD";

    var dayGoodEntries = entries.filter(function (en) {
      return en.date === dateKey && en.mood === "good";
    });

    calendarDayList.innerHTML = "";

    if (dayGoodEntries.length === 0) {
      var empty = document.createElement("p");
      empty.className = "calendar-day-empty";
      empty.textContent = "この日はGOODな日記がありません";
      calendarDayList.appendChild(empty);
    } else {
      dayGoodEntries.forEach(function (en) {
        var item = document.createElement("div");
        item.className = "entry-text-only";
        item.textContent = en.text;
        calendarDayList.appendChild(item);
      });
    }

    calendarDayEntries.hidden = false;
  }

  /* ---------------------------------------------------------
     見るタブ：月別棒グラフ（今年 1〜12月のGOOD件数）
  --------------------------------------------------------- */

  var barGraph = document.getElementById("barGraph");
  var graphYearLabel = document.getElementById("graphYearLabel");

  function renderBarGraph() {
    var year = today.getFullYear();
    graphYearLabel.textContent = year + "年";

    var counts = new Array(12).fill(0);
    entries.forEach(function (en) {
      if (en.mood !== "good") return;
      var parts = en.date.split("-").map(Number);
      if (parts[0] === year) counts[parts[1] - 1] += 1;
    });

    var max = Math.max.apply(null, counts.concat([1]));

    barGraph.innerHTML = "";

    counts.forEach(function (count, idx) {
      var col = document.createElement("div");
      col.className = "bar-col";
      if (idx === today.getMonth()) col.classList.add("is-current-month");

      var value = document.createElement("span");
      value.className = "bar-value";
      value.textContent = count > 0 ? count : "";

      var fill = document.createElement("div");
      fill.className = "bar-fill";
      var heightPct = count === 0 ? 0 : Math.max((count / max) * 100, 6);
      fill.style.height = heightPct + "%";

      var label = document.createElement("span");
      label.className = "bar-label";
      label.textContent = (idx + 1) + "月";

      col.appendChild(value);
      col.appendChild(fill);
      col.appendChild(label);
      barGraph.appendChild(col);
    });
  }

  /* ---------------------------------------------------------
     初期表示
  --------------------------------------------------------- */

  renderEntryList();
  renderCalendar();
  renderBarGraph();

})();
