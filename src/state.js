/* state.js
   generateId・deepFreeze・StateManager・storeManagerインスタンス
   依存: schema.js
*/

const AUTOSAVE_KEY   = 'koen-v3-autosave';   // 後方互換用（未使用に移行）
const WORK_INDEX_KEY = 'ME_Setting_Index';   // 作品一覧メタデータ
const WORK_DATA_KEY  = (id) => `ME_Setting_Data_${id}`; // 各作品の実体
const PERSON_COLORS  = ['#8b6b3d','#2d6a4f','#1d3557','#6a0572','#7d4e57','#3d5a80','#6b4226','#1b5e20'];

const PERSON_TABS = [
    { label:'基本',       key:'basic'    },
    { label:'外見・身体', key:'body'     },
    { label:'性格・内面', key:'mind'     },
    { label:'性的側面',   key:'sexual'   },
    { label:'現在の状況', key:'status'   },
    { label:'学歴',       key:'education'},
];
const RELATION_TABS = [
    { label:'基本',     key:'basic'    },
    { label:'性的経験', key:'sexual'   },
    { label:'嘘・秘密', key:'lies'     },
    { label:'感情変化', key:'emotions' },
];
const EPISODE_TABS = [
    { label:'プロット',     key:'plot'     },
    { label:'登場人物・関係', key:'cast'   },
    { label:'執筆',         key:'writing'  },
];

