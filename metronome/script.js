// ========================================
// メトロノーム | MRS TOOLS
// Web Audio APIによる正確なタイミング再生 +
// OfflineAudioContextによるWAV書き出し
// ========================================


// ========================================
// 1. 状態
// ========================================

const settings = {
    bpm: 120,
    beatsPerMeasure: 4,
    accentBeat: 1,       // 0: アクセントなし / 1-indexed: アクセント拍
    presetIndex: 0,      // 0-2: 内蔵音色 / 3: カスタム
};

const BEATS_OPTIONS = [2, 3, 4];

const PRESETS = [
    { id: 0, name: "クラシック" },
    { id: 1, name: "ウッドブロック" },
    { id: 2, name: "デジタル" },
];

let customNormalBuffer = null;
let customAccentBuffer = null;

let audioCtx = null;
let isPlaying = false;
let currentBeat = 0;      // 0-indexed
let nextNoteTime = 0.0;
let timerID = null;
const LOOKAHEAD_MS = 25.0;
const SCHEDULE_AHEAD_SEC = 0.1;
let noteQueue = [];       // { beatIndex, time }

let statusTimer = null;   // エラーメッセージ自動破棄用タイマー


// ========================================
// 2. DOM参照
// ========================================

const statusMessage = document.getElementById("status-message");

const pulseOrb = document.getElementById("pulse-orb");
const pulseBeatNum = document.getElementById("pulse-beat-num");
const beatDotsEl = document.getElementById("beat-dots");

const btnPlayStop = document.getElementById("btn-play-stop");
const playIcon = document.getElementById("play-icon");

const bpmNumber = document.getElementById("bpm-number");
const bpmSlider = document.getElementById("bpm-slider");
const bpmMinus = document.getElementById("bpm-minus");
const bpmPlus = document.getElementById("bpm-plus");

const beatsSelectEl = document.getElementById("beats-select");
const accentSelectEl = document.getElementById("accent-select");
const presetSelectEl = document.getElementById("preset-select");

const customPanel = document.getElementById("custom-panel");
const uploadNormalInput = document.getElementById("upload-normal");
const uploadAccentInput = document.getElementById("upload-accent");
const uploadNormalStatus = document.getElementById("upload-normal-status");
const uploadAccentStatus = document.getElementById("upload-accent-status");
const btnClearNormal = document.getElementById("btn-clear-normal");
const btnClearAccent = document.getElementById("btn-clear-accent");

const barsInput = document.getElementById("bars-input");
const btnDownload = document.getElementById("btn-download");
const downloadLabel = document.getElementById("download-label");


// ========================================
// 3. AudioContext
// ========================================

function ensureAudioContext() {
    if (!audioCtx) {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === "suspended" || audioCtx.state === "interrupted") {
        audioCtx.resume();
    }
    return audioCtx;
}

// バックグラウンド切り替え・サスペンド復帰対策
function setupAppLifecycleHandlers() {
    const handleResume = () => {
        if (audioCtx && (audioCtx.state === "suspended" || audioCtx.state === "interrupted")) {
            audioCtx.resume();
        }
    };

    document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") {
            handleResume();
        }
    });

    window.addEventListener("pageshow", handleResume);
    window.addEventListener("focus", handleResume);
}


// ========================================
// 4. 音色（内蔵プリセットの波形合成 / カスタム再生）
// ========================================

function playPresetClick(ctx, time, isAccent, presetIndex) {
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    let freqStart, freqEnd, duration, peakGain, type;

    if (presetIndex === 0) {
        // クラシック：短いクリック音
        type = "sine";
        freqStart = isAccent ? 1600 : 1000;
        freqEnd = null;
        duration = 0.05;
        peakGain = isAccent ? 0.4 : 0.28;
    } else if (presetIndex === 1) {
        // ウッドブロック：ピッチが素早く下がる音
        type = "triangle";
        freqStart = isAccent ? 1400 : 900;
        freqEnd = isAccent ? 650 : 420;
        duration = 0.07;
        peakGain = isAccent ? 0.45 : 0.32;
    } else {
        // デジタル：ビープ音
        type = "sine";
        freqStart = isAccent ? 1800 : 1200;
        freqEnd = null;
        duration = 0.14;
        peakGain = isAccent ? 0.32 : 0.22;
    }

    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, time);
    if (freqEnd !== null) {
        osc.frequency.exponentialRampToValueAtTime(freqEnd, time + duration);
    }

    gainNode.gain.setValueAtTime(peakGain, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

    osc.connect(gainNode).connect(ctx.destination);
    osc.start(time);
    osc.stop(time + duration + 0.02);
}

