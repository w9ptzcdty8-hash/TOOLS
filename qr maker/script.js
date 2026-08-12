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

    // 「画像ダウンロード」ボタンを押したとき
    downloadBtn.addEventListener("click", () => {
        const img = qrcodeBox.querySelector("img");
        const canvas = qrcodeBox.querySelector("canvas");

        let imageSrc = "";
        if (img && img.src) {
            imageSrc = img.src;
        } else if (canvas) {
            imageSrc = canvas.toDataURL("image/png");
        }

        if (!imageSrc) {
            alert("画像の取得に失敗しました。");
            return;
        }

        const link = document.createElement("a");
        link.href = imageSrc;
        link.download = "qrcode.png";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
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
    // データ管理（LocalStorage）
    // ------------------------------------------
    function addHistory(text) {
        // 重複があれば一旦除去して先頭に追加（最新順）
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
        // 履歴の描画（直近5件 & 全件モーダル）
        renderItemList(historyList, historyData.slice(0, DISPLAY_LIMIT), "history");
        renderItemList(modalHistoryList, historyData, "history");
        showAllHistoryBtn.style.display = historyData.length > DISPLAY_LIMIT ? "block" : "none";

        // お気に入りの描画（直近5件 & 全件モーダル）
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

            // テキスト表示部分（タップで再生成）
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

            // ボタンエリア
            const actionDiv = document.createElement("div");
            actionDiv.className = "item-actions";

            // ★ お気に入りボタン
            const favBtn = document.createElement("button");
            const isFav = favData.includes(text);
            favBtn.className = `action-icon-btn ${isFav ? "active" : ""}`;
            favBtn.innerHTML = isFav ? "★" : "☆";
            favBtn.title = isFav ? "お気に入り解除" : "お気に入り追加";
            favBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                toggleFav(text);
            });

            // ✕ 削除ボタン
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
