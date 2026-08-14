/* --- アプリの状態データ（LocalStorageと連動） --- */
let state = {
    singleCount: 0,
    singleHistory: [], // { id, no, timestamp, label, value }
    multiCounters: [
        { id: 1, label: '項目 1', count: 0 },
        { id: 2, label: '項目 2', count: 0 }
    ],
    multiHistory: [] // [ { id, no, timestamp, scores: { [id]: count } } ]
};

// 初期化処理（ページ読み込み時）
window.onload = function() {
    loadFromLocalStorage();
    renderSingle();
    renderMulti();
    renderMultiHistory();
};

/* --- ローカルストレージ処理 --- */
function saveToLocalStorage() {
    localStorage.setItem('mobile_counter_v6_data', JSON.stringify(state));
}

function loadFromLocalStorage() {
    const data = localStorage.getItem('mobile_counter_v6_data');
    if (data) {
        try {
            state = JSON.parse(data);
        } catch(e) {
            console.error('データの読み込みに失敗しました', e);
        }
    }
}

/* --- タブ切替処理 --- */
function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    if (tabName === 'single') {
        document.querySelectorAll('.tab-btn')[0].classList.add('active');
        document.getElementById('single-tab').classList.add('active');
    } else {
        document.querySelectorAll('.tab-btn')[1].classList.add('active');
        document.getElementById('multi-tab').classList.add('active');
    }
}