function playCustomBuffer(ctx, time, isAccent) {
    const hasAccentBuffer = !!customAccentBuffer;
    const buffer = isAccent && hasAccentBuffer ? customAccentBuffer : customNormalBuffer;
    if (!buffer) return;

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    if (isAccent && !hasAccentBuffer) {
        source.playbackRate.value = 1.25;
    }

    source.connect(ctx.destination);
    source.start(time);

    // 現在のBPMでの「2拍分」の長さを計算して自動停止（stop）
    const twoBeatsDuration = (60.0 / settings.bpm) * 2;
    source.stop(time + twoBeatsDuration);
}

function scheduleBeatSound(ctx, time, beatIndexInMeasure) {
    // accentBeat が 0 のときは全拍通常音（isAccent = false）
    const isAccent = settings.accentBeat > 0 && (beatIndexInMeasure + 1) === settings.accentBeat;

    if (settings.presetIndex === 3) {
        playCustomBuffer(ctx, time, isAccent);
    } else {
        playPresetClick(ctx, time, isAccent, settings.presetIndex);
    }
}


// ========================================
// 5. スケジューラ
// ========================================

function nextNote() {
    const secondsPerBeat = 60.0 / settings.bpm;
    nextNoteTime += secondsPerBeat;
    currentBeat = (currentBeat + 1) % settings.beatsPerMeasure;
}

function scheduler() {
    while (nextNoteTime < audioCtx.currentTime + SCHEDULE_AHEAD_SEC) {
        noteQueue.push({ beatIndex: currentBeat, time: nextNoteTime });
        scheduleBeatSound(audioCtx, nextNoteTime, currentBeat);
        nextNote();
    }
    timerID = setTimeout(scheduler, LOOKAHEAD_MS);
}

function startMetronome() {
    if (settings.presetIndex === 3 && !customNormalBuffer) {
        showStatusMessage("カスタム音源が未設定です。「音色」タブから設定してください。");
        return;
    }
    hideStatusMessage();

    ensureAudioContext();
    isPlaying = true;
    currentBeat = 0;
    noteQueue = [];
    nextNoteTime = audioCtx.currentTime + 0.05;

    btnPlayStop.classList.add("is-playing");
    playIcon.classList.add("is-playing");

    scheduler();
    requestAnimationFrame(drawLoop);
}

function stopMetronome() {
    isPlaying = false;
    clearTimeout(timerID);

    btnPlayStop.classList.remove("is-playing");
    playIcon.classList.remove("is-playing");

    pulseOrb.classList.remove("tick", "accent");
    Array.from(beatDotsEl.children).forEach((dot) => dot.classList.remove("active"));
}

function togglePlayStop() {
    if (isPlaying) {
        stopMetronome();
    } else {
        startMetronome();
    }
}


// ========================================
// 6. 描画（拍の可視化）
// ========================================

let lastDisplayedNoteTime = -1;

function drawLoop() {
    if (!isPlaying) return;

    const now = audioCtx.currentTime;

    let noteToDisplay = null;
    while (noteQueue.length && noteQueue[0].time <= now) {
        noteToDisplay = noteQueue.shift();
    }

    if (noteToDisplay && noteToDisplay.time !== lastDisplayedNoteTime) {
        lastDisplayedNoteTime = noteToDisplay.time;
        highlightBeat(noteToDisplay.beatIndex);
    }

    requestAnimationFrame(drawLoop);
}

