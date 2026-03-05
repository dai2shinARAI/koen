/* search.js
   SearchEngine・SearchUI
   依存: state.js, ui-sidebar.js
*/

const SearchEngine = (() => {
    /**
     * Person の検索対象フィールドを結合して返す
     * S-01: 除外フィールド = id, isProtagonist, sexualHistory等の配列内id
     */
    const personSearchText = (person) => {
        const fields = [
            person.name, person.nameKana, person.nickname,
            person.age, person.birthDate, person.birthPlace, person.bloodType, person.gender,
            person.occupation, person.role, person.attributes,
            person.height, person.weight, person.threeSizes,
            person.hair, person.eyes, person.skin, person.bodyType, person.features, person.scent, person.voice,
            person.personalitySurface, person.personalityCore, person.personalityWeakness, person.personalityStrength,
            person.loveStyle, person.maternal, person.jealousy,
            person.futureDream, person.awakening, person.memo,
            person.sexualAspect, person.sexualFeatures, person.kink, person.reactionPattern,
            person.currentReference, person.currentAffiliation, person.currentMental,
            person.currentLiving, person.income, person.assets,
            person.educationSummary,
            ...(person.sexualHistory || []).map(e => [e.partnerName, e.relationship, e.period, e.howItStarted, e.emotionalTone, e.details].filter(Boolean).join(' ')),
            ...(person.educationHistory || []).map(e => [e.period, e.event].filter(Boolean).join(' ')),
        ];
        return fields.filter(Boolean).join(' ');
    };

    /**
     * Relation の検索対象フィールドを結合して返す
     */
    const relationSearchText = (relation, persons) => {
        const nameA = persons.find(p => p.id === relation.personAId)?.name || '';
        const nameB = persons.find(p => p.id === relation.personBId)?.name || '';
        const fields = [
            nameA, nameB,
            relation.nature, relation.timelineStart, relation.timelineEnd,
            relation.summary, relation.aftermathA, relation.aftermathB, relation.themeImpact, relation.memo,
            ...(relation.sexualHistory || []).map(e => [e.partnerName, e.details, e.emotionalTone].filter(Boolean).join(' ')),
            ...(relation.lies || []).map(e => [e.lieContent, e.truth, e.reason, e.innerConflict].filter(Boolean).join(' ')),
            ...(relation.emotionalLog || []).map(e => [e.period, e.trigger, e.emotionA, e.emotionB, e.note].filter(Boolean).join(' ')),
        ];
        return fields.filter(Boolean).join(' ');
    };

    /**
     * Episode の検索対象フィールドを結合して返す
     */
    const episodeSearchText = (episode, persons) => {
        const charNames = (episode.characterIds || [])
            .map(id => persons.find(p => p.id === id)?.name || '')
            .filter(Boolean);
        const fields = [
            episode.title, episode.period,
            episode.plot, episode.keyMoments, episode.mentalChange, episode.theme, episode.memo, episode.text,
            ...charNames,
        ];
        return fields.filter(Boolean).join(' ');
    };

    /**
     * クエリで検索して結果オブジェクトを返す
     * @param {string} query - 検索語（空白トリム済み）
     * @returns {{ persons: Person[], relations: Relation[], episodes: Episode[] }}
     */
    const search = (query) => {
        if (!query) return null;
        const q = query.toLowerCase();
        const state = storeManager.getState();
        const { persons, relations, episodes } = state;

        const matchedPersons = persons.filter(p =>
            personSearchText(p).toLowerCase().includes(q)
        );
        const matchedRelations = relations.filter(r =>
            relationSearchText(r, persons).toLowerCase().includes(q)
        );
        const matchedEpisodes = episodes.filter(e =>
            episodeSearchText(e, persons).toLowerCase().includes(q)
        );

        return { persons: matchedPersons, relations: matchedRelations, episodes: matchedEpisodes };
    };

    return { search };
})();

