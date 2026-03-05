/* import.js
   ImportDialog・PersonCardImporter・PersonCardExporter・js-file-input changeハンドラ
   依存: state.js, migration.js, integrity.js
*/

const ImportDialog = (() => {
    let _pendingData    = null;  // パース済みデータ（待機中）
    let _pendingVersion = '';    // マイグレーションメモ

    const overlayEl  = () => document.getElementById('js-import-dialog-overlay');
    const filenameEl = () => document.getElementById('js-import-dialog-filename');
    const curTitleEl = () => document.getElementById('js-import-current-title');

    /** ダイアログを表示する */
    const open = (data, filename, versionNote) => {
        _pendingData    = data;
        _pendingVersion = versionNote;

        const overlay = overlayEl();
        if (!overlay) return;

        if (filenameEl()) filenameEl().textContent = filename;
        if (curTitleEl()) curTitleEl().textContent =
            storeManager.getState().workTitle || '（無題）';

        overlay.classList.remove('hidden');
        document.getElementById('js-import-as-new')?.focus();
    };

    const close = () => {
        _pendingData    = null;
        _pendingVersion = '';
        overlayEl()?.classList.add('hidden');
    };

    const confirm = (mode) => {
        if (!_pendingData) return;
        storeManager.dispatch('IMPORT_FILE', {
            data:        _pendingData,
            mode,
            versionNote: _pendingVersion,
        });
        close();
    };

    /** イベントアタッチ（初期化時に1回呼ぶ） */
    const init = () => {
        document.getElementById('js-import-as-new')
            ?.addEventListener('click', () => confirm('new'));
        document.getElementById('js-import-overwrite')
            ?.addEventListener('click', () => confirm('overwrite'));
        document.getElementById('js-import-cancel')
            ?.addEventListener('click', close);

        // オーバーレイ背景クリックでキャンセル
        overlayEl()?.addEventListener('click', (e) => {
            if (e.target === overlayEl()) close();
        });

        // ESCキーでキャンセル（他のESCハンドラより先に処理）
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !overlayEl()?.classList.contains('hidden')) {
                e.stopPropagation();
                close();
            }
        }, true); // capture phase で先取り
    };

    return { open, close, init };
})();

/* ═══════════════════════════════════════════════════════════
   PERSON CARD EXPORTER（F-CHAR-CARD）
   人物単体を personcard_*.json として書き出す
═══════════════════════════════════════════════════════════ */
const PersonCardExporter = {
    export(person) {
        const state = storeManager.getState();
        const { id: _id, ...personData } = person; // id を除く全フィールドをコピー
        const rawName = person.name || '名前なし';
        const safeName = sanitizeFilename(rawName, '名前なし');
        const filename = `personcard_${safeName}.json`;

        const cardData = {
            formatVersion: 1,
            exportedAt: new Date().toISOString(),
            sourceWorkTitle: state.workTitle || '',
            schemaVersion: SCHEMA_VERSION,
            person: personData,
        };

        const json = JSON.stringify(cardData, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS && navigator.share) {
            const file = new File([json], filename, { type: 'application/json' });
            navigator.share({ files: [file], title: filename }).catch(() => {});
        } else {
            const url    = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url; anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
        }
        Toast.show(`「${rawName}」のカードを書き出しました`);
    },
};

/* ═══════════════════════════════════════════════════════════
   PERSON CARD IMPORTER（F-CHAR-CARD）
   personcard_*.json を読み込んで現在の作品に人物を追加する
═══════════════════════════════════════════════════════════ */
const PersonCardImporter = (() => {
    /** イベントアタッチ（初期化時に1回呼ぶ） */
    const init = () => {
        document.getElementById('js-personcard-input')
            ?.addEventListener('change', (event) => {
                const file = event.target.files[0];
                if (!file) return;

                const MAX_FILE_SIZE = 5 * 1024 * 1024;
                if (file.size > MAX_FILE_SIZE) {
                    Toast.show('ファイルサイズが大きすぎます（上限5MB）');
                    event.target.value = '';
                    return;
                }

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const parsed = JSON.parse(e.target.result);

                        if (parsed.formatVersion !== 1 || !parsed.person || typeof parsed.person !== 'object') {
                            Toast.show('キャラクターカードの形式が正しくありません');
                            return;
                        }

                        let warning = '';
                        if (typeof parsed.schemaVersion === 'number' && parsed.schemaVersion !== SCHEMA_VERSION) {
                            warning = `（バージョン差異: v${parsed.schemaVersion} → v${SCHEMA_VERSION}）`;
                        }

                        const state = storeManager.getState();
                        const personName = parsed.person.name || '（名前なし）';
                        const duplicate = state.persons.find(p => p.name === personName);

                        const doImport = () => {
                            const newPerson = { ...createPerson(), ...parsed.person, id: generateId() };
                            storeManager.update({ persons: [...storeManager.getState().persons, newPerson] });
                            AppState.select('person', newPerson.id);
                            Toast.show(`「${personName}」を追加しました${warning}`);
                        };

                        if (duplicate) {
                            if (confirm(`「${personName}」は既にいます。それでも追加しますか？`)) {
                                doImport();
                            }
                        } else {
                            doImport();
                        }
                    } catch (error) {
                        Toast.show(`読み込みに失敗しました: ${error.message || '形式エラー'}`);
                        console.error('PersonCard import error:', error);
                    }
                };
                reader.readAsText(file);
                event.target.value = '';
            });
    };

    return { init };
})();

document.getElementById('js-file-input').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // ファイルサイズ上限チェック（10MB）
    const MAX_FILE_SIZE = 10 * 1024 * 1024;
    if (file.size > MAX_FILE_SIZE) {
        Toast.show('ファイルサイズが大きすぎます（上限10MB）');
        event.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const parsed = JSON.parse(e.target.result);
            const migrated = migrateToLatest(parsed);
            if (typeof validateMigratedState === 'function') {
                const warns = validateMigratedState(migrated);
                if (warns.length > 0) {
                    Toast.show(`⚠ マイグレーション警告（${warns.length}件）: ${warns[0]}`);
                }
            }
            const data     = validateImportedState(migrated);
            const versionNote = parsed.schemaVersion !== SCHEMA_VERSION ? 'マイグレーション済み' : '';

            // ダイアログを表示して上書き/新規をユーザーに選ばせる
            ImportDialog.open(data, file.name, versionNote);
        } catch (error) {
            Toast.show(`読み込みに失敗しました: ${error.message || '形式エラー'}`);
            console.error('Import error:', error);
        }
    };
    reader.readAsText(file);
    event.target.value = '';
});