/* ═══════════════════════════════════════════════════════════
   ID GENERATOR
═══════════════════════════════════════════════════════════ */
/** ランダムUUIDを生成する。crypto.randomUUID() 非対応環境ではフォールバックを使用。 */
const generateId = () =>
    (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ═══════════════════════════════════════════════════════════
   DEEP FREEZE (V-19)
   getState()が返すオブジェクトをネスト配列含め完全凍結する。
   PersonSelectBuilder等が state内配列をミューテートしようとすると
   strictモードでは TypeError、通常モードでは無音で失敗する。
═══════════════════════════════════════════════════════════ */
function deepFreeze(obj) {
    if (obj === null || typeof obj !== 'object' || Object.isFrozen(obj)) return obj;
    Object.freeze(obj);
    Object.getOwnPropertyNames(obj).forEach(key => {
        const val = obj[key];
        if (val !== null && typeof val === 'object' && !Object.isFrozen(val)) {
            deepFreeze(val);
        }
    });
    return obj;
}

/* ═══════════════════════════════════════════════════════════
   STATE MANAGER
   update() 経由でのみ状態を変更する。変更ごとに自動保存をスケジュール。
═══════════════════════════════════════════════════════════ */
class StateManager {
    constructor(initialState) {
        this._state        = initialState;
        this._currentWorkId = null;   // 現在編集中の作品ID
        this._saveTimer    = null;
        this._saveDelay    = 1500;
        this._subscribers  = [];
        this._dirty        = false;
        this._emergencyBuffer = null;
    }


    getState() {
        return deepFreeze({ ...this._state });
    }

    /** トップレベルの浅いマージ更新 */
    update(partialState) {
        this._state = { ...this._state, ...partialState };
        this._markDirty();
        this._subscribers.forEach(fn => fn(this._state));
    }

    // 各Builderが直接スプレッドせず、ここを通すことでロジックを集約する

    /** 人物の一部フィールドを更新する。Builderはこれを呼ぶ */
    updatePerson(id, partial) {
        const persons = this._state.persons.map(p =>
            p.id === id ? { ...p, ...partial } : p
        );
        this.update({ persons });
    }

    /** 関係の一部フィールドを更新する */
    updateRelation(id, partial) {
        const relations = this._state.relations.map(r =>
            r.id === id ? { ...r, ...partial } : r
        );
        this.update({ relations });
    }

    /** エピソードの一部フィールドを更新する */
    updateEpisode(id, partial) {
        const episodes = this._state.episodes.map(e =>
            e.id === id ? { ...e, ...partial } : e
        );
        this.update({ episodes });
    }

    /** 人物の順序を入れ替える（ドラッグ&ドロップ用） */
    reorderPersons(fromIndex, toIndex) {
        const persons = [...this._state.persons];
        const [moved] = persons.splice(fromIndex, 1);
        persons.splice(toIndex, 0, moved);
        this.update({ persons });
    }

    /** エピソードの順序を入れ替える */
    reorderEpisodes(fromIndex, toIndex) {
        const episodes = [...this._state.episodes];
        const [moved] = episodes.splice(fromIndex, 1);
        episodes.splice(toIndex, 0, moved);
        this.update({ episodes });
    }

    subscribe(fn) {
        this._subscribers.push(fn);
        return () => { this._subscribers = this._subscribers.filter(s => s !== fn); };
    }

    /** 自動保存をスケジュール（外部から呼び出し可能） */
    scheduleAutosave() {
        this._scheduleAutosave();
    }

    load(newState) {
        this._state = newState;
        this._emergencyBuffer = null;
        this._scheduleAutosave();
        this._subscribers.forEach(fn => fn(this._state));
    }

    _markDirty() {
        this._dirty = true;
        this._updateSaveIndicator();
        this._scheduleAutosave();
    }

    _markClean() {
        this._dirty = false;
        this._updateSaveIndicator();
    }

    _updateSaveIndicator() {
        const el = document.getElementById('js-save-indicator');
        if (!el) return;
        if (this._dirty) {
            el.classList.remove('saved');
        } else {
            el.classList.add('saved');
        }
    }

    _scheduleAutosave() {
        clearTimeout(this._saveTimer);
        this._saveTimer = setTimeout(() => this._persist(), this._saveDelay);
    }

    _persist(silent = false) {
        try {
            this._emergencyBuffer = structuredClone
                ? structuredClone(this._state)
                : JSON.parse(JSON.stringify(this._state));
        } catch (_) { /* structuredClone失敗は無視 */ }

        try {
            if (this._currentWorkId) {
                // 作品データを個別キーに保存
                localStorage.setItem(WORK_DATA_KEY(this._currentWorkId), JSON.stringify(this._state));
                // インデックスのlastModifiedを更新
                this._updateWorkIndex(this._currentWorkId, { lastModified: new Date().toISOString() });
                // F-10: 自動保存のたびにバージョン履歴スナップショットを記録
                if (typeof VersionHistory !== 'undefined') {
                    const kind = silent ? 'auto' : 'manual';
                    VersionHistory.push(this._currentWorkId, this._state, kind);
                }
            } else {
                // フォールバック: 旧キーに保存
                localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(this._state));
            }
            if (!silent) Toast.show('✓ 自動保存');
            Banner.hide();
            this._markClean();
        } catch (error) {
            const isQuotaError = error instanceof DOMException && (
                error.code === 22 || error.code === 1014 ||
                error.name === 'QuotaExceededError' ||
                error.name === 'NS_ERROR_DOM_QUOTA_REACHED'
            );
            const msg = isQuotaError
                ? '⚠ ストレージ容量が不足しています。緊急エクスポートを実行します…'
                : '⚠ 自動保存に失敗しました。緊急エクスポートを実行します…';
            Banner.show(msg);
            this._emergencyExport();
        }
    }

    /** 作品インデックスを読み込む */
    _loadWorkIndex() {
        try {
            const raw = localStorage.getItem(WORK_INDEX_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
    }

    /** 作品インデックスを保存する */
    _saveWorkIndex(index) {
        try {
            localStorage.setItem(WORK_INDEX_KEY, JSON.stringify(index));
        } catch (_) {
            Toast.show('⚠ 作品一覧の保存に失敗しました');
        }
    }

    /** 指定IDの作品インデックスエントリを更新（なければ追加）する */
    _updateWorkIndex(id, partial) {
        const index = this._loadWorkIndex();
        const entry = index.find(w => w.id === id);
        if (entry) {
            Object.assign(entry, partial);
        } else {
            index.push({ id, title: this._state.workTitle || '（無題）', lastModified: new Date().toISOString(), ...partial });
        }
        this._saveWorkIndex(index);
        WorkSwitcherUI.render();
    }

    /** 即時保存（作品切り替え前に呼ぶ）。silent=trueのときToastを表示しない */
    _saveNow(silent = true) {
        clearTimeout(this._saveTimer);
        this._persist(silent);
    }

    getCurrentWorkId() { return this._currentWorkId; }

    /** 初回起動時の作品初期化。app.js の initialize() から呼ぶ */
    initNewWork(id, initialState) {
        this._currentWorkId = id;
        this._state = initialState;
        this._dirty = false;
        this._updateWorkIndex(id, { title: '（無題）', lastModified: new Date().toISOString() });
        localStorage.setItem(WORK_DATA_KEY(id), JSON.stringify(initialState));
    }


    _emergencyExport() {
        try {
            const data     = this._emergencyBuffer || this._state;
            const rawTitle = data.workTitle || '緊急退避';
            const safeTitle = sanitizeFilename(rawTitle, '緊急退避');
            const filename = `${safeTitle}_emergency_${Date.now()}.json`;
            const exportData = { schemaVersion: SCHEMA_VERSION, ...data };
            const blob   = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
            const url    = URL.createObjectURL(blob);
            const anchor = document.createElement('a');
            anchor.href = url; anchor.download = filename;
            document.body.appendChild(anchor);
            anchor.click();
            document.body.removeChild(anchor);
            URL.revokeObjectURL(url);
            Banner.show('⚠ 自動保存失敗 — データを緊急エクスポートしました。ファイルを確認してください。');
        } catch (_exportError) {
            Banner.show('⚠ 自動保存・緊急エクスポートともに失敗。今すぐ「💾 保存」ボタンでデータを手動保存してください！');
        }
    }

    /**
     * V-03根本解決: 一元化されたdispatchエントリポイント。
     * FieldBuilderなど外部コンポーネントはこれを通じてのみ状態を変更する。
     * 「ユーザー入力 → dispatch → State更新 → 未保存インジケーターON → 自動保存スケジュール」
     * という一方通行フローを保証する。
     *
     * @param {'UPDATE_PERSON'|'UPDATE_RELATION'|'UPDATE_EPISODE'|'UPDATE_STORY_META'|'UPDATE_WORK_TITLE'|'CREATE_NEW_WORK'|'SWITCH_WORK'|'DELETE_WORK'|'DUPLICATE_WORK'|'IMPORT_FILE'} action
     * @param {Object} payload
     */
    dispatch(action, payload) {
        switch (action) {
            case 'UPDATE_PERSON':        this._handleUpdatePerson(payload);     break;
            case 'UPDATE_RELATION':      this._handleUpdateRelation(payload);   break;
            case 'UPDATE_EPISODE':       this._handleUpdateEpisode(payload);    break;
            case 'UPDATE_STORY_META':    this._handleUpdateStoryMeta(payload);  break;
            case 'UPDATE_WORK_TITLE':    this._handleUpdateWorkTitle(payload);  break;
            case 'CREATE_NEW_WORK':      this._handleCreateNewWork();           break;
            case 'SWITCH_WORK':          this._handleSwitchWork(payload);       break;
            case 'DELETE_WORK':          this._handleDeleteWork();              break;
            case 'DUPLICATE_WORK':       this._handleDuplicateWork();           break;
            case 'IMPORT_FILE':          this._handleImportFile(payload);       break;
            default:
                console.log(`[dispatch] 未知のアクション: ${action}`);
        }
    }

    _handleUpdatePerson({ id, key, value }) {
        this.updatePerson(id, { [key]: value });
    }

    _handleUpdateRelation({ id, key, value }) {
        this.updateRelation(id, { [key]: value });
    }

    _handleUpdateEpisode({ id, key, value }) {
        this.updateEpisode(id, { [key]: key === 'tags' ? normalizeTags(value) : value });
    }

    _handleUpdateStoryMeta({ key, value }) {
        const storyMeta = { ...this._state.storyMeta, [key]: value };
        this.update({ storyMeta });
    }

    _handleUpdateWorkTitle({ value }) {
        this.update({ workTitle: value });
        if (this._currentWorkId) {
            this._updateWorkIndex(this._currentWorkId, { title: value });
        }
    }

    _handleCreateNewWork() {
        this._saveNow();
        const newId    = generateId();
        const newState = createInitialState();
        this._currentWorkId = newId;
        this._state = newState;
        this._dirty = false;
        this._updateWorkIndex(newId, { title: '（無題）', lastModified: new Date().toISOString() });
        localStorage.setItem(WORK_DATA_KEY(newId), JSON.stringify(newState));
        document.getElementById('js-work-title').value = '';
        AppState.select(null);
        SidebarRenderer.renderAll();
        EditorRenderer.renderEmpty();
        WorkSwitcherUI.render();
        Toast.show('新しい作品を作成しました');
    }

    _handleSwitchWork(payload) {
        const targetId    = payload.targetId;
        const silentSwitch = payload.silent === true; // BUG-03対応: DELETE_WORK時にToast抑制
        if (targetId === this._currentWorkId) return;
        this._saveNow();
        try {
            const raw = localStorage.getItem(WORK_DATA_KEY(targetId));
            let newState;
            if (raw) {
                const parsed   = JSON.parse(raw);
                const migrated = typeof migrateToLatest === 'function' ? migrateToLatest(parsed) : parsed;
                if (typeof validateMigratedState === 'function') {
                    const warns = validateMigratedState(migrated);
                    if (warns.length > 0) {
                        Toast.show(`⚠ データ構造に問題が検出されました: ${warns[0]}${warns.length > 1 ? `（他 ${warns.length - 1} 件）` : ''}`);
                    }
                }
                newState = validateImportedState(migrated);
            } else {
                newState = createInitialState();
            }
            this._currentWorkId = targetId;
            this._state = newState;
            this._dirty = false;
            this._markClean();
            this._subscribers.forEach(fn => fn(this._state));
            document.getElementById('js-work-title').value = newState.workTitle || '';
            AppState.select(null);
            SidebarRenderer.renderAll();
            EditorRenderer.renderEmpty();
            WorkSwitcherUI.render();
            if (!silentSwitch) Toast.show('作品を切り替えました');
            // S-08: 作品切り替え時に検索語・フィルターをクリア
            if (typeof SearchUI !== 'undefined') SearchUI.clear();
            if (typeof SidebarFilter !== 'undefined') SidebarFilter.reset();
            // I-02: 作品切り替え直後の整合性チェック
            if (typeof checkIntegrity !== 'undefined') {
                showIntegrityWarnings(checkIntegrity(this._state));
            }
        } catch (err) {
            Toast.show('作品の切り替えに失敗しました');
            if (typeof Banner !== 'undefined') {
                Banner.show('⚠ 作品データの読み込みまたはマイグレーションに失敗しました。最新のバックアップやエクスポート済みファイルからの復元を検討してください。');
            }
            console.error(err);
        }
    }

    _handleDeleteWork() {
        const index = this._loadWorkIndex();
        if (index.length <= 1) {
            Toast.show('最後の作品は削除できません');
            return;
        }
        const title = this._state.workTitle || '（無題）';
        if (!confirm(`「${title}」を削除します。この操作は取り消せません。\n本当に削除しますか？`)) return;
        const delId = this._currentWorkId;
        const remaining = index.filter(w => w.id !== delId);
        this._saveWorkIndex(remaining);
        localStorage.removeItem(WORK_DATA_KEY(delId));
        const nextId = remaining[0].id;
        this._currentWorkId = null; // 一時的にnullにしてSWITCH_WORKを呼ぶ
        this.dispatch('SWITCH_WORK', { targetId: nextId, silent: true });
        Toast.show('作品を削除しました');
    }

    _handleDuplicateWork() {
        this._saveNow();
        const srcState = structuredClone
            ? structuredClone(this._state)
            : JSON.parse(JSON.stringify(this._state));
        const newId    = generateId();
        const dupTitle = (srcState.workTitle || '（無題）') + ' のコピー';
        srcState.workTitle = dupTitle;
        this._currentWorkId = newId;
        this._state = srcState;
        this._dirty = false;
        this._updateWorkIndex(newId, { title: dupTitle, lastModified: new Date().toISOString() });
        localStorage.setItem(WORK_DATA_KEY(newId), JSON.stringify(srcState));
        document.getElementById('js-work-title').value = dupTitle;
        AppState.select(null);
        SidebarRenderer.renderAll();
        EditorRenderer.renderEmpty();
        WorkSwitcherUI.render();
        Toast.show('作品を複製しました');
    }

    /**
     * IMPORT_FILE: パース済みデータを受け取り、上書き or 新規追加で読み込む
     * @param {{ data: AppState, mode: 'overwrite'|'new', versionNote: string }} payload
     */
    _handleImportFile({ data, mode, versionNote }) {
        if (mode === 'new') {
            const newId = generateId();
            this._saveNow();
            this._currentWorkId = newId;
            this._state = data;
            this._dirty = false;
            this._updateWorkIndex(newId, {
                title: data.workTitle || '（無題）',
                lastModified: new Date().toISOString(),
            });
            localStorage.setItem(WORK_DATA_KEY(newId), JSON.stringify(data));
        } else {
            // 現在作品に上書き
            this._state = data;
            this._dirty = false;
            if (this._currentWorkId) {
                this._updateWorkIndex(this._currentWorkId, {
                    title: data.workTitle || '（無題）',
                    lastModified: new Date().toISOString(),
                });
                localStorage.setItem(WORK_DATA_KEY(this._currentWorkId), JSON.stringify(data));
            }
        }
        this._subscribers.forEach(fn => fn(this._state));
        document.getElementById('js-work-title').value = data.workTitle || '';
        AppState.select(null, null);
        if (typeof SearchUI !== 'undefined') SearchUI.clear();
        SidebarRenderer.renderAll();
        EditorRenderer.renderEmpty();
        WorkSwitcherUI.render();
        const warnings = checkIntegrity(data);
        showIntegrityWarnings(warnings);
        const modeNote = mode === 'new' ? '新規作品として追加' : '上書き';
        Toast.show(`読み込みました（${modeNote}${versionNote ? '・' + versionNote : ''}）`);
    }

    tryRestoreFromLocalStorage() {
        // まず新形式（ME_Setting_Index）を確認
        const index = this._loadWorkIndex();
        if (index.length > 0) {
            // 最終更新が最も新しい作品を自動ロード
            const latest = index.sort((a, b) =>
                new Date(b.lastModified || 0) - new Date(a.lastModified || 0)
            )[0];
            try {
                const raw = localStorage.getItem(WORK_DATA_KEY(latest.id));
                if (raw) {
                    const parsed   = JSON.parse(raw);
                    const migrated = typeof migrateToLatest === 'function'
                        ? migrateToLatest(parsed)
                        : parsed;
                    if (typeof validateMigratedState === 'function') {
                        const warns = validateMigratedState(migrated);
                        if (warns.length > 0) {
                            console.warn('validateMigratedState:', warns);
                        }
                    }
                    const validated = validateImportedState(migrated);
                    this._currentWorkId = latest.id;
                    this.load(validated);
                    return true;
                }
            } catch (error) {
                console.warn('Failed to restore latest work from index:', error);
                if (typeof Banner !== 'undefined') {
                    Banner.show('⚠ 前回の作品データの復元中に問題が発生しました。必要に応じてエクスポート済みJSONからの読み込みを行ってください。');
                }
                // 読み込み失敗時は旧形式フォールバックへ
            }
        }

        // 旧形式（koen-v3-autosave）からの移行
        try {
            const saved = localStorage.getItem(AUTOSAVE_KEY);
            if (!saved) return false;
            const parsed = JSON.parse(saved);
            const hasPersons     = Array.isArray(parsed?.persons);
            const hasProtagonist = parsed?.protagonist !== undefined;
            const hasVersion     = typeof parsed?.schemaVersion === 'number';
            if (!hasPersons && !hasProtagonist && !hasVersion) return false;
            if (confirm('前回の自動保存データを復元しますか？')) {
                try {
                    const migrated = typeof migrateToLatest === 'function'
                        ? migrateToLatest(parsed)
                        : parsed;
                    if (typeof validateMigratedState === 'function') {
                        const warns = validateMigratedState(migrated);
                        if (warns.length > 0) {
                            console.warn('validateMigratedState (autosave):', warns);
                        }
                    }
                    const validated = validateImportedState(migrated);
                    // 旧データを新形式に移行
                    const newId = generateId();
                    this._currentWorkId = newId;
                    this._updateWorkIndex(newId, {
                        title: validated.workTitle || '移行データ',
                        lastModified: new Date().toISOString(),
                    });
                    localStorage.setItem(WORK_DATA_KEY(newId), JSON.stringify(validated));
                    localStorage.removeItem(AUTOSAVE_KEY); // 旧キーを削除
                    this.load(validated);
                } catch (error) {
                    console.warn('Failed to migrate AUTOSAVE data. Loading raw data without migration.', error);
                    if (typeof Banner !== 'undefined') {
                        Banner.show('⚠ 自動保存データのマイグレーションに失敗したため、旧形式のまま読み込みました。必要であれば最新バージョンへの手動移行を検討してください。');
                    }
                    this.load(parsed);
                }
                return true;
            }
        } catch (_) { /* noop */ }
        return false;
    }
}

/* ═══════════════════════════════════════════════════════════
   INITIAL STATE FACTORY
═══════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════
   STORE
   classはhoistされないため、参照するすべてのモジュールより前に宣言する
═══════════════════════════════════════════════════════════ */
const storeManager = new StateManager(createInitialState());

/* ═══════════════════════════════════════════════════════════
   SIDEBAR RENDERER
═══════════════════════════════════════════════════════════ */