/* ═══════════════════════════════════════════════════════════
   F-04 検索UI
   検索バーの入力・クリア・結果表示・ハイライトを管理する
═══════════════════════════════════════════════════════════ */
const SearchUI = (() => {
    let _debounceTimer = null;
    const DEBOUNCE_MS = 300; // S-06

    const _inputEl   = () => document.getElementById('js-search-input');
    const _clearBtn  = () => document.getElementById('js-search-clear');
    const _panelEl   = () => document.getElementById('js-search-results');

    const isActive = () => {
        const input = _inputEl();
        return input && input.value.trim().length > 0;
    };

    /** クエリ内の一致箇所を <mark> でラップして返す（XSS安全） */
    const highlight = (text, query) => {
        if (!text || !query) return escapeHtml(text || '');
        const q = query.toLowerCase();
        const t = text;
        const idx = t.toLowerCase().indexOf(q);
        if (idx === -1) return escapeHtml(t);
        return (
            escapeHtml(t.slice(0, idx)) +
            '<mark>' + escapeHtml(t.slice(idx, idx + q.length)) + '</mark>' +
            escapeHtml(t.slice(idx + q.length))
        );
    };

    const escapeHtml = (str) =>
        str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    /** 検索結果パネルを描画する */
    const renderResults = (results, query) => {
        const panel = _panelEl();
        if (!panel) return;
        panel.innerHTML = '';

        const total = results.persons.length + results.relations.length + results.episodes.length;

        // ヘッダー
        const header = document.createElement('div');
        header.className = 'search-results-header';
        header.textContent = total > 0
            ? `${total} 件ヒット`
            : '検索結果';
        panel.appendChild(header);

        if (total === 0) {
            const noResult = document.createElement('div');
            noResult.className = 'search-no-results';
            noResult.textContent = '「' + query + '」に該当する項目がありません';
            panel.appendChild(noResult);
            return;
        }

        const state = storeManager.getState();
        const persons = state.persons;
        const currentSelection = AppState.getSelection();

        // 人物カテゴリ
        if (results.persons.length > 0) {
            const cat = document.createElement('div');
            cat.className = 'search-category';
            const catHeader = document.createElement('div');
            catHeader.className = 'search-category-header';
            catHeader.textContent = `人物 (${results.persons.length})`;
            cat.appendChild(catHeader);

            results.persons.forEach(person => {
                const item = document.createElement('div');
                item.className = 'search-result-item' + (
                    currentSelection?.type === 'person' && currentSelection.id === person.id ? ' active' : ''
                );
                item.innerHTML = `
                    <div class="person-avatar" style="width:22px;height:22px;font-size:11px;background:${SidebarRenderer.personColor(person.id)};border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;">${escapeHtml((person.name || '?').charAt(0))}</div>
                    <div style="flex:1;min-width:0;">
                        <div class="search-result-name">${highlight(person.name || '（名前なし）', query)}</div>
                        ${person.role ? `<div class="search-result-sub">${escapeHtml(person.role)}</div>` : ''}
                    </div>`;
                item.addEventListener('click', () => {
                    AppState.select('person', person.id);
                    item.classList.add('active');
                });
                cat.appendChild(item);
            });
            panel.appendChild(cat);
        }

        // 関係カテゴリ
        if (results.relations.length > 0) {
            const cat = document.createElement('div');
            cat.className = 'search-category';
            const catHeader = document.createElement('div');
            catHeader.className = 'search-category-header';
            catHeader.textContent = `関係 (${results.relations.length})`;
            cat.appendChild(catHeader);

            results.relations.forEach(relation => {
                const nameA = persons.find(p => p.id === relation.personAId)?.name || '?';
                const nameB = persons.find(p => p.id === relation.personBId)?.name || '?';
                const label = `${nameA} ↔ ${nameB}`;
                const item = document.createElement('div');
                item.className = 'search-result-item' + (
                    currentSelection?.type === 'relation' && currentSelection.id === relation.id ? ' active' : ''
                );
                const hiLabel = highlight(nameA, query) + ' ↔ ' + highlight(nameB, query);
                item.innerHTML = `
                    <div style="flex-shrink:0;font-size:14px;opacity:0.5">⇄</div>
                    <div style="flex:1;min-width:0;">
                        <div class="search-result-name">${hiLabel}</div>
                        ${relation.nature ? `<div class="search-result-sub">${escapeHtml(relation.nature)}</div>` : ''}
                    </div>`;
                item.addEventListener('click', () => {
                    AppState.select('relation', relation.id);
                    item.classList.add('active');
                });
                cat.appendChild(item);
            });
            panel.appendChild(cat);
        }

        // エピソードカテゴリ
        if (results.episodes.length > 0) {
            const cat = document.createElement('div');
            cat.className = 'search-category';
            const catHeader = document.createElement('div');
            catHeader.className = 'search-category-header';
            catHeader.textContent = `エピソード (${results.episodes.length})`;
            cat.appendChild(catHeader);

            results.episodes.forEach(episode => {
                const item = document.createElement('div');
                item.className = 'search-result-item' + (
                    currentSelection?.type === 'episode' && currentSelection.id === episode.id ? ' active' : ''
                );
                item.innerHTML = `
                    <div style="flex-shrink:0;font-size:14px;opacity:0.5">✒</div>
                    <div style="flex:1;min-width:0;">
                        <div class="search-result-name">${highlight(episode.title || '（無題）', query)}</div>
                        ${episode.period ? `<div class="search-result-sub">${escapeHtml(episode.period)}</div>` : ''}
                    </div>`;
                item.addEventListener('click', () => {
                    AppState.select('episode', episode.id);
                    item.classList.add('active');
                });
                cat.appendChild(item);
            });
            panel.appendChild(cat);
        }
    };

    /** 検索を実行して結果パネルを表示する */
    const execute = () => {
        const input = _inputEl();
        const panel = _panelEl();
        const clearBtn = _clearBtn();
        if (!input || !panel) return;

        const query = input.value.trim();

        if (!query) {
            panel.classList.add('hidden');
            if (clearBtn) clearBtn.style.display = 'none';
            return;
        }

        if (clearBtn) clearBtn.style.display = 'flex';
        panel.classList.remove('hidden');

        const results = SearchEngine.search(query);
        renderResults(results, query);
    };

    /** 検索をクリアして通常表示に戻る */
    const clear = () => {
        const input = _inputEl();
        const panel = _panelEl();
        const clearBtn = _clearBtn();
        if (input) input.value = '';
        if (clearBtn) clearBtn.style.display = 'none';
        if (panel) panel.classList.add('hidden');
        // S-FIX: パネル非表示後にサイドバーを再描画して元のメニューを確実に復元する
        if (typeof SidebarRenderer !== 'undefined') SidebarRenderer.renderAll();
    };

    /** 検索バーのイベントをアタッチ（初期化時に1回だけ呼ぶ） */
    const init = () => {
        const input = _inputEl();
        const clearBtn = _clearBtn();
        if (!input) return;

        input.addEventListener('input', () => {
            clearTimeout(_debounceTimer);
            _debounceTimer = setTimeout(execute, DEBOUNCE_MS);
        });

        // 即時クリア（デバウンス不要）
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') { clear(); input.blur(); }
        });

        if (clearBtn) {
            clearBtn.addEventListener('click', () => { clear(); input.focus(); });
        }
    };

    return { init, clear, execute, isActive };
})();

/* ═══════════════════════════════════════════════════════════
   VERSION HISTORY (F-10)
   スナップショット方式で最大20件の履歴を保持する
   ストレージキー: ME_History_{workId}
═══════════════════════════════════════════════════════════ */