function highlightBeat(beatIndexInMeasure) {
    const isAccent = settings.accentBeat > 0 && (beatIndexInMeasure + 1) === settings.accentBeat;

    pulseBeatNum.textContent = String(beatIndexInMeasure + 1);
    pulseOrb.classList.remove("tick", "accent");
    void pulseOrb.offsetWidth;
    pulseOrb.classList.add("tick");
    if (isAccent) pulseOrb.classList.add("accent");

    Array.from(beatDotsEl.children).forEach((dot, i) => {
        dot.classList.toggle("active", i === beatIndexInMeasure);
    });
}


// ========================================
// 7. UI生成 / タブ切り替え
// ========================================

function initTabNavigation() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabPanels = document.querySelectorAll(".tab-panel");

    tabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetId = btn.dataset.tab;

            tabBtns.forEach((b) => {
                const isActive = b === btn;
                b.classList.toggle("is-active", isActive);
                b.setAttribute("aria-selected", isActive ? "true" : "false");
            });

            tabPanels.forEach((panel) => {
                panel.classList.toggle("is-active", panel.id === targetId);
            });
        });
    });
}

function renderBeatsOptions() {
    beatsSelectEl.innerHTML = "";
    BEATS_OPTIONS.forEach((n) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "seg-btn";
        btn.textContent = `${n}拍子`;
        if (n === settings.beatsPerMeasure) btn.classList.add("is-active");
        btn.addEventListener("click", () => {
            settings.beatsPerMeasure = n;
            if (settings.accentBeat > n) settings.accentBeat = 1;
            renderBeatsOptions();
            renderAccentOptions();
            renderBeatDots();
        });
        beatsSelectEl.appendChild(btn);
    });
}

function renderAccentOptions() {
    accentSelectEl.innerHTML = "";

    // 「なし」オプション (i = 0)
    const noneBtn = document.createElement("button");
    noneBtn.type = "button";
    noneBtn.className = "seg-btn";
    noneBtn.textContent = "なし";
    if (settings.accentBeat === 0) noneBtn.classList.add("is-active", "accent-active");
    noneBtn.addEventListener("click", () => {
        settings.accentBeat = 0;
        renderAccentOptions();
        renderBeatDots();
    });
    accentSelectEl.appendChild(noneBtn);

    // 1拍目〜N拍目オプション
    for (let i = 1; i <= settings.beatsPerMeasure; i++) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "seg-btn";
        btn.textContent = `${i}拍目`;
        if (i === settings.accentBeat) btn.classList.add("is-active", "accent-active");
        btn.addEventListener("click", () => {
            settings.accentBeat = i;
            renderAccentOptions();
            renderBeatDots();
        });
        accentSelectEl.appendChild(btn);
    }
}

function renderBeatDots() {
    beatDotsEl.innerHTML = "";
    for (let i = 0; i < settings.beatsPerMeasure; i++) {
        const dot = document.createElement("div");
        dot.className = "beat-dot";
        if (settings.accentBeat > 0 && i + 1 === settings.accentBeat) {
            dot.classList.add("accent-slot");
        }
        beatDotsEl.appendChild(dot);
    }
}

function renderPresetOptions() {
    presetSelectEl.innerHTML = "";

    PRESETS.forEach((preset) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "seg-btn";
        btn.textContent = preset.name;
        if (preset.id === settings.presetIndex) btn.classList.add("is-active");
        btn.addEventListener("click", () => {
            settings.presetIndex = preset.id;
            customPanel.classList.add("hidden");
            renderPresetOptions();
            hideStatusMessage();
        });
        presetSelectEl.appendChild(btn);
    });

    const customBtn = document.createElement("button");
    customBtn.type = "button";
    customBtn.className = "seg-btn";
    customBtn.textContent = "カスタム";
    if (settings.presetIndex === 3) customBtn.classList.add("is-active");
    customBtn.addEventListener("click", () => {
        settings.presetIndex = 3;
        customPanel.classList.remove("hidden");
        renderPresetOptions();
    });
    presetSelectEl.appendChild(customBtn);
}


