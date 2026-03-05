/* app.js
   App・キーボードショートカット・WORK_TITLE/SELECTイベント・INIT
   依存: 全モジュール
*/

const App = {
    addPerson() {
        const state  = storeManager.getState();
        const person = createPerson();
        storeManager.update({ persons: [...state.persons, person] });
        AppState.select('person', person.id);
    },

    addRelation() {
        const state = storeManager.getState();
        if (state.persons.length < 2) {
            Toast.show('人物を2人以上追加してください');
            return;
        }
        const relation = createRelation(state.persons[0].id, state.persons[1].id);
        storeManager.update({ relations: [...state.relations, relation] });
        AppState.select('relation', relation.id);
    },

    addEpisode() {
        const state   = storeManager.getState();
        const episode = createEpisode();
        storeManager.update({ episodes: [...state.episodes, episode] });
        AppState.select('episode', episode.id);
    },

    undo() {
        if (UndoStack.canUndo()) UndoStack.pop();
    },

    createNewWork() {
        storeManager.dispatch('CREATE_NEW_WORK', {});
    },

    deleteWork() {
        storeManager.dispatch('DELETE_WORK', {});
    },

    duplicateWork() {
        storeManager.dispatch('DUPLICATE_WORK', {});
    },

    importFile() {
        document.getElementById('js-file-input').click();
    },

    exportJSON() {
        const state    = storeManager.getState();
        // F-10: 手動保存時にバージョン履歴を記録
        if (typeof VersionHistory !== 'undefined') {
            const workId = storeManager.getCurrentWorkId();
            VersionHistory.push(workId, state, 'manual');
        }
        // ファイル名をサニタイズ（パス区切り・制御文字を除去）
        const rawTitle = state.workTitle || '物語設定';
        const safeTitle = sanitizeFilename(rawTitle, '物語設定');
        const filename = `${safeTitle}.json`;

        const exportData = { schemaVersion: SCHEMA_VERSION, ...state };
        const json     = JSON.stringify(exportData, null, 2);
        const blob     = new Blob([json], { type: 'application/json' });
        // iOS Safari は <a download> を無視するため Share API にフォールバック
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS && navigator.share) {
            const file = new File([json], filename, { type: 'application/json' });
            navigator.share({ files: [file], title: filename }).catch(() => {});
        } else {
            const url    = URL.createObjectURL(blob);
            const anchor = DOM.create('a', { href: url, download: filename });
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        }
        Toast.show('保存しました');
    },
};

/* ═══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════ */
document.addEventListener('keydown', (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        App.exportJSON();
    }

    if ((event.metaKey || event.ctrlKey) && event.key === 'z' && !event.shiftKey) {
        // テキスト入力中はブラウザネイティブのUndoに委ねる
        const active = document.activeElement;
        const isEditing = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (!isEditing) {
            event.preventDefault();
            App.undo();
        }
    }

    if (event.key === 'F9') {
        event.preventDefault();
        StoryViewer.open();
    }

    if (event.key === 'F10') {
        event.preventDefault();
        VersionHistoryDialog.open();
    }
});

/* ═══════════════════════════════════════════════════════════
   WORK TITLE INPUT
═══════════════════════════════════════════════════════════ */
document.getElementById('js-work-title').addEventListener('input', (event) => {
    storeManager.dispatch('UPDATE_WORK_TITLE', { key: 'workTitle', value: event.target.value });
});

/* ═══════════════════════════════════════════════════════════
   WORK SELECT
═══════════════════════════════════════════════════════════ */
document.getElementById('js-work-select').addEventListener('change', (event) => {
    const targetId = event.target.value;
    if (targetId) storeManager.dispatch('SWITCH_WORK', { targetId });
});

/* ═══════════════════════════════════════════════════════════
   F-MOBILE: ドロワー・メニュー
═══════════════════════════════════════════════════════════ */
const MobileDrawer = (() => {
    const _overlay = () => document.getElementById('js-drawer-overlay');
    const _sidebar = () => document.getElementById('js-sidebar-left');
    const open  = () => { if (typeof MobileDetailDrawer !== 'undefined') MobileDetailDrawer.close(); _sidebar().classList.add('drawer-open');    _overlay().classList.add('active'); };
    const close = () => { _sidebar().classList.remove('drawer-open'); _overlay().classList.remove('active'); };
    const toggle = () => { _sidebar().classList.contains('drawer-open') ? close() : open(); };
    // F-MOBILE フェーズ2: スワイプ閉じ（下方向60px超で閉じる）
    const initSwipe = () => {
        let startY = 0;
        _sidebar().addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
        _sidebar().addEventListener('touchend',   (e) => {
            if (e.changedTouches[0].clientY - startY > 60) close();
        }, { passive: true });
    };
    return { open, close, toggle, initSwipe };
})();

const MobileDetailDrawer = (() => {
    const _overlay = () => document.getElementById('js-drawer-overlay');
    const _panel   = () => document.getElementById('js-sidebar-right');
    const open  = () => { _panel().classList.add('detail-open');    _overlay().classList.add('active'); };
    const close = () => { _panel().classList.remove('detail-open'); _overlay().classList.remove('active'); };
    const toggle = () => { _panel().classList.contains('detail-open') ? close() : open(); };
    // F-MOBILE フェーズ2: スワイプ閉じ
    const initSwipe = () => {
        let startY = 0;
        _panel().addEventListener('touchstart', (e) => { startY = e.touches[0].clientY; }, { passive: true });
        _panel().addEventListener('touchend',   (e) => {
            if (e.changedTouches[0].clientY - startY > 60) close();
        }, { passive: true });
    };
    return { open, close, toggle, initSwipe };
})();

const MobileMenu = (() => {
    const _el = () => document.getElementById('js-mobile-menu');
    const open  = () => _el().classList.remove('hidden');
    const close = () => _el().classList.add('hidden');
    const toggle = () => { _el().classList.contains('hidden') ? open() : close(); };
    return { open, close, toggle };
})();

/* ═══════════════════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════════════════ */
(function initialize() {
    const restored = storeManager.tryRestoreFromLocalStorage();

    // 復元できた場合、またはストレージに作品がなければ初期作品を作成
    if (!restored) {
        // 初回起動：最初の作品を自動作成
        storeManager.initNewWork(generateId(), createInitialState());
    }

    document.getElementById('js-work-title').value =
        storeManager.getState().workTitle || '';

    WorkSwitcherUI.render();
    SidebarRenderer.renderAll();
    EditorRenderer.renderEmpty();

    // F-04: 全文検索UIの初期化
    SearchUI.init();

    // F-IMPORT: インポートダイアログの初期化
    ImportDialog.init();

    // F-CHAR-CARD: キャラクターカードインポーターの初期化
    PersonCardImporter.init();

    // F-10: バージョン履歴ダイアログの初期化
    VersionHistoryDialog.init();

    // F-AI: AIプロンプト出力ダイアログの初期化
    AIExportDialog.init();

    // I-02: ページロード時の整合性チェック
    if (restored) {
        const warnings = checkIntegrity(storeManager.getState());
        showIntegrityWarnings(warnings);
    }

    // F-MOBILE: ボトムタブ・ドロワー・メニューのイベント
    MobileDrawer.initSwipe();
    MobileDetailDrawer.initSwipe();
    document.getElementById('js-mobile-list-btn').addEventListener('click', () => MobileDrawer.toggle());
    document.getElementById('js-mobile-detail-btn').addEventListener('click', () => {
        MobileDrawer.close();
        MobileDetailDrawer.toggle();
    });
    document.getElementById('js-mobile-add-btn').addEventListener('click', () => {
        const sel = AppState.getSelection();
        if (sel && sel.type === 'relation') App.addRelation();
        else if (sel && sel.type === 'episode') App.addEpisode();
        else App.addPerson();
    });
    document.getElementById('js-mobile-save-btn').addEventListener('click', () => App.exportJSON());
    document.getElementById('js-drawer-overlay').addEventListener('click', () => {
        MobileDrawer.close();
        MobileDetailDrawer.close();
    });

    document.getElementById('js-mobile-menu-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        MobileMenu.toggle();
    });
    document.getElementById('js-mobile-menu-trigger').addEventListener('click', (e) => {
        e.stopPropagation();
        MobileMenu.toggle();
    });
    document.getElementById('js-mobile-undo').addEventListener('click',    () => { App.undo();                   MobileMenu.close(); });
    document.getElementById('js-mobile-import').addEventListener('click',  () => { App.importFile();             MobileMenu.close(); });
    document.getElementById('js-mobile-story').addEventListener('click',   () => { StoryViewer.open();           MobileMenu.close(); });
    document.getElementById('js-mobile-history').addEventListener('click', () => { VersionHistoryDialog.open(); MobileMenu.close(); });
    document.getElementById('js-mobile-ai').addEventListener('click',      () => { AIExportDialog.open();       MobileMenu.close(); });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#js-mobile-menu') &&
            !e.target.closest('#js-mobile-menu-btn') &&
            !e.target.closest('#js-mobile-menu-trigger')) {
            MobileMenu.close();
        }
    });
})();
