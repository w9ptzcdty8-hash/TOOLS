document.addEventListener("DOMContentLoaded", () => {
    // 定数・最大件数定義
    const MAX_ITEMS = 100;
    const DISPLAY_LIMIT = 5;

    // ローカルストレージからのデータ読み込み
    let historyData = JSON.parse(localStorage.getItem("qrmaker_history") || "[]");
    let favData = JSON.parse(localStorage.getItem("qrmaker_favs") || "[]");

    // DOM要素の取得
    const qrInput = document.getElementById("qr-input");
    const generateBtn = document.getElementById("generate-btn");
    const resultSection = document.getElementById("result-section");
    const qrcodeBox = document.getElementById("qrcode-box");
    const downloadBtn = document.getElementById("download-btn");

    const historyList = document.getElementById("history-list");
    const showAllHistoryBtn = document.getElementById("show-all-history-btn");

    const favList = document.getElementById("fav-list");
    const showAllFavBtn = document.getElementById("show-all-fav-btn");

    const historyModal = document.getElementById("history-modal");
    const modalHistoryList = document.getElementById("modal-history-list");
    const closeHistoryModal = document.getElementById("close-history-modal");

    const favModal = document.getElementById("fav-modal");
    const modalFavList = document.getElementById("modal-fav-list");
    const closeFavModal = document.getElementById("close-fav-modal");

    // 初期描画実行
    renderLists();

    // ------------------------------------------
    // イベントリスナー設定
    // ------------------------------------------

    // 「QRコード作成」ボタンを押したとき
    generateBtn.addEventListener("click", () => {
        const text = qrInput.value.trim();
        if (!text) {
            alert("テキストまたはURLを入力してください。");
            return;
        }
        createQRCode(text);
        addHistory(text);
    });

    // 「画像ダウンロード」ボタンを押したとき（修正版）
    downloadBtn.addEventListener("click", () => {
        const canvas = qrcodeBox.querySelector("canvas");
        const img = qrcodeBox.querySelector("img");

        // 1. Canvas要素が存在する場合（Blobに変換してダウンロード）
        if (canvas) {
            try {
                canvas.toBlob((blob) => {
                    if (blob) {
                        executeDownload(blob);
                    } else {
                        fallbackDownload(canvas.toDataURL("image/png"));
                    }
                }, "image/png");
            } catch (e) {
                fallbackDownload(canvas.toDataURL("image/png"));
            }
            return;
        }

        // 2. img要素が存在する場合
        if (img && img.src) {
            fetch(img.src)
                .then(res => res.blob())
                .then(blob => executeDownload(blob))
                .catch(() => fallbackDownload(img.src));
            return;
        }

        alert("QRコード画像の取得に失敗しました。再度作成してください。");
    });

    // モーダルの開閉処理
    showAllHistoryBtn.addEventListener("click", () => openModal(historyModal));
    closeHistoryModal.addEventListener("click", () => closeModal(historyModal));

    showAllFavBtn.addEventListener("click", () => openModal(favModal));
    closeFavModal.addEventListener("click", () => closeModal(favModal));

    // モーダルの背景タップで閉じる
    window.addEventListener("click", (e) => {
        if (e.target === historyModal) closeModal(historyModal);
        if (e.target === favModal) closeModal(favModal);
    });

    // ------------------------------------------
    // QRコード生成処理
    // ------------------------------------------
    function createQRCode(text) {
        qrcodeBox.innerHTML = "";
        resultSection.style.display = "block";

        new QRCode(qrcodeBox, {
            text: text,
            width: 200,
            height: 200,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        // 生成エリアまでスクロール
        resultSection.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    // ------------------------------------------
    // ダウンロード実行・フォールバック処理
    // ------------------------------------------
    function executeDownload(blob) {
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = "qrcode.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // メモリ解放
        setTimeout(() => URL.revokeObjectURL(url), 10000);
    }

    function fallbackDownload(dataUrl) {
        // 自動ダウンロードが拒否された場合、新しいタブで画像を開いて長押し保存を促す
        const newWindow = window.open();
        if (newWindow) {
            newWindow.document.write(`<img src="${dataUrl}" alt="QR Code"><p>画像を長押しして保存してください。</p>`);
        } else {
            alert("ダウンロードがブロックされました。QRコード画像を長押しして保存してください。");
        }
    }

    // ------------------------------------------
    // データ管理（LocalStorage）
    // ------------------------------------------
    function addHistory(text) {
        historyData = historyData.filter(item => item !== text);
        historyData.unshift(text);

        if (historyData.length > MAX_ITEMS) {
            historyData = historyData.slice(0, MAX_ITEMS);
        }

        saveData();
        renderLists();
    }

    function removeHistory(text) {
        historyData = historyData.filter(item => item !== text);
        saveData();
        renderLists();
    }

    function toggleFav(text) {
        if (favData.includes(text)) {
            favData = favData.filter(item => item !== text);
        } else {
            favData.unshift(text);
            if (favData.length > MAX_ITEMS) {
                favData = favData.slice(0, MAX_ITEMS);
            }
        }
        saveData();
        renderLists();
    }

    function saveData() {
        localStorage.setItem("qrmaker_history", JSON.stringify(historyData));
        localStorage.setItem("qrmaker_favs", JSON.stringify(favData));
    }

    // ------------------------------------------
    // リスト描画処理
    // ------------------------------------------
    function renderLists() {
        renderItemList(historyList, historyData.slice(0, DISPLAY_LIMIT), "history");
        renderItemList(modalHistoryList, historyData, "history");
        showAllHistoryBtn.style.display = historyData.length > DISPLAY_LIMIT ? "block" : "none";

        renderItemList(favList, favData.slice(0, DISPLAY_LIMIT), "fav");
        renderItemList(modalFavList, favData, "fav");
        showAllFavBtn.style.display = favData.length > DISPLAY_LIMIT ? "block" : "none";
    }

    function renderItemList(targetEl, items, type) {
        targetEl.innerHTML = "";

        if (items.length === 0) {
            const emptyLi = document.createElement("li");
            emptyLi.className = "empty-msg";
            emptyLi.textContent = type === "history" ? "履歴はありません" : "お気に入りはありません";
            targetEl.appendChild(emptyLi);
            return;
        }

        items.forEach(text => {
            const li = document.createElement("li");
            li.className = "item-row";

            const textSpan = document.createElement("span");
            textSpan.className = "item-text";
            textSpan.textContent = text;
            textSpan.addEventListener("click", () => {
                qrInput.value = text;
                createQRCode(text);
                addHistory(text);
                closeModal(historyModal);
                closeModal(favModal);
            });

            const actionDiv = document.createElement("div");
            actionDiv.className = "item-actions";

            const favBtn = document.createElement("button");
            const isFav = favData.includes(text);
            favBtn.className = `action-icon-btn ${isFav ? "active" : ""}`;
            favBtn.innerHTML = isFav ? "★" : "☆";
            favBtn.title = isFav ? "お気に入り解除" : "お気に入り追加";
            favBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleFav(text);
            });

            const delBtn = document.createElement("button");
            delBtn.className = "action-icon-btn delete";
            delBtn.innerHTML = "✕";
            delBtn.title = "削除";
            delBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                if (type === "history") {
                    removeHistory(text);
                } else {
                    toggleFav(text);
                }
            });

            actionDiv.appendChild(favBtn);
            actionDiv.appendChild(delBtn);

            li.appendChild(textSpan);
            li.appendChild(actionDiv);

            targetEl.appendChild(li);
        });
    }

    function openModal(modalEl) {
        modalEl.classList.add("open");
    }

    function closeModal(modalEl) {
        modalEl.classList.remove("open");
    }

    // ------------------------------------------
    // スマホ誤作動（ダブルタップズーム）防止処理
    // ------------------------------------------
    let lastTouchEnd = 0;
    document.addEventListener("touchend", (event) => {
        const now = (new Date()).getTime();
        if (now - lastTouchEnd <= 300) {
            if (event.target.tagName !== "TEXTAREA" && event.target.tagName !== "INPUT") {
                event.preventDefault();
            }
        }
        lastTouchEnd = now;
    }, false);
});