// ========================================
// 8. BPM操作
// ========================================

function setBpm(value) {
    const clamped = Math.min(600, Math.max(30, Math.round(value)));
    settings.bpm = clamped;
    bpmNumber.value = clamped;
    bpmSlider.value = clamped;
}

function initBpmControls() {
    bpmSlider.addEventListener("input", () => setBpm(bpmSlider.value));
    bpmNumber.addEventListener("input", () => {
        if (bpmNumber.value === "") return;
        setBpm(bpmNumber.value);
    });
    bpmNumber.addEventListener("blur", () => setBpm(bpmNumber.value || settings.bpm));
    bpmMinus.addEventListener("click", () => setBpm(settings.bpm - 1));
    bpmPlus.addEventListener("click", () => setBpm(settings.bpm + 1));
}


// ========================================
// 9. メッセージ表示（自動消滅タイマー付き）
// ========================================

function showStatusMessage(msg) {
    if (statusTimer) {
        clearTimeout(statusTimer);
    }
    statusMessage.textContent = msg;
    statusMessage.classList.remove("hidden");

    statusTimer = setTimeout(() => {
        hideStatusMessage();
    }, 3500);
}

function hideStatusMessage() {
    if (statusTimer) {
        clearTimeout(statusTimer);
        statusTimer = null;
    }
    statusMessage.classList.add("hidden");
}


// ========================================
// 10. カスタム音源アップロード / クリア
// ========================================

function safeDecodeAudioData(ctx, arrayBuffer) {
    return new Promise((resolve, reject) => {
        const bufferCopy = arrayBuffer.slice(0);
        const res = ctx.decodeAudioData(
            bufferCopy,
            (decoded) => resolve(decoded),
            (err) => reject(err)
        );
        if (res && typeof res.then === "function") {
            res.then(resolve).catch(reject);
        }
    });
}

async function handleUpload(file, target) {
    if (!file) return;
    try {
        const ctx = ensureAudioContext();
        const arrayBuffer = await file.arrayBuffer();
        const decoded = await safeDecodeAudioData(ctx, arrayBuffer);

        if (decoded.duration > 2.05) {
            showStatusMessage("音声が長すぎます。2秒以内の音声ファイルを選択してください。");
            return;
        }

        if (target === "normal") {
            customNormalBuffer = decoded;
            uploadNormalStatus.textContent = file.name;
            btnClearNormal.classList.remove("hidden");
        } else {
            customAccentBuffer = decoded;
            uploadAccentStatus.textContent = file.name;
            btnClearAccent.classList.remove("hidden");
        }
        hideStatusMessage();
    } catch (err) {
        showStatusMessage("音声の読み込みに失敗しました。別のファイルをお試しください。");
    }
}

function clearCustomBuffer(target) {
    if (target === "normal") {
        customNormalBuffer = null;
        uploadNormalStatus.textContent = "未設定";
        uploadNormalInput.value = "";
        btnClearNormal.classList.add("hidden");
    } else {
        customAccentBuffer = null;
        uploadAccentStatus.textContent = "未設定";
        uploadAccentInput.value = "";
        btnClearAccent.classList.add("hidden");
    }
}

function initUploadControls() {
    document.querySelectorAll(".btn-upload").forEach((btn) => {
        btn.addEventListener("click", () => {
            ensureAudioContext();
            document.getElementById(btn.dataset.target).click();
        });
    });

    uploadNormalInput.addEventListener("change", (e) => {
        ensureAudioContext();
        handleUpload(e.target.files[0], "normal");
    });
    uploadAccentInput.addEventListener("change", (e) => {
        ensureAudioContext();
        handleUpload(e.target.files[0], "accent");
    });

    btnClearNormal.addEventListener("click", (e) => {
        e.preventDefault();
        clearCustomBuffer("normal");
    });

    btnClearAccent.addEventListener("click", (e) => {
        e.preventDefault();
        clearCustomBuffer("accent");
    });
}