/* --- シングルカウンター処理 --- */
function renderSingle() {
    document.getElementById('single-count').textContent = state.singleCount;
    
    const tbody = document.getElementById('single-history-body');
    tbody.innerHTML = '';

    if (state.singleHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty-msg">履歴はありません</td></tr>';
        return;
    }

    // 昇順（古い順：#1が一番上で下に向かって追加）で表示
    state.singleHistory.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="no-cell">#${item.no}</td>
            <td style="color:#AAA;">${item.timestamp}</td>
            <td>
                <input type="text" class="table-label-input" value="${escapeHtml(item.label || '')}" 
                    placeholder="メモ入力" onchange="updateSingleHistoryLabel(${item.id}, this.value)">
            </td>
            <td class="val-cell">${item.value}</td>
        `;
        tbody.appendChild(tr);
    });
}

function changeSingleCount(delta) {
    state.singleCount += delta;
    renderSingle();
    saveToLocalStorage();
}

function resetSingleCount() {
    state.singleCount = 0;
    renderSingle();
    saveToLocalStorage();
}

function saveSingleHistory() {
    const now = new Date();
    const timeStr = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;
    
    const nextNo = state.singleHistory.length + 1;

    state.singleHistory.push({
        id: Date.now(),
        no: nextNo,
        timestamp: timeStr,
        label: '',
        value: state.singleCount
    });

    renderSingle();
    saveToLocalStorage();
}

function updateSingleHistoryLabel(id, newLabel) {
    const target = state.singleHistory.find(item => item.id === id);
    if (target) {
        target.label = newLabel;
        saveToLocalStorage();
    }
}

function clearSingleHistory() {
    if (state.singleHistory.length === 0) return;
    state.singleHistory = [];
    renderSingle();
    saveToLocalStorage();
}

/* --- マルチカウンター処理 --- */
function renderMulti() {
    const container = document.getElementById('multi-list');
    container.innerHTML = '';

    if (state.multiCounters.length === 0) {
        container.innerHTML = '<div class="empty-msg">カウンターを追加してください</div>';
        return;
    }

    state.multiCounters.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'multi-card';
        card.innerHTML = `
            <div class="multi-card-header">
                <input type="text" class="multi-label-input" value="${escapeHtml(item.label)}" 
                    onchange="updateMultiLabel(${item.id}, this.value)" placeholder="項目名">
                <button class="btn-delete" onclick="removeMultiCounter(${item.id})">削除</button>
            </div>
            <div class="multi-card-body">
                <div class="multi-val">${item.count}</div>
                <div class="multi-btn-group">
                    <button class="sm-btn sm-btn-minus" onclick="changeMultiCount(${item.id}, -1)">ー</button>
                    <button class="sm-btn sm-btn-plus" onclick="changeMultiCount(${item.id}, 1)">＋</button>
                    <button class="sm-btn sm-btn-reset" onclick="resetMultiCount(${item.id})">リセット</button>
                </div>
            </div>
        `;
        container.appendChild(card);
    });
}

function addMultiCounter() {
    const newId = Date.now();
    state.multiCounters.push({
        id: newId,
        label: `項目 ${state.multiCounters.length + 1}`,
        count: 0
    });
    renderMulti();
    renderMultiHistory();
    saveToLocalStorage();
}

function removeMultiCounter(id) {
    state.multiCounters = state.multiCounters.filter(item => item.id !== id);
    renderMulti();
    renderMultiHistory();
    saveToLocalStorage();
}

function changeMultiCount(id, delta) {
    const target = state.multiCounters.find(item => item.id === id);
    if (target) {
        target.count += delta;
        renderMulti();
        saveToLocalStorage();
    }
}

function resetMultiCount(id) {
    const target = state.multiCounters.find(item => item.id === id);
    if (target) {
        target.count = 0;
        renderMulti();
        saveToLocalStorage();
    }
}

function updateMultiLabel(id, newLabel) {
    const target = state.multiCounters.find(item => item.id === id);
    if (target) {
        target.label = newLabel;
        renderMultiHistory();
        saveToLocalStorage();
    }
}

/* --- マルチ保存履歴テーブル（縦型構造） --- */
function saveMultiHistory() {
    if (state.multiCounters.length === 0) return;

    const now = new Date();
    const timeStr = `${now.getMonth()+1}/${now.getDate()} ${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}`;

    const scoresObj = {};

    // 現在のカウンター値を各IDごとにスナップショット保存
    state.multiCounters.forEach(c => {
        scoresObj[c.id] = c.count;
    });

    const nextNo = state.multiHistory.length + 1;

    state.multiHistory.push({
        id: Date.now(),
        no: nextNo,
        timestamp: timeStr,
        scores: scoresObj
    });

    renderMultiHistory();
    saveToLocalStorage();
}

function renderMultiHistory() {
    const thead = document.getElementById('history-table-head');
    const tbody = document.getElementById('history-table-body');
    const tfoot = document.getElementById('history-table-foot');
    
    thead.innerHTML = '';
    tbody.innerHTML = '';
    tfoot.innerHTML = '';

    if (state.multiCounters.length === 0) {
        tbody.innerHTML = '<tr><td class="empty-msg">カウンター項目がありません</td></tr>';
        return;
    }

    if (state.multiHistory.length === 0) {
        tbody.innerHTML = '<tr><td colspan="' + (state.multiCounters.length + 2) + '" class="empty-msg">保存された履歴はありません</td></tr>';
        return;
    }

    // 1. ヘッダーの生成 (No. / 日時 / [各項目名...])
    let trHead = document.createElement('tr');
    let headHTML = `
        <th style="width:45px;">No.</th>
        <th class="time-col">日時</th>
    `;
    state.multiCounters.forEach(c => {
        headHTML += `<th>${escapeHtml(c.label)}</th>`;
    });
    trHead.innerHTML = headHTML;
    thead.appendChild(trHead);

    // 各項目ごとの合計計算用のオブジェクト
    const columnTotals = {};
    state.multiCounters.forEach(c => {
        columnTotals[c.id] = 0;
    });

    // 2. 履歴データ行の生成（昇順：古い順に上から表示）
    state.multiHistory.forEach(h => {
        let tr = document.createElement('tr');
        let rowHTML = `
            <td class="no-cell">#${h.no}</td>
            <td class="time-col" style="color:#AAA;">${h.timestamp}</td>
        `;

        state.multiCounters.forEach(c => {
            const val = (h.scores[c.id] !== undefined) ? h.scores[c.id] : '-';
            if (typeof val === 'number') {
                columnTotals[c.id] += val;
            }
            rowHTML += `<td>${val}</td>`;
        });

        tr.innerHTML = rowHTML;
        tbody.appendChild(tr);
    });

    // 3. フッター（一番下の各項目ごとの合計行）の生成
    let trFoot = document.createElement('tr');
    let footHTML = `
        <td colspan="2" style="text-align:right;">合計</td>
    `;
    state.multiCounters.forEach(c => {
        footHTML += `<td>${columnTotals[c.id]}</td>`;
    });
    trFoot.innerHTML = footHTML;
    tfoot.appendChild(trFoot);
}

function clearMultiHistory() {
    if (state.multiHistory.length === 0) return;
    state.multiHistory = [];
    renderMultiHistory();
    saveToLocalStorage();
}

// 入力時のHTML文字エスケープ用
function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
