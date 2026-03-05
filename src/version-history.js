/* version-history.js (F-10)
   VersionHistory・VersionHistoryDialog
   依存: state.js, migration.js
*/

const VersionHistory = (() => {
    const MAX_SNAPSHOTS = 20;
    const _key = (workId) => `ME_History_${workId}`;

    /** 指定作品の履歴リストを取得 */
    const load = (workId) => {
        if (!workId) return [];
        try {
            const raw = localStorage.getItem(_key(workId));
            return raw ? JSON.parse(raw) : [];
        } catch (_) { return []; }
    };

    /** 履歴リストを保存 */
    const _save = (workId, snapshots) => {
        try {
            localStorage.setItem(_key(workId), JSON.stringify(snapshots));
        } catch (_) { /* ストレージ満杯時は無視 */ }
    };

    /**
     * 現在の状態をスナップショットとして記録する
     * @param {string} workId
     * @param {object} state - deepFreeze済みの現在状態
     * @param {'auto'|'manual'} kind - 'auto'=自動記録, 'manual'=手動保存時
     * @param {string} [label] - 表示ラベル（省略可）
     */
    const push = (workId, state, kind = 'auto', label = '') => {
        if (!workId) return;
        const snapshots = load(workId);

        // 直前のスナップショットと内容が同一なら記録しない（無駄なスナップショット防止）
        if (snapshots.length > 0) {
            try {
                const last = snapshots[0]; // 最新は先頭
                if (last.stateJson === JSON.stringify(state)) return;
            } catch (_) { /* 比較失敗は無視して記録続行 */ }
        }

        const snapshot = {
            id: generateId(),
            timestamp: new Date().toISOString(),
            kind,
            label,
            stateJson: JSON.stringify(state),
            // プレビュー用サマリー（軽量）
            summary: {
                workTitle: state.workTitle || '（無題）',
                personsCount: (state.persons || []).length,
                relationsCount: (state.relations || []).length,
                episodesCount: (state.episodes || []).length,
                personNames: (state.persons || []).slice(0, 5).map(p => p.name || '（名前なし）'),
            },
        };

        // 先頭に追加し、最大件数を超えたら末尾を削除
        snapshots.unshift(snapshot);
        if (snapshots.length > MAX_SNAPSHOTS) {
            snapshots.splice(MAX_SNAPSHOTS);
        }

        _save(workId, snapshots);
    };

    /**
     * 指定IDのスナップショットを取得して AppState に復元する
     * @param {string} workId
     * @param {string} snapshotId
     */
    const restore = (workId, snapshotId) => {
        const snapshots = load(workId);
        const snapshot = snapshots.find(s => s.id === snapshotId);
        if (!snapshot) { Toast.show('⚠ 対象のスナップショットが見つかりません'); return false; }
        try {
            const data = JSON.parse(snapshot.stateJson);
            const migrated = migrateToLatest(data);
            storeManager.dispatch('IMPORT_FILE', {
                data: migrated,
                mode: 'overwrite',
                versionNote: 'バージョン履歴から復元',
            });
            return true;
        } catch (e) {
            Toast.show('⚠ 復元に失敗しました');
            console.error(e);
            return false;
        }
    };

    /** 指定作品の履歴をすべて削除 */
    const clear = (workId) => {
        if (!workId) return;
        try { localStorage.removeItem(_key(workId)); } catch (_) { /* noop */ }
    };

    /**
     * 指定スナップショットのラベルを更新する
     * @param {string} workId
     * @param {string} snapshotId
     * @param {string} newLabel
     */
    const updateLabel = (workId, snapshotId, newLabel) => {
        const snapshots = load(workId);
        const snap = snapshots.find(s => s.id === snapshotId);
        if (!snap) return false;
        snap.label = newLabel;
        _save(workId, snapshots);
        return true;
    };

    return { load, push, restore, clear, updateLabel };
})();

/* ═══════════════════════════════════════════════════════════
   VERSION HISTORY DIALOG (F-10)
   履歴の表示・選択・復元UI
═══════════════════════════════════════════════════════════ */
const VersionHistoryDialog = (() => {
    let _selectedSnapshotId = null;

    const _overlayEl = () => document.getElementById('js-history-overlay');
    const _listEl    = () => document.getElementById('js-history-list');
    const _previewEl = () => document.getElementById('js-history-preview');
    const _restoreBtn= () => document.getElementById('js-history-restore');

    const _formatDate = (iso) => {
        try {
            const d = new Date(iso);
            const pad = n => String(n).padStart(2, '0');
            const date = `${d.getFullYear()}/${pad(d.getMonth()+1)}/${pad(d.getDate())}`;
            const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
            return `${date} ${time}`;
        } catch (_) { return iso; }
    };

    const _editLabel = (snapshotId, currentLabel, snapshots) => {
        const newLabel = prompt(
            'このスナップショットのラベルを入力してください\n（空欄でラベルを削除）',
            currentLabel
        );
        if (newLabel === null) return; // キャンセル
        const workId = storeManager.getCurrentWorkId();
        const ok = VersionHistory.updateLabel(workId, snapshotId, newLabel.trim());
        if (ok) {
            const snap = snapshots.find(s => s.id === snapshotId);
            if (snap) snap.label = newLabel.trim();
            _renderList(snapshots);
        }
    };

    const _renderList = (snapshots) => {
        const listEl = _listEl();
        if (!listEl) return;

        if (snapshots.length === 0) {
            DOM.replace(listEl, DOM.create('div', { className: 'history-list-empty' }, [
                '履歴がありません\n\n編集するたびに自動記録\nされます',
            ]));
            return;
        }

        const frag = document.createDocumentFragment();
        snapshots.forEach((snap, index) => {
            const isActive = snap.id === _selectedSnapshotId;
            const tagClass = snap.kind === 'manual' ? 'history-item-tag--manual' : 'history-item-tag--auto';
            const tagText  = snap.kind === 'manual' ? '手動保存' : '自動';
            const label = snap.label || snap.summary?.workTitle || '（無題）';

            const labelBtn = DOM.create('button', {
                className: 'history-label-btn',
                title: snap.label ? 'ラベルを変更' : 'ラベルを付ける',
                onclick: (e) => {
                    e.stopPropagation();
                    _editLabel(snap.id, snap.label || '', snapshots);
                },
            }, [snap.label ? '✏ ラベルを変更' : '＋ ラベルを付ける']);

            const item = DOM.create('div', {
                className: `history-item${isActive ? ' active' : ''}`,
                onclick: () => _selectSnapshot(snap.id, snapshots),
            }, [
                DOM.create('div', { className: 'history-item-date' }, [_formatDate(snap.timestamp)]),
                DOM.create('div', { className: 'history-item-desc' }, [label]),
                DOM.create('span', { className: `history-item-tag ${tagClass}` }, [tagText]),
                labelBtn,
            ]);
            if (index === 0) {
                // 最新履歴には「最新」バッジを追加
                item.insertBefore(DOM.create('span', {
                    className: 'history-item-tag',
                    style: { marginLeft: '4px' },
                }, ['最新']), labelBtn);
            }
            frag.appendChild(item);
        });
        DOM.replace(listEl, frag);
    };

    const _renderPreview = (snapshot) => {
        const previewEl = _previewEl();
        if (!previewEl) return;

        if (!snapshot) {
            DOM.replace(previewEl, DOM.create('div', { className: 'history-preview-empty' }, [
                '← 左のリストから\nバージョンを選択',
            ]));
            return;
        }

        const s = snapshot.summary || {};
        const frag = document.createDocumentFragment();

        // 基本情報
        const infoSection = DOM.create('div');
        infoSection.appendChild(DOM.create('div', { className: 'history-preview-section-title' }, ['スナップショット情報']));
        infoSection.appendChild(DOM.create('div', {
            style: { fontSize: '12px', color: 'var(--color-text-muted)', marginBottom: '8px' },
        }, [_formatDate(snapshot.timestamp)]));

        const statsRow = DOM.create('div', { className: 'history-preview-stat' });
        [
            [`人物 ${s.personsCount ?? 0}`],
            [`関係 ${s.relationsCount ?? 0}`],
            [`EP ${s.episodesCount ?? 0}`],
        ].forEach(([text]) => {
            statsRow.appendChild(DOM.create('span', { className: 'history-stat-chip' }, [text]));
        });
        infoSection.appendChild(statsRow);
        frag.appendChild(infoSection);

        // 作品タイトル
        const titleSection = DOM.create('div');
        titleSection.appendChild(DOM.create('div', { className: 'history-preview-section-title' }, ['作品タイトル']));
        titleSection.appendChild(DOM.create('div', {
            style: { fontSize: '13px', color: 'var(--color-gold)', fontWeight: '600' },
        }, [s.workTitle || '（無題）']));
        frag.appendChild(titleSection);

        // 人物名一覧
        if (s.personNames && s.personNames.length > 0) {
            const nameSection = DOM.create('div');
            nameSection.appendChild(DOM.create('div', { className: 'history-preview-section-title' }, ['登場人物（上位5名）']));
            nameSection.appendChild(DOM.create('div', { className: 'history-preview-names' }, [
                s.personNames.join('　/　') + (s.personsCount > 5 ? `　… 他 ${s.personsCount - 5} 名` : ''),
            ]));
            frag.appendChild(nameSection);
        }

        DOM.replace(previewEl, frag);
    };

    const _selectSnapshot = (snapshotId, snapshots) => {
        _selectedSnapshotId = snapshotId;
        const snap = snapshots.find(s => s.id === snapshotId);
        _renderList(snapshots);    // activeクラスを更新
        _renderPreview(snap);
        const restoreBtn = _restoreBtn();
        if (restoreBtn) restoreBtn.disabled = false;
    };

    const open = () => {
        const workId = storeManager.getCurrentWorkId();
        const snapshots = VersionHistory.load(workId);
        _selectedSnapshotId = null;

        _renderList(snapshots);
        _renderPreview(null);
        const restoreBtn = _restoreBtn();
        if (restoreBtn) restoreBtn.disabled = true;

        _overlayEl()?.classList.remove('hidden');
    };

    const close = () => {
        _overlayEl()?.classList.add('hidden');
        _selectedSnapshotId = null;
    };

    const confirmRestore = () => {
        if (!_selectedSnapshotId) return;
        const workId = storeManager.getCurrentWorkId();
        if (!confirm('このバージョンに戻しますか？\n現在の状態は履歴に保存されてから上書きされます。')) return;

        // 復元前に現在の状態を「手動保存」スナップショットとして記録
        const currentState = storeManager.getState();
        VersionHistory.push(workId, currentState, 'manual', '（復元前の状態）');

        const ok = VersionHistory.restore(workId, _selectedSnapshotId);
        if (ok) close();
    };

    const init = () => {
        document.getElementById('js-history-close')?.addEventListener('click', close);
        document.getElementById('js-history-restore')?.addEventListener('click', confirmRestore);

        // オーバーレイ背景クリックで閉じる
        _overlayEl()?.addEventListener('click', (e) => {
            if (e.target === _overlayEl()) close();
        });

        // ESCキー（captureフェーズで先取り）
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !_overlayEl()?.classList.contains('hidden')) {
                e.stopPropagation();
                close();
            }
        }, { capture: true });
    };

    return { open, close, init };
})();

/* ═══════════════════════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════════════════════ */