// ========================================
// 11. WAV書き出し（OfflineAudioContext）
// ========================================

async function renderAndDownloadWav() {
    if (settings.presetIndex === 3 && !customNormalBuffer) {
        showStatusMessage("カスタム音源が未設定です。「音色」タブから設定してください。");
        return;
    }
    hideStatusMessage();

    const bars = Math.min(64, Math.max(1, parseInt(barsInput.value, 10) || 8));
    barsInput.value = bars;

    const totalBeats = bars * settings.beatsPerMeasure;
    const secondsPerBeat = 60 / settings.bpm;
    const tailSeconds = 0.5;
    const totalDuration = totalBeats * secondsPerBeat + tailSeconds;
    const sampleRate = 44100;

    btnDownload.disabled = true;
    downloadLabel.textContent = "書き出し中…";

    try {
        const OfflineCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        const offlineCtx = new OfflineCtx(2, Math.ceil(totalDuration * sampleRate), sampleRate);

        for (let n = 0; n < totalBeats; n++) {
            const time = n * secondsPerBeat;
            const beatIndexInMeasure = n % settings.beatsPerMeasure;
            scheduleBeatSound(offlineCtx, time, beatIndexInMeasure);
        }

        const renderedBuffer = await offlineCtx.startRendering();
        const wavBlob = audioBufferToWavBlob(renderedBuffer);

        const filename = `metronome_${settings.bpm}bpm_${settings.beatsPerMeasure}haku_${bars}measures.wav`;
        triggerDownload(wavBlob, filename);
    } catch (err) {
        showStatusMessage("書き出し中にエラーが発生しました。もう一度お試しください。");
    } finally {
        btnDownload.disabled = false;
        downloadLabel.textContent = "WAVファイルをダウンロード";
    }
}

function audioBufferToWavBlob(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const bitDepth = 16;

    let interleaved;
    if (numChannels === 2) {
        interleaved = interleaveStereo(buffer.getChannelData(0), buffer.getChannelData(1));
    } else {
        interleaved = buffer.getChannelData(0);
    }

    const bytesPerSample = bitDepth / 8;
    const dataLength = interleaved.length * bytesPerSample;
    const arrayBuffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(arrayBuffer);

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + dataLength, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
    view.setUint16(32, numChannels * bytesPerSample, true);
    view.setUint16(34, bitDepth, true);
    writeString(view, 36, "data");
    view.setUint32(40, dataLength, true);

    floatTo16BitPCM(view, 44, interleaved);

    return new Blob([view], { type: "audio/wav" });
}

function interleaveStereo(left, right) {
    const length = left.length + right.length;
    const result = new Float32Array(length);
    let index = 0;
    let inputIndex = 0;
    while (index < length) {
        result[index++] = left[inputIndex];
        result[index++] = right[inputIndex];
        inputIndex++;
    }
    return result;
}

function floatTo16BitPCM(view, offset, input) {
    for (let i = 0; i < input.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}


// ========================================
// 12. 誤操作防止（ブラウザバック対策）
// ========================================

function initBackButtonGuard() {
    history.pushState({ mrsTool: true }, "");
    window.addEventListener("popstate", () => {
        history.pushState({ mrsTool: true }, "");
        if (isPlaying) {
            stopMetronome();
        }
    });
}


// ========================================
// 13. 初期化
// ========================================

function init() {
    setupAppLifecycleHandlers();
    initTabNavigation();
    renderBeatsOptions();
    renderAccentOptions();
    renderBeatDots();
    renderPresetOptions();

    initBpmControls();
    initUploadControls();
    initBackButtonGuard();

    btnPlayStop.addEventListener("click", togglePlayStop);
    btnDownload.addEventListener("click", renderAndDownloadWav);

    barsInput.addEventListener("blur", () => {
        const val = parseInt(barsInput.value, 10);
        barsInput.value = Math.min(64, Math.max(1, isNaN(val) ? 8 : val));
    });
}

document.addEventListener("DOMContentLoaded", init);