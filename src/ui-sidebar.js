/* ui-sidebar.js
   SidebarRenderer・WorkSwitcherUI・PERSON/RELATION/EPISODE_FIELD_DEFS・AppState・UndoStack
   依存: schema.js, state.js, ui-dom.js
*/

/* ═══════════════════════════════════════════════════════════
   SIDEBAR FILTER（F-FILTER）
   人物リストを役割・属性タグで絞り込む。絞り込み状態はページリロードで初期化。
═══════════════════════════════════════════════════════════ */
const SidebarFilter = (() => {
    'use strict';
    let _role = '';
    let _tag  = '';

    /** persons 配列をフィルタリングして返す */
    const filter = (persons) => {
        if (!_role && !_tag) return persons;
        return persons.filter(p => {
            const roleMatch = !_role || p.role === _role;
            const tagMatch  = !_tag  || (p.attributes || '')
                .split(',').map(t => t.trim()).includes(_tag);
            return roleMatch && tagMatch;
        });
    };

    /**
     * フィルターバーの選択肢を再構築する。
     * 現在のフィルター値がオプションに存在しない場合（作品切り替え後など）はリセット。
     */
    const renderFilterBar = (allPersons) => {
        const bar = document.getElementById('js-person-filter');
        if (!bar) return;

        const roles = [...new Set(allPersons.map(p => p.role).filter(Boolean))];
        const tags  = [...new Set(
            allPersons.flatMap(p =>
                (p.attributes || '').split(',').map(t => t.trim()).filter(Boolean)
            )
        )];

        // フィルター値が存在しないオプションになった場合はリセット
        if (_role && !roles.includes(_role)) _role = '';
        if (_tag  && !tags.includes(_tag))   _tag  = '';

        const roleSelect = bar.querySelector('.filter-select--role');
        const tagSelect  = bar.querySelector('.filter-select--tag');
        if (!roleSelect || !tagSelect) return;

        const rebuild = (sel, options, current, placeholder) => {
            sel.innerHTML = `<option value="">${placeholder}</option>`;
            options.forEach(v => {
                const opt = document.createElement('option');
                opt.value = v;
                opt.textContent = v;
                sel.appendChild(opt);
            });
            sel.value = current;
            sel.classList.toggle('filter-select--active', current !== '');
        };

        rebuild(roleSelect, roles, _role, '役割：すべて');
        rebuild(tagSelect,  tags,  _tag,  'タグ：すべて');

        // 選択肢がひとつもない場合はバーを非表示
        bar.style.display = (roles.length || tags.length) ? 'flex' : 'none';
    };

    const setRole = (v) => {
        _role = v;
        SidebarRenderer.renderPersonList(storeManager.getState().persons);
    };

    const setTag = (v) => {
        _tag = v;
        SidebarRenderer.renderPersonList(storeManager.getState().persons);
    };

    const reset = () => { _role = ''; _tag = ''; };

    return { filter, renderFilterBar, setRole, setTag, reset };
})();

/* ═══════════════════════════════════════════════════════════
   EPISODE FILTER（F-EPISODE-TAG）
   エピソードリストをタグで絞り込む。絞り込み状態はページリロードで初期化。
═══════════════════════════════════════════════════════════ */
const EpisodeFilter = (() => {
    'use strict';
    let _tag = '';

    /** episodes 配列をフィルタリングして返す */
    const filter = (episodes) => {
        if (!_tag) return episodes;
        if (_tag === '\x00notag') return episodes.filter(ep => !(ep.tags || '').trim());
        return episodes.filter(ep =>
            (ep.tags || '').replace(/，/g, ',').split(',').map(t => t.trim()).includes(_tag)
        );
    };

    /**
     * フィルターバーの選択肢を再構築する。
     * 現在のフィルター値がオプションに存在しない場合はリセット。
     */
    const renderFilterBar = (allEpisodes) => {
        const bar = document.getElementById('js-episode-filter');
        if (!bar) return;

        const tagSet = [...new Set(
            allEpisodes.flatMap(ep =>
                (ep.tags || '').replace(/，/g, ',').split(',').map(t => t.trim()).filter(Boolean)
            )
        )].sort((a, b) => a.localeCompare(b, 'ja'));

        const hasNoTag = allEpisodes.some(ep => !(ep.tags || '').trim());

        // フィルター値が存在しないオプションになった場合はリセット
        if (_tag && _tag !== '\x00notag' && !tagSet.includes(_tag)) _tag = '';
        if (_tag === '\x00notag' && !hasNoTag) _tag = '';

        const sel = bar.querySelector('.filter-select--episode-tag');
        if (!sel) return;

        sel.innerHTML = '<option value="">タグ：すべて</option>';
        tagSet.forEach(v => {
            const opt = document.createElement('option');
            opt.value = v; opt.textContent = v;
            sel.appendChild(opt);
        });
        if (hasNoTag) {
            const opt = document.createElement('option');
            opt.value = '\x00notag'; opt.textContent = 'タグなし';
            sel.appendChild(opt);
        }
        sel.value = _tag;
        sel.classList.toggle('filter-select--active', _tag !== '');

        bar.style.display = (tagSet.length || hasNoTag) ? 'flex' : 'none';
    };

    const setTag = (v) => {
        _tag = v;
        SidebarRenderer.renderStoryList(storeManager.getState().episodes);
    };

    const reset = () => { _tag = ''; };

    return { filter, renderFilterBar, setTag, reset };
})();

/* ═══════════════════════════════════════════════════════════
   F-MOBILE フェーズ2: タッチ並び替えヘルパー
   ロングプレス（500ms）→ドラッグ で並び替えを実現する。
   既存のマウスDnD（HTML5 dragstart/drop）と並存。
═══════════════════════════════════════════════════════════ */
function _attachTouchSort(item, index, getSiblings, reorderFn, rerenderFn) {
    'use strict';
    let timer    = null;
    let dragging = false;
    let clone    = null;
    let toIndex  = index;

    item.addEventListener('touchstart', (e) => {
        timer = setTimeout(() => {
            dragging = true;
            toIndex  = index;
            // ドラッグ中のクローンを生成
            clone = item.cloneNode(true);
            const rect = item.getBoundingClientRect();
            clone.style.cssText =
                `position:fixed;z-index:9999;width:${rect.width}px;` +
                `top:${rect.top}px;left:${rect.left}px;` +
                `opacity:0.85;pointer-events:none;` +
                `box-shadow:0 8px 24px rgba(0,0,0,0.6);` +
                `border-radius:var(--radius-md);`;
            document.body.appendChild(clone);
            item.classList.add('dragging');
            if (navigator.vibrate) navigator.vibrate(30);
        }, 500);
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
        if (!dragging) { clearTimeout(timer); return; }
        e.preventDefault();
        const touch = e.touches[0];
        clone.style.top = (touch.clientY - item.offsetHeight / 2) + 'px';
        // タッチ位置からドロップ先インデックスを算出
        let newTo = index;
        getSiblings().forEach((sib) => {
            const sibIdx = parseInt(sib.dataset.index, 10);
            if (isNaN(sibIdx)) return;
            const r = sib.getBoundingClientRect();
            if (touch.clientY > r.top + r.height / 2) newTo = sibIdx;
        });
        toIndex = newTo;
    }, { passive: false });

    const _finish = () => {
        clearTimeout(timer);
        if (!dragging) return;
        dragging = false;
        item.classList.remove('dragging');
        if (clone) { clone.remove(); clone = null; }
        if (index !== toIndex) {
            reorderFn(index, toIndex);
            rerenderFn();
        }
    };
    const _cancel = () => {
        clearTimeout(timer);
        if (!dragging) return;
        dragging = false;
        item.classList.remove('dragging');
        if (clone) { clone.remove(); clone = null; }
    };

    item.addEventListener('touchend',    _finish, { passive: true });
    item.addEventListener('touchcancel', _cancel, { passive: true });
}

const SidebarRenderer = {
    personColor(personId) {
        const persons = storeManager.getState().persons;
        const person = persons.find(p => p.id === personId);
        if (!person) return PERSON_COLORS[0];
        // 主人公は金色で区別
        if (person.isProtagonist) return '#c9a84c';
        // それ以外は UUID ハッシュから固定色（並び替え不変）
        let hash = 0;
        for (let i = 0; i < personId.length; i++) {
            hash = (hash * 31 + personId.charCodeAt(i)) & 0xfffffff;
        }
        return PERSON_COLORS[hash % PERSON_COLORS.length];
    },

    renderAll() {
        const state = storeManager.getState();
        this.renderPersonList(state.persons);
        this.renderRelationList(state.relations, state.persons);
        this.renderStoryList(state.episodes);
    },

    renderPersonList(persons) {
        const list = document.getElementById('js-person-list');
        const countEl = document.getElementById('js-person-count');

        SidebarFilter.renderFilterBar(persons);
        const filtered = SidebarFilter.filter(persons);

        countEl.textContent = filtered.length < persons.length
            ? `${filtered.length}/${persons.length}`
            : persons.length;

        const currentId = AppState.getSelection()?.type === 'person'
            ? AppState.getSelection().id : null;

        DOM.replace(list, ...filtered.map(person =>
            this._buildPersonItem(person, currentId === person.id)
        ));
    },

    _buildPersonItem(person, isActive) {
        const persons = storeManager.getState().persons;
        const index   = persons.findIndex(p => p.id === person.id);
        const item = DOM.create('div', {
            className: 'sidebar-item',
            'aria-selected': isActive ? 'true' : 'false',
            role: 'button',
            tabindex: '0',
            draggable: 'true',
            'data-id': person.id,
            'data-index': String(index),
            onclick: () => AppState.select('person', person.id),
        }, [
            DOM.create('div', {
                className: 'person-avatar',
                style: { background: this.personColor(person.id) },
            }, [person.name?.charAt(0) || '？']),
            DOM.create('div', { className: 'item-info' }, [
                DOM.create('div', { className: 'item-name'}, [person.name || '（名前なし）']),
                DOM.create('div', { className: 'item-sub' }, [person.role || person.occupation || '\u00a0']),
            ]),
            ...(person.isProtagonist
                ? [DOM.create('span', { className: 'protagonist-badge' }, ['主人公'])]
                : []),
            DOM.create('button', {
                className: 'sidebar-delete-btn',
                title: '削除',
                onclick: (e) => {
                    e.stopPropagation();
                    if (!confirm(`「${person.name || 'この人物'}」を削除しますか？関連する関係も削除されます。`)) return;
                    UndoStack.push(`「${person.name || '人物'}」を削除`);
                    const state = storeManager.getState();
                    storeManager.update({
                        persons:   state.persons.filter(p => p.id !== person.id),
                        relations: state.relations.filter(r => r.personAId !== person.id && r.personBId !== person.id),
                    });
                    showIntegrityWarnings(checkIntegrity(storeManager.getState()));
                    if (AppState.getSelection()?.id === person.id) AppState.select(null, null);
                },
            }, ['×']),
        ]);

        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', String(index));
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('dragging');
        });
        item.addEventListener('dragend', () => item.classList.remove('dragging'));
        item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drag-over'); });
        item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('drag-over');
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
            const toIndex   = index;
            if (fromIndex !== toIndex) {
                storeManager.reorderPersons(fromIndex, toIndex);
                SidebarRenderer.renderPersonList(storeManager.getState().persons);
            }
        });
        // F-MOBILE フェーズ2: タッチ並び替え
        _attachTouchSort(
            item, index,
            () => document.querySelectorAll('#js-person-list .sidebar-item'),
            (from, to) => storeManager.reorderPersons(from, to),
            () => SidebarRenderer.renderPersonList(storeManager.getState().persons)
        );
        return item;
    },

    renderRelationList(relations, persons) {
        const list = document.getElementById('js-relation-list');
        const countEl = document.getElementById('js-relation-count');
        countEl.textContent = relations.length;
        const currentId = AppState.getSelection()?.type === 'relation'
            ? AppState.getSelection().id : null;

        const arrowForRelation = (relation) => relation.isOneWay ? '→' : '↔';

        DOM.replace(list, ...relations.map(relation => {
            const item = DOM.create('div', {
                className: 'sidebar-item sidebar-item--relation',
                'aria-selected': currentId === relation.id ? 'true' : 'false',
                role: 'button',
                tabindex: '0',
                onclick: () => AppState.select('relation', relation.id),
            }, [
                DOM.create('div', { className: 'item-info' }, [
                    DOM.create('div', { className: 'item-name' }, [
                        `${personNameById(persons, relation.personAId)} ${arrowForRelation(relation)} ${personNameById(persons, relation.personBId)}`,
                    ]),
                    DOM.create('div', { className: 'item-sub' }, [relation.nature || '\u00a0']),
                ]),
                DOM.create('button', {
                    className: 'sidebar-delete-btn',
                    title: '削除',
                    onclick: (e) => {
                        e.stopPropagation();
                        if (!confirm('この関係を削除しますか？')) return;
                        UndoStack.push('関係を削除');
                        const state = storeManager.getState();
                        storeManager.update({ relations: state.relations.filter(r => r.id !== relation.id) });
                        showIntegrityWarnings(checkIntegrity(storeManager.getState()));
                        if (AppState.getSelection()?.id === relation.id) AppState.select(null, null);
                    },
                }, ['×']),
            ]);
            return item;
        }));
    },

    renderStoryList(episodes) {
        const list = document.getElementById('js-story-list');
        const countEl = document.getElementById('js-episode-count');
        const currentSelection = AppState.getSelection();

        EpisodeFilter.renderFilterBar(episodes);
        const filtered = EpisodeFilter.filter(episodes);

        if (countEl) {
            countEl.textContent = filtered.length < episodes.length
                ? `${filtered.length}/${episodes.length}`
                : (episodes.length || '');
        }

        const storyboardItem = DOM.create('div', {
            className: 'sidebar-item sidebar-item--episode',
            'aria-selected': currentSelection?.type === 'storyboard' ? 'true' : 'false',
            role: 'button',
            onclick: () => AppState.select('storyboard', null),
        }, [DOM.create('div', { className: 'item-info' }, [
            DOM.create('div', { className: 'item-name', style: { color: 'var(--color-text-muted)', fontStyle: 'italic' } }, ['ストーリーボード']),
        ])]);

        const metaItem = DOM.create('div', {
            className: 'sidebar-item sidebar-item--episode',
            'aria-selected': currentSelection?.type === 'storyMeta' ? 'true' : 'false',
            role: 'button',
            onclick: () => AppState.select('storyMeta', null),
        }, [
            DOM.create('div', { className: 'item-info' }, [
                DOM.create('div', {
                    className: 'item-name',
                    style: { color: 'var(--color-text-muted)', fontStyle: 'italic' },
                }, ['作品設定・テーマ']),
            ]),
        ]);

        const episodeItems = filtered.map((episode) => {
            const index = episodes.findIndex(e => e.id === episode.id);
            const item = DOM.create('div', {
                className: 'sidebar-item sidebar-item--episode',
                'aria-selected': currentSelection?.id === episode.id ? 'true' : 'false',
                role: 'button',
                draggable: 'true',
                'data-id': episode.id,
                'data-index': String(index),
                onclick: () => AppState.select('episode', episode.id),
            }, [
                DOM.create('div', { className: 'item-info' }, [
                    DOM.create('div', { className: 'item-name' }, [
                        `EP ${index + 1}　${episode.title || '（タイトルなし）'}`,
                    ]),
                ]),
            ]);

            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', String(index));
                e.dataTransfer.effectAllowed = 'move';
                item.classList.add('dragging');
            });
            item.addEventListener('dragend', () => item.classList.remove('dragging'));
            item.addEventListener('dragover', (e) => { e.preventDefault(); item.classList.add('drag-over'); });
            item.addEventListener('dragleave', () => item.classList.remove('drag-over'));
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                item.classList.remove('drag-over');
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (fromIndex !== index) {
                    storeManager.reorderEpisodes(fromIndex, index);
                    SidebarRenderer.renderStoryList(storeManager.getState().episodes);
                }
            });
            // F-MOBILE フェーズ2: タッチ並び替え
            _attachTouchSort(
                item, index,
                () => document.querySelectorAll('#js-story-list .sidebar-item--episode'),
                (from, to) => storeManager.reorderEpisodes(from, to),
                () => SidebarRenderer.renderStoryList(storeManager.getState().episodes)
            );
            return item;
        });

        DOM.replace(list, storyboardItem, metaItem, ...episodeItems);
    },
};

/* ═══════════════════════════════════════════════════════════
   EDITOR RENDERER（タブ別エディタ）
═══════════════════════════════════════════════════════════ */
const PERSON_FIELD_DEFS = {
    basic: [
        { key:'name',       label:'氏名（漢字）',   wide:false },
        { key:'nameKana',   label:'氏名（カナ）',   wide:false },
        { key:'nickname',   label:'ニックネーム',   wide:false },
        { key:'age',        label:'年齢',           wide:false },
        { key:'birthDate',  label:'生年月日',       wide:false },
        { key:'birthPlace', label:'出身地',         wide:false },
        { key:'bloodType',  label:'血液型',         wide:false },
        { key:'gender',     label:'性別',           wide:false },
        { key:'occupation', label:'職業・身分',     wide:false },
        { key:'role',       label:'役割（例：主人公の恋人）', wide:false },
        { key:'attributes', label:'属性タグ（カンマ区切り）', wide:true },
    ],
    body: [
        { key:'height',    label:'身長',         wide:false },
        { key:'weight',    label:'体重',         wide:false },
        { key:'threeSizes',label:'スリーサイズ', wide:false },
        { key:'hair',      label:'髪型・髪質',   wide:false },
        { key:'eyes',      label:'目・視線',     wide:false },
        { key:'skin',      label:'肌質',         wide:false },
        { key:'bodyType',  label:'体型・全体印象', wide:true },
        { key:'features',  label:'外見的特徴・癖', wide:true },
        { key:'scent',     label:'体臭・香り',   wide:false },
        { key:'voice',     label:'声質・話し方', wide:false },
    ],
    mind: [
        { key:'personalitySurface',  label:'表の性格（他者から見た印象）', wide:true, tall:true },
        { key:'personalityCore',     label:'内面・本質',                   wide:true, tall:true },
        { key:'personalityWeakness', label:'弱点・コンプレックス',         wide:true },
        { key:'personalityStrength', label:'強み・長所',                   wide:true },
        { key:'loveStyle',           label:'恋愛スタイル・執着パターン',   wide:true },
        { key:'maternal',            label:'母性・保護欲',                 wide:false },
        { key:'jealousy',            label:'嫉妬・独占欲',                 wide:false },
        { key:'futureDream',         label:'将来の夢・目標',               wide:true  },
        { key:'awakening',           label:'覚醒・転換点',                 wide:true  },
        { key:'memo',                label:'その他メモ',                   wide:true  },
    ],
    sexual: [
        { key:'sexualAspect',    label:'性的側面・恋愛観（初期）', wide:true, tall:true },
        { key:'sexualFeatures',  label:'自身の身体的な性的特徴',   wide:true },
        { key:'kink',            label:'性癖・好み',               wide:true },
        { key:'reactionPattern', label:'反応パターン・感じ方の特徴', wide:true },
    ],
    sexualHistoryEntry: [
        { key:'relationship',   label:'関係性',               wide:false },
        { key:'period',         label:'期間',                 wide:false },
        { key:'partnerAge',     label:'相手の年齢',           wide:false },
        { key:'duration',       label:'継続期間',             wide:false },
        { key:'countEstimate',  label:'行為回数（概算）',     wide:false },
        { key:'partnerVirginity', label:'相手の経験',         wide:false },
        { key:'partnerBody',    label:'相手の身体的特徴',     wide:true  },
        { key:'howItStarted',   label:'きっかけ・経緯',       wide:true  },
        { key:'emotionalTone',  label:'感情的な性質',         wide:true  },
        { key:'details',        label:'詳細メモ',             wide:true  },
    ],
    status: [
        { key:'currentReference',   label:'基準時点（例：2026年2月）', wide:false },
        { key:'currentAffiliation', label:'所属・在籍先',              wide:true  },
        { key:'currentMental',      label:'現在の精神状態・悩み',      wide:true, tall:true },
        { key:'currentLiving',      label:'居住環境・生活状況',        wide:true  },
        { key:'income',             label:'収入・経済状況',            wide:false },
        { key:'assets',             label:'所有物・財産メモ',          wide:false },
    ],
    educationSummary: [
        { key:'educationSummary', label:'学歴サマリー', wide:true },
    ],
};

const RELATION_FIELD_DEFS = {
    sexualHistoryEntry: [
        { key:'period',         label:'時期',           wide:false },
        { key:'countEstimate',  label:'回数（概算）',   wide:false },
        { key:'location',       label:'場所',           wide:false },
        { key:'emotionalTone',  label:'感情的な性質',   wide:true  },
        { key:'details',        label:'詳細メモ',       wide:true  },
    ],
    lieEntry: [
        { key:'truth',          label:'実際の真実',           wide:true },
        { key:'howMaintained',  label:'嘘の維持方法・セリフ', wide:true },
        { key:'reason',         label:'嘘をつく理由',         wide:true },
        { key:'innerConflict',  label:'内的葛藤・罪悪感',     wide:true },
    ],
};

const EPISODE_FIELD_DEFS = {
    plot: [
        { key:'title',       label:'タイトル',               wide:true  },
        { key:'period',      label:'時期・舞台',             wide:false },
        { key:'tags',        label:'タグ（カンマ区切り）',   wide:true  },
        { key:'plot',        label:'あらすじ・概要',         wide:true, tall:true },
        { key:'keyMoments',  label:'キーモーメント・セリフ', wide:true  },
        { key:'mentalChange',label:'心理的変化',             wide:true  },
        { key:'theme',       label:'このエピソードのテーマ', wide:true  },
        { key:'memo',        label:'メモ',                   wide:true  },
    ],
};

/* ═══════════════════════════════════════════════════════════
   APP STATE（選択状態）
═══════════════════════════════════════════════════════════ */
const AppState = (() => {
    let _selection = null; // { type, id } | null
    let _tabKey    = null; // 現在のタブキー

    const getSelection = () => _selection;
    const getTabKey    = () => _tabKey;

    const getDefaultTabKey = (type) => {
        switch (type) {
            case 'person':     return PERSON_TABS[0].key;
            case 'relation':   return RELATION_TABS[0].key;
            case 'episode':    return EPISODE_TABS[0].key;
            case 'storyboard': return null;
            default:           return null;
        }
    };

    const select = (type, id) => {
        _selection = type ? { type, id } : null;
        _tabKey    = getDefaultTabKey(type);
        _refreshAll();
        // F-MOBILE: アイテム選択時にドロワーを閉じる
        if (typeof MobileDrawer !== 'undefined') MobileDrawer.close();
    };

    const selectTab = (type, id, tabKey) => {
        _selection = { type, id };
        _tabKey    = tabKey;
        _refreshEditor();
        RightPanelRenderer.render();
    };

    const _refreshAll = () => {
        SidebarRenderer.renderAll();
        _refreshEditor();
        RightPanelRenderer.render();
    };

    const _refreshEditor = () => {
        Mention.close();
        if (!_selection) { EditorRenderer.renderEmpty(); return; }

        const state = storeManager.getState();
        switch (_selection.type) {
            case 'person': {
                const person = state.persons.find(p => p.id === _selection.id);
                // 見つからない場合は空状態にフォールバック
                if (person) EditorRenderer.renderPerson(person, _tabKey);
                else { _selection = null; EditorRenderer.renderEmpty(); }
                break;
            }
            case 'relation': {
                const relation = state.relations.find(r => r.id === _selection.id);
                if (relation) EditorRenderer.renderRelation(relation, _tabKey);
                else { _selection = null; EditorRenderer.renderEmpty(); }
                break;
            }
            case 'episode': {
                const episode = state.episodes.find(ep => ep.id === _selection.id);
                if (episode) EditorRenderer.renderEpisode(episode, _tabKey);
                else { _selection = null; EditorRenderer.renderEmpty(); }
                break;
            }
            case 'storyMeta':
                EditorRenderer.renderStoryMeta();
                break;
            case 'storyboard':
                EditorRenderer.renderStoryboard();
                break;
        }
    };

    return { getSelection, getTabKey, select, selectTab };
})();

/* ═══════════════════════════════════════════════════════════
   UNDO STACK
   削除操作専用。最大 MAX_UNDO 件のスナップショットを保持。Cmd+Z で復元。
═══════════════════════════════════════════════════════════ */
const UndoStack = (() => {
    const MAX_UNDO = 20;
    let _stack = [];  // { snapshot, description }[]

    /** 削除前にスナップショットを積む */
    const push = (description) => {
        const snapshot = structuredClone
            ? structuredClone(storeManager.getState())
            : JSON.parse(JSON.stringify(storeManager.getState()));
        _stack.push({ snapshot, description });
        if (_stack.length > MAX_UNDO) _stack.shift();
        _refreshUndoButton();
    };

    /** 最後のスナップショットに戻す */
    const pop = () => {
        if (_stack.length === 0) return;
        const { snapshot, description } = _stack.pop();
        storeManager.load(snapshot);
        AppState.select(null, null);
        Toast.show(`↩ Undo: ${description}`);
        _refreshUndoButton();
    };

    const canUndo = () => _stack.length > 0;

    const _refreshUndoButton = () => {
        const btn = document.getElementById('js-undo-btn');
        if (!btn) return;
        btn.disabled = !canUndo();
        btn.title = canUndo()
            ? `↩ Undo: ${_stack[_stack.length - 1].description}（Cmd+Z）`
            : 'Undo する操作がありません';
    };

    return { push, pop, canUndo };
})();

/* ═══════════════════════════════════════════════════════════
   APP（公開 API）
═══════════════════════════════════════════════════════════ */
