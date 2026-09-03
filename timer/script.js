let audioCtx = null;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

function playRingBell(count = 1) {
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    for (let i = 0; i < count; i++) {
        setTimeout(() => {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'sine';
            osc.frequency.setValueAtTime(2400, now);

            gain.gain.setValueAtTime(0.8, now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(now);
            osc.stop(now + 1.8);
        }, i * 500);
    }
}

function playAlarmSound() {
    initAudio();
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    for (let i = 0; i < 3; i++) {
        setTimeout(() => {
            const now = audioCtx.currentTime;
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();

            osc.type = 'square';
            osc.frequency.setValueAtTime(880, now);

            gain.gain.setValueAtTime(0.3, now);
            gain.gain.setValueAtTime(0, now + 0.1);

            osc.connect(gain);
            gain.connect(audioCtx.destination);

            osc.start(now);
            osc.stop(now + 0.1);
        }, i * 150);
    }
}

function switchTab(tabName) {
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('is-active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('is-active'));

    const tabs = document.querySelectorAll('.tab-btn');
    if (tabName === 'timer-tab') {
        tabs[0].classList.add('is-active');
    } else {
        tabs[1].classList.add('is-active');
    }
    document.getElementById(tabName).classList.add('is-active');
}

document.addEventListener('DOMContentLoaded', () => {
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
});

function toggleAccordion() {
    const card = document.getElementById('add-timer-accordion');
    card.classList.toggle('open');
}

class WheelPicker {
    constructor(containerId, min, max, initialVal = 0, nameStr = "") {
        this.container = document.getElementById(containerId);
        this.list = this.container.querySelector('.wheel-list');
        this.min = min;
        this.max = max;
        this.nameStr = nameStr;
        this.itemHeight = 40;
        this.selectedValue = initialVal;

        this.currentY = 0;
        this.startY = 0;
        this.isDragging = false;
        
        this.lastY = 0;
        this.lastTime = 0;
        this.velocity = 0;
        this.animId = null;

        this.init();
    }

    init() {
        this.list.innerHTML = '';
        for (let i = this.min; i <= this.max; i++) {
            const li = document.createElement('li');
            li.className = 'wheel-item';
            li.textContent = i;
            
            li.addEventListener('click', (e) => {
                e.stopPropagation();
                this.promptDirectInput(i);
            });
            
            this.list.appendChild(li);
        }

        this.setValue(this.selectedValue, false);

        const el = this.container;
        el.addEventListener('touchstart', (e) => this.onStart(e.touches[0].clientY), { passive: true });
        window.addEventListener('touchmove', (e) => { if(this.isDragging) this.onMove(e.touches[0].clientY); }, { passive: true });
        window.addEventListener('touchend', () => this.onEnd());

        el.addEventListener('mousedown', (e) => this.onStart(e.clientY));
        window.addEventListener('mousemove', (e) => { if(this.isDragging) this.onMove(e.clientY); });
        window.addEventListener('mouseup', () => this.onEnd());
    }

    promptDirectInput(clickedVal) {
        const input = prompt(`${this.nameStr}を入力してください (${this.min}〜${this.max}):`, clickedVal);
        if (input !== null && input !== "") {
            const parsed = parseInt(input, 10);
            if (!isNaN(parsed)) {
                this.setValue(parsed, true);
            }
        }
    }

    onStart(y) {
        if (this.animId) cancelAnimationFrame(this.animId);
        this.isDragging = true;
        this.startY = y;
        this.lastY = y;
        this.lastTime = performance.now();
        this.velocity = 0;
    }

    onMove(y) {
        if (!this.isDragging) return;
        const now = performance.now();
        const deltaY = y - this.lastY;
        const dt = now - this.lastTime;

        if (dt > 0) {
            this.velocity = deltaY / dt;
        }

        this.currentY += deltaY;
        this.lastY = y;
        this.lastTime = now;

        this.updatePosition();
    }

    onEnd() {
        if (!this.isDragging) return;
        this.isDragging = false;

        const friction = 0.95;
        const minVel = 0.05;

        const animateInertia = () => {
            if (Math.abs(this.velocity) > minVel) {
                this.currentY += this.velocity * 16;
                this.velocity *= friction;

                const minY = -(this.max - this.min) * this.itemHeight;
                if (this.currentY > 0 || this.currentY < minY) {
                    this.velocity *= 0.5;
                }

                this.updatePosition();
                this.animId = requestAnimationFrame(animateInertia);
            } else {
                this.snapToNearest();
            }
        };

        this.animId = requestAnimationFrame(animateInertia);
    }

    snapToNearest() {
        const minY = -(this.max - this.min) * this.itemHeight;
        const maxY = 0;
        
        let targetY = this.currentY;
        if (targetY > maxY) targetY = maxY;
        if (targetY < minY) targetY = minY;

        let index = Math.round(-targetY / this.itemHeight);
        this.setValue(this.min + index, true);
    }

    updatePosition() {
        this.list.style.transform = `translateY(${this.currentY}px)`;
        
        let index = Math.round(-this.currentY / this.itemHeight);
        const items = this.list.querySelectorAll('.wheel-item');
        items.forEach((item, i) => {
            if (i === index) {
                item.classList.add('selected');
            } else {
                item.classList.remove('selected');
            }
        });
    }

    setValue(val, animate = true) {
        if (val < this.min) val = this.min;
        if (val > this.max) val = this.max;
        this.selectedValue = val;

        const index = val - this.min;
        this.currentY = -index * this.itemHeight;

        if (animate) {
            this.list.style.transition = 'transform 0.2s ease-out';
            setTimeout(() => {
                this.list.style.transition = 'none';
            }, 200);
        } else {
            this.list.style.transition = 'none';
        }

        this.updatePosition();
    }

    getValue() {
        return this.selectedValue;
    }
}

let pickerHours, pickerMinutes, pickerSeconds;

let timers = [
    { id: 1, label: '3分タイマー', totalSec: 180, remainingSec: 180, isRunning: false, intervalId: null },
    { id: 2, label: '6分タイマー', totalSec: 360, remainingSec: 360, isRunning: false, intervalId: null }
];

function loadTimersFromStorage() {
    const data = localStorage.getItem('multi_timers_v4_data');
    if (data) {
        try {
            const saved = JSON.parse(data);
            if (Array.isArray(saved) && saved.length > 0) {
                timers = saved.map(t => ({
                    id: t.id,
                    label: t.label,
                    totalSec: t.totalSec,
                    remainingSec: t.totalSec,
                    isRunning: false,
                    intervalId: null
                }));
            }
        } catch(e) {
            console.error('タイマーデータの読み込みエラー', e);
        }
    }
}

function saveTimersToStorage() {
    const dataToSave = timers.map(t => ({
        id: t.id,
        label: t.label,
        totalSec: t.totalSec,
        remainingSec: t.totalSec
    }));
    localStorage.setItem('multi_timers_v4_data', JSON.stringify(dataToSave));
}

function renderTimers() {
    const container = document.getElementById('timers-list');
    if (!container) return;
    container.innerHTML = '';

    if (timers.length === 0) {
        container.innerHTML = '<div class="empty-msg">タイマーを追加してください</div>';
        return;
    }

    timers.forEach(t => {
        const card = document.createElement('div');
        card.className = 'timer-card';

        const hrs = Math.floor(t.remainingSec / 3600);
        const mins = Math.floor((t.remainingSec % 3600) / 60);
        const secs = t.remainingSec % 60;

        let timeStr = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
        if (hrs > 0) {
            timeStr = `${hrs}:${timeStr}`;
        }

        const circleLength = 188;
        const offset = t.totalSec > 0 ? circleLength - (t.remainingSec / t.totalSec) * circleLength : 0;

        card.innerHTML = `
            <div class="timer-card-left">
                <div class="progress-circle-wrapper">
                    <svg class="progress-svg" viewBox="0 0 70 70">
                        <circle class="circle-bg" cx="35" cy="35" r="30"></circle>
                        <circle class="circle-bar" cx="35" cy="35" r="30" style="stroke-dashoffset: ${offset};"></circle>
                    </svg>
                </div>
                <div class="timer-info">
                    <div class="timer-name">${escapeHtml(t.label || 'タイマー')}</div>
                    <div class="timer-time-text">${timeStr}</div>
                </div>
            </div>
            <div class="timer-controls">
                <button class="sm-circle-btn ${t.isRunning ? 'btn-pause' : 'btn-start'}" onclick="toggleTimer(${t.id})">
                    ${t.isRunning ? '一時停止' : 'スタート'}
                </button>
                <button class="sm-circle-btn btn-reset" onclick="resetTimer(${t.id})">リセット</button>
                <button class="sm-circle-btn btn-delete" onclick="deleteTimer(${t.id})">✕</button>
            </div>
        `;
        container.appendChild(card);
    });
}

function addNewTimer() {
    const labelInput = document.getElementById('new-timer-label');
    const h = pickerHours ? pickerHours.getValue() : 0;
    const m = pickerMinutes ? pickerMinutes.getValue() : 0;
    const s = pickerSeconds ? pickerSeconds.getValue() : 0;

    const totalSec = h * 3600 + m * 60 + s;
    if (totalSec <= 0) return;

    let defaultLabel = '';
    if (h > 0) defaultLabel += `${h}時間`;
    if (m > 0) defaultLabel += `${m}分`;
    if (s > 0) defaultLabel += `${s}秒`;

    const newTimer = {
        id: Date.now(),
        label: labelInput.value.trim() || `${defaultLabel}タイマー`,
        totalSec: totalSec,
        remainingSec: totalSec,
        isRunning: false,
        intervalId: null
    };

    timers.push(newTimer);
    labelInput.value = '';
    renderTimers();
    saveTimersToStorage();

    const card = document.getElementById('add-timer-accordion');
    if (card) card.classList.remove('open');
}

function toggleTimer(id) {
    initAudio();
    const target = timers.find(t => t.id === id);
    if (!target) return;

    if (target.isRunning) {
        clearInterval(target.intervalId);
        target.isRunning = false;
        renderTimers();
    } else {
        if (target.remainingSec <= 0) {
            target.remainingSec = target.totalSec;
        }

        target.isRunning = true;
        renderTimers();

        target.intervalId = setInterval(() => {
            target.remainingSec--;
            
            if (target.remainingSec <= 0) {
                clearInterval(target.intervalId);
                target.isRunning = false;
                playAlarmSound();
            }
            renderTimers();
        }, 1000);
    }
}

function resetTimer(id) {
    const target = timers.find(t => t.id === id);
    if (!target) return;

    clearInterval(target.intervalId);
    target.isRunning = false;
    target.remainingSec = target.totalSec;
    renderTimers();
}

function deleteTimer(id) {
    const target = timers.findIndex(t => t.id === id);
    if (target === -1) return;

    const timerToDelete = timers[target];
    clearInterval(timerToDelete.intervalId);
    timers.splice(target, 1);
    renderTimers();
    saveTimersToStorage();
}

function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

let presenStartTime = 0;
let presenElapsed = 0;
let presenIntervalId = null;
let presenBellsRung = new Set();

function savePresenSettings() {
    const settings = {
        bell1Min: parseInt(document.getElementById('bell1-min').value) || 0,
        bell1Sec: parseInt(document.getElementById('bell1-sec').value) || 0,
        bell2Min: parseInt(document.getElementById('bell2-min').value) || 0,
        bell2Sec: parseInt(document.getElementById('bell2-sec').value) || 0,
        bell2Enable: document.getElementById('bell2-enable').checked,
        bell3Min: parseInt(document.getElementById('bell3-min').value) || 0,
        bell3Sec: parseInt(document.getElementById('bell3-sec').value) || 0,
        bell3Enable: document.getElementById('bell3-enable').checked
    };
    localStorage.setItem('presen_bell_settings', JSON.stringify(settings));
}

function loadPresenSettings() {
    const data = localStorage.getItem('presen_bell_settings');
    if (data) {
        try {
            const settings = JSON.parse(data);
            document.getElementById('bell1-min').value = settings.bell1Min;
            document.getElementById('bell1-sec').value = settings.bell1Sec;
            document.getElementById('bell2-min').value = settings.bell2Min;
            document.getElementById('bell2-sec').value = settings.bell2Sec;
            document.getElementById('bell2-enable').checked = settings.bell2Enable;
            document.getElementById('bell3-min').value = settings.bell3Min;
            document.getElementById('bell3-sec').value = settings.bell3Sec;
            document.getElementById('bell3-enable').checked = settings.bell3Enable;
        } catch(e) {
            console.error('プレゼンベル設定の読み込みエラー', e);
        }
    }
}

function updatePresenDisplay() {
    const minutes = Math.floor(presenElapsed / 60);
    const seconds = presenElapsed % 60;
    document.getElementById('presen-display').textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    checkBells();
}

function checkBells() {
    const bell1Time = parseInt(document.getElementById('bell1-min').value) * 60 + parseInt(document.getElementById('bell1-sec').value);
    const bell2Time = parseInt(document.getElementById('bell2-min').value) * 60 + parseInt(document.getElementById('bell2-sec').value);
    const bell3Time = parseInt(document.getElementById('bell3-min').value) * 60 + parseInt(document.getElementById('bell3-sec').value);
    const bell2Enable = document.getElementById('bell2-enable').checked;
    const bell3Enable = document.getElementById('bell3-enable').checked;

    if (presenElapsed === bell1Time && !presenBellsRung.has('bell1')) {
        playRingBell(1);
        presenBellsRung.add('bell1');
    }
    if (bell2Enable && presenElapsed === bell2Time && !presenBellsRung.has('bell2')) {
        playRingBell(1);
        presenBellsRung.add('bell2');
    }
    if (bell3Enable && presenElapsed === bell3Time && !presenBellsRung.has('bell3')) {
        playRingBell(1);
        presenBellsRung.add('bell3');
    }
}

function togglePresenTimer() {
    if (presenIntervalId) {
        clearInterval(presenIntervalId);
        presenIntervalId = null;
        document.getElementById('presen-start-btn').textContent = 'スタート';
    } else {
        initAudio();
        presenStartTime = Date.now() - presenElapsed * 1000;
        document.getElementById('presen-start-btn').textContent = 'ストップ';
        presenIntervalId = setInterval(() => {
            presenElapsed = Math.floor((Date.now() - presenStartTime) / 1000);
            updatePresenDisplay();
        }, 100);
    }
}

function resetPresenTimer() {
    if (presenIntervalId) {
        clearInterval(presenIntervalId);
        presenIntervalId = null;
    }
    presenElapsed = 0;
    presenBellsRung.clear();
    updatePresenDisplay();
    document.getElementById('presen-start-btn').textContent = 'スタート';
}

document.addEventListener('DOMContentLoaded', () => {
    loadTimersFromStorage();
    loadPresenSettings();
    renderTimers();
    updatePresenDisplay();

    pickerHours = new WheelPicker('wheel-hours', 0, 23, 0, '時間');
    pickerMinutes = new WheelPicker('wheel-minutes', 0, 59, 1, '分');
    pickerSeconds = new WheelPicker('wheel-seconds', 0, 59, 30, '秒');
});