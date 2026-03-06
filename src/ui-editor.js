/* ui-editor.js
   EditorRenderer・RightPanelRenderer
   依存: schema.js, state.js, ui-dom.js, ui-sidebar.js
*/

const EditorRenderer = {
    renderEmpty() {
        const body = document.getElementById('js-editor-body');
        body.className = 'editor-scroll';
        DOM.replace(body, DOM.create('div', { className: 'empty-state' }, [
            DOM.create('div', { className: 'empty-state-icon'  }, ['✒']),
            DOM.create('div', { className: 'empty-state-title' }, ['物語設定エディタ']),
            DOM.create('div', { className: 'empty-state-hint'  }, [
                '左のサイドバーから人物・関係・エピソードを選択\n＋ボタンで新規追加 ／ Cmd+S で保存',
            ]),
        ]));
        DOM.replace(
            document.getElementById('js-breadcrumb'),
            DOM.create('span', {
                style: { fontFamily: "'IM Fell English', serif", fontStyle: 'italic', color: 'var(--color-text-subtle)' },
            }, ['Select something to begin'])
        );
        DOM.replace(document.getElementById('js-tab-bar'));
    },

    renderPerson(person, activeTabKey) {
        const body    = document.getElementById('js-editor-body');
        body.className = 'editor-scroll fade-in';

        this._setBreadcrumb(
            person.name || '（名前なし）',
            '人物設定',
        );
        this._setTabBar(PERSON_TABS, activeTabKey, 'person', person.id);

        const fragment = document.createDocumentFragment();

        switch (activeTabKey) {
            case 'basic':
                fragment.appendChild(this._buildPersonBasicTab(person));
                break;
            case 'body':
                fragment.appendChild(FieldBuilder.buildSection(null, PERSON_FIELD_DEFS.body, person, null, { action: 'UPDATE_PERSON', id: person.id }));
                break;
            case 'mind':
                fragment.appendChild(FieldBuilder.buildSection(null, PERSON_FIELD_DEFS.mind, person, null, { action: 'UPDATE_PERSON', id: person.id }));
                break;
            case 'sexual':
                fragment.appendChild(FieldBuilder.buildSection(null, PERSON_FIELD_DEFS.sexual, person, null, { action: 'UPDATE_PERSON', id: person.id }));
                fragment.appendChild(this._buildSexualHistoryCards(person));
                break;
            case 'status':
                fragment.appendChild(FieldBuilder.buildSection(null, PERSON_FIELD_DEFS.status, person, null, { action: 'UPDATE_PERSON', id: person.id }));
                break;
            case 'education':
                fragment.appendChild(FieldBuilder.buildSection(null, PERSON_FIELD_DEFS.educationSummary, person, null, { action: 'UPDATE_PERSON', id: person.id }));
                fragment.appendChild(this._buildTimelineSection(person));
                break;
        }

        // F-CHAR-CARD: キャラクターカードを書き出す
        fragment.appendChild(DOM.create('div', { className: 'danger-zone' }, [
            DOM.create('button', {
                className: 'btn',
                onclick: () => PersonCardExporter.export(person),
            }, ['キャラクターカードを書き出す']),
        ]));

        fragment.appendChild(this._buildDangerZone(() => {
            if (!confirm(`「${person.name || 'この人物'}」を削除しますか？関連する関係も削除されます。`)) return;
            UndoStack.push(`「${person.name || '人物'}」を削除`);
            const state = storeManager.getState();
            storeManager.update({
                persons:   state.persons.filter(p => p.id !== person.id),
                relations: state.relations.filter(r =>
                    r.personAId !== person.id && r.personBId !== person.id
                ),
            });
            // BUG-04: 削除後に参照整合性チェックを実行
            showIntegrityWarnings(checkIntegrity(storeManager.getState()));
            AppState.select(null, null);
        }, 'この人物を削除'));

        DOM.replace(body, fragment);
    },

    _buildPersonBasicTab(person) {
        // dispatch経由でサイドバー（人物名）も即時反映
        const section = FieldBuilder.buildSection(null, PERSON_FIELD_DEFS.basic, person, () => {
            SidebarRenderer.renderPersonList(storeManager.getState().persons);
        }, { action: 'UPDATE_PERSON', id: person.id });

        const checkboxRow = DOM.create('div', { className: 'checkbox-row' });
        const checkbox    = DOM.create('input', {
            type: 'checkbox',
            id:   `protagonist-check-${person.id}`,
            checked: person.isProtagonist,
        });
        checkbox.addEventListener('change', () => {
            // isProtagonistもdispatch経由で更新
            storeManager.dispatch('UPDATE_PERSON', { id: person.id, key: 'isProtagonist', value: checkbox.checked });
            SidebarRenderer.renderPersonList(storeManager.getState().persons);
        });
        const label = DOM.create('label', { htmlFor: `protagonist-check-${person.id}` }, [
            'この人物を主人公として扱う',
        ]);
        checkboxRow.appendChild(checkbox);
        checkboxRow.appendChild(label);
        section.appendChild(checkboxRow);
        return section;
    },

    _buildSexualHistoryCards(person) {
        const container = DOM.create('div', {});

        // 登録済みキャラとの経験（Relation.sexualHistory が1件以上あるもの）
        const { relations, persons } = storeManager.getState();
        const relatedWithHistory = relations.filter(r =>
            (r.personAId === person.id || r.personBId === person.id) &&
            r.sexualHistory && r.sexualHistory.length > 0
        );
        if (relatedWithHistory.length > 0) {
            const linkedSection = DOM.create('div', { className: 'array-section' });
            linkedSection.appendChild(DOM.create('div', { className: 'array-header' }, [
                DOM.create('div', { className: 'array-header-title' }, ['登録済みキャラとの経験（関係より）']),
            ]));
            relatedWithHistory.forEach(r => {
                const otherId   = r.personAId === person.id ? r.personBId : r.personAId;
                const otherName = personNameById(persons, otherId);
                const btn = DOM.create('button', {
                    className: 'relation-link-btn',
                    onclick: () => AppState.selectTab('relation', r.id, 'sexual'),
                }, [`${otherName}との経験（${r.sexualHistory.length}件）　→`]);
                linkedSection.appendChild(btn);
            });
            container.appendChild(linkedSection);
        }

        // その他の経験（未登録の相手）
        container.appendChild(ArrayCardBuilder.build({
            array:      person.sexualHistory,
            title:      'その他の経験（未登録の相手）',
            titleKey:   'partnerName',
            addLabel:   '＋ 経験を追加',
            createEntry: createSexualHistoryEntry,
            fieldDefs:  PERSON_FIELD_DEFS.sexualHistoryEntry,
            onUpdate:   () => this.renderPerson(storeManager.getState().persons.find(p => p.id === person.id) || person, AppState.getTabKey()),
            dispatchCallback: (arr) => storeManager.dispatch('UPDATE_PERSON', {
                id: person.id, key: 'sexualHistory', value: arr,
            }),
        }));

        return container;
    },

    _buildTimelineSection(person) {
        const section = DOM.create('div', { className: 'array-section' });
        const header  = DOM.create('div', { className: 'array-header' });
        header.appendChild(DOM.create('div', { className: 'array-header-title' }, ['学歴タイムライン']));

        const addBtn = DOM.create('button', {
            className: 'array-add-btn',
            onclick: () => {
                // 配列更新はStateManager経由で行う（stateの最新を取得して追加）
                const currentPerson = storeManager.getState().persons.find(p => p.id === person.id);
                const updatedHistory = [...(currentPerson?.educationHistory || []), createEducationHistoryEntry()];
                storeManager.dispatch('UPDATE_PERSON', { id: person.id, key: 'educationHistory', value: updatedHistory });
                this.renderPerson(storeManager.getState().persons.find(p => p.id === person.id) || person, AppState.getTabKey());
            },
        }, ['＋ 追加']);
        header.appendChild(addBtn);
        section.appendChild(header);

        // 表示用にstateから最新のpersonを参照
        const currentPerson = storeManager.getState().persons.find(p => p.id === person.id) || person;
        currentPerson.educationHistory.forEach((historyEntry, index) => {
            const row = DOM.create('div', { className: 'timeline-row' });
            const periodInput = DOM.create('input', {
                className: 'timeline-period-input',
                placeholder: '2020-04',
                value: historyEntry.period || '',
            });
            periodInput.addEventListener('input', () => {
                // dispatch経由で配列全体を更新
                const latestPerson = storeManager.getState().persons.find(p => p.id === person.id);
                if (!latestPerson) return;
                const newHistory = latestPerson.educationHistory.map((e, i) =>
                    i === index ? { ...e, period: periodInput.value } : e
                );
                storeManager.dispatch('UPDATE_PERSON', { id: person.id, key: 'educationHistory', value: newHistory });
            });

            const eventInput = DOM.create('input', {
                className: 'timeline-event-input',
                placeholder: '入学・卒業・転機など',
                value: historyEntry.event || '',
            });
            eventInput.addEventListener('input', () => {
                const latestPerson = storeManager.getState().persons.find(p => p.id === person.id);
                if (!latestPerson) return;
                const newHistory = latestPerson.educationHistory.map((e, i) =>
                    i === index ? { ...e, event: eventInput.value } : e
                );
                storeManager.dispatch('UPDATE_PERSON', { id: person.id, key: 'educationHistory', value: newHistory });
            });

            const deleteBtn = DOM.create('button', {
                className: 'timeline-del-btn',
                'aria-label': '削除',
                onclick: () => {
                    const latestPerson = storeManager.getState().persons.find(p => p.id === person.id);
                    if (!latestPerson) return;
                    const newHistory = latestPerson.educationHistory.filter((_, i) => i !== index);
                    storeManager.dispatch('UPDATE_PERSON', { id: person.id, key: 'educationHistory', value: newHistory });
                    this.renderPerson(storeManager.getState().persons.find(p => p.id === person.id) || person, AppState.getTabKey());
                },
            }, ['×']);

            row.appendChild(periodInput);
            row.appendChild(eventInput);
            row.appendChild(deleteBtn);
            section.appendChild(row);
        });

        return section;
    },

    renderRelation(relation, activeTabKey) {
        const body     = document.getElementById('js-editor-body');
        body.className = 'editor-scroll fade-in';
        const { persons } = storeManager.getState();
        const nameA = personNameById(persons, relation.personAId);
        const nameB = personNameById(persons, relation.personBId);
        const arrow = relation.isOneWay ? '→' : '↔';

        this._setBreadcrumb(`${nameA} ${arrow} ${nameB}`, '関係設定');
        this._setTabBar(RELATION_TABS, activeTabKey, 'relation', relation.id);

        const rerender = () => {
            const latest = storeManager.getState().relations.find(r => r.id === relation.id);
            this.renderRelation(latest || relation, AppState.getTabKey());
        };
        const fragment = document.createDocumentFragment();

        switch (activeTabKey) {
            case 'basic':
                fragment.appendChild(this._buildRelationBasicTab(relation, nameA, nameB, rerender));
                break;
            case 'sexual':
                fragment.appendChild(ArrayCardBuilder.build({
                    array:       relation.sexualHistory,
                    title:       'この関係における性的経験',
                    titleKey:    'period',
                    addLabel:    '＋ 追加',
                    createEntry: () => ({ period:'', countEstimate:'', location:'', emotionalTone:'', details:'' }),
                    fieldDefs:   RELATION_FIELD_DEFS.sexualHistoryEntry,
                    onUpdate:    rerender,
                    dispatchCallback: (arr) => storeManager.dispatch('UPDATE_RELATION', {
                        id: relation.id, key: 'sexualHistory', value: arr,
                    }),
                }));
                break;
            case 'lies':
                fragment.appendChild(ArrayCardBuilder.build({
                    array:       relation.lies,
                    title:       '嘘・秘密',
                    titleKey:    'lieContent',
                    addLabel:    '＋ 嘘を追加',
                    createEntry: createLieEntry,
                    fieldDefs:   RELATION_FIELD_DEFS.lieEntry,
                    onUpdate:    rerender,
                    dispatchCallback: (arr) => storeManager.dispatch('UPDATE_RELATION', {
                        id: relation.id, key: 'lies', value: arr,
                    }),
                }));
                break;
            case 'emotions':
                fragment.appendChild(ArrayCardBuilder.build({
                    array:       relation.emotionalLog,
                    title:       '感情変化ログ',
                    titleKey:    'period',
                    addLabel:    '＋ 追加',
                    createEntry: createEmotionalLogEntry,
                    fieldDefs: [
                        { key: 'period',    label: '時期',                        wide: false },
                        { key: 'trigger',   label: 'きっかけ・出来事',            wide: false },
                        { key: 'emotionA',  label: `${nameA}の気持ち`,            wide: true  },
                        { key: 'emotionB',  label: `${nameB}の気持ち`,            wide: true  },
                        { key: 'note',      label: 'メモ',                        wide: true  },
                    ],
                    onUpdate: rerender,
                    dispatchCallback: (arr) => storeManager.dispatch('UPDATE_RELATION', {
                        id: relation.id, key: 'emotionalLog', value: arr,
                    }),
                }));
                break;
        }

        fragment.appendChild(this._buildDangerZone(() => {
            if (!confirm('この関係を削除しますか？')) return;
            UndoStack.push('関係を削除');
            const state = storeManager.getState();
            storeManager.update({ relations: state.relations.filter(r => r.id !== relation.id) });
            // BUG-04: 削除後に参照整合性チェックを実行
            showIntegrityWarnings(checkIntegrity(storeManager.getState()));
            AppState.select(null, null);
        }, 'この関係を削除'));

        DOM.replace(body, fragment);
    },

    _buildRelationBasicTab(relation, nameA, nameB, onUpdate) {
        const fragment = document.createDocumentFragment();

        const arrowLabel = relation.isOneWay ? '→' : '↔';

        const personRow = DOM.create('div', {
            className: 'field-grid field-grid--3col',
            style: { marginBottom: '16px' },
        }, [
            PersonSelectBuilder.buildSingle(relation.personAId, (newId) => {
                // dispatch経由でpersonAIdを更新
                storeManager.dispatch('UPDATE_RELATION', { id: relation.id, key: 'personAId', value: newId });
                SidebarRenderer.renderRelationList(storeManager.getState().relations, storeManager.getState().persons);
                onUpdate();
            }),
            DOM.create('button', {
                type: 'button',
                className: 'relation-direction-toggle',
                style: {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'var(--color-text-subtle)',
                    fontSize: '18px',
                    userSelect: 'none',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                },
                onclick: () => {
                    const latest = storeManager.getState().relations.find(r => r.id === relation.id);
                    const current = latest || relation;
                    storeManager.dispatch('UPDATE_RELATION', {
                        id: relation.id,
                        key: 'isOneWay',
                        value: !current.isOneWay,
                    });
                    SidebarRenderer.renderRelationList(storeManager.getState().relations, storeManager.getState().persons);
                    onUpdate();
                },
                title: 'クリックで双方向／一方通行を切り替え',
            }, [arrowLabel]),
            PersonSelectBuilder.buildSingle(relation.personBId, (newId) => {
                // dispatch経由でpersonBIdを更新
                storeManager.dispatch('UPDATE_RELATION', { id: relation.id, key: 'personBId', value: newId });
                SidebarRenderer.renderRelationList(storeManager.getState().relations, storeManager.getState().persons);
                onUpdate();
            }),
        ]);
        fragment.appendChild(personRow);
        fragment.appendChild(FieldBuilder.buildSection(null, [
            { key: 'nature',        label: '関係の性質',         wide: true  },
            { key: 'timelineStart', label: '開始時期',           wide: false },
            { key: 'timelineEnd',   label: '終了・現在',         wide: false },
            { key: 'summary',       label: '関係の概要',         wide: true, tall: true },
            { key: 'aftermathA',    label: `${nameA}へのその後`, wide: true  },
            { key: 'aftermathB',    label: `${nameB}へのその後`, wide: true  },
            { key: 'themeImpact',   label: 'テーマへの影響',     wide: true  },
            { key: 'memo',          label: 'メモ',               wide: true  },
        ], relation, null, { action: 'UPDATE_RELATION', id: relation.id }));
        return fragment;
    },

    renderEpisode(episode, activeTabKey) {
        const body     = document.getElementById('js-editor-body');
        const episodes = storeManager.getState().episodes;
        const index    = episodes.findIndex(ep => ep.id === episode.id);

        this._setBreadcrumb(`EP ${index + 1}　${episode.title || 'タイトルなし'}`, null);
        this._setTabBar(EPISODE_TABS, activeTabKey, 'episode', episode.id);

        const rerender = () => this.renderEpisode(episode, AppState.getTabKey());

        switch (activeTabKey) {
            case 'plot': {
                body.className = 'editor-scroll fade-in';
                const fragment = document.createDocumentFragment();
                // dispatch経由でエピソードフィールドを更新し、サイドバーも再描画
                fragment.appendChild(FieldBuilder.buildSection(null, EPISODE_FIELD_DEFS.plot, episode, () => {
                    SidebarRenderer.renderStoryList(storeManager.getState().episodes);
                }, { action: 'UPDATE_EPISODE', id: episode.id }));
                fragment.appendChild(this._buildDangerZone(() => {
                    if (!confirm('削除しますか？')) return;
                    UndoStack.push(`「${episode.title || 'エピソード'}」を削除`);
                    const state = storeManager.getState();
                    storeManager.update({ episodes: state.episodes.filter(ep => ep.id !== episode.id) });
                    // BUG-04: 削除後に参照整合性チェックを実行
                    showIntegrityWarnings(checkIntegrity(storeManager.getState()));
                    AppState.select(null, null);
                }, 'このエピソードを削除'));
                DOM.replace(body, fragment);
                break;
            }
            case 'cast': {
                body.className = 'editor-scroll fade-in';
                const fragment = document.createDocumentFragment();

                const charSection = DOM.create('div', { className: 'field-section' });
                charSection.appendChild(DOM.create('div', { className: 'field-section-title' }, ['登場人物']));
                charSection.appendChild(
                    PersonSelectBuilder.buildMulti(episode.characterIds, (ids) => {
                        // dispatch経由でcharacterIdsを更新
                        storeManager.dispatch('UPDATE_EPISODE', { id: episode.id, key: 'characterIds', value: ids });
                    })
                );
                fragment.appendChild(charSection);
                fragment.appendChild(DOM.create('div', { className: 'divider' }));

                const relSection = DOM.create('div', { className: 'field-section' });
                relSection.appendChild(DOM.create('div', { className: 'field-section-title' }, ['関連する関係ライン']));
                relSection.appendChild(
                    PersonSelectBuilder.buildRelationMulti(episode.relationIds, (ids) => {
                        // dispatch経由でrelationIdsを更新
                        storeManager.dispatch('UPDATE_EPISODE', { id: episode.id, key: 'relationIds', value: ids });
                    })
                );
                fragment.appendChild(relSection);
                DOM.replace(body, fragment);
                break;
            }
            case 'writing': {
                body.className = 'editor-scroll editor-scroll--writing fade-in';
                const textarea = DOM.create('textarea', {
                    className: 'writing-textarea',
                    placeholder: 'ここに本文を書いてください…\n\n@を入力すると人物名を挿入できます。',
                    value: episode.text || '',
                });
                const countDisplay = DOM.create('span', {
                    className: 'writing-word-count',
                }, [String((episode.text || '').length)]);

                textarea.addEventListener('input', () => {
                    // dispatch経由でepisode.textを更新
                    storeManager.dispatch('UPDATE_EPISODE', { id: episode.id, key: 'text', value: textarea.value });
                    countDisplay.textContent = String(textarea.value.length);
                });

                Mention.attach(textarea);

                const footer = DOM.create('div', { className: 'writing-footer' }, [
                    countDisplay,
                    DOM.create('span', {}, [' 文字']),
                ]);

                DOM.replace(body, textarea, footer);
                setTimeout(() => textarea.focus(), 50);
                break;
            }
        }
    },

    renderStoryMeta() {
        const body     = document.getElementById('js-editor-body');
        body.className = 'editor-scroll fade-in';
        const storyMeta = storeManager.getState().storyMeta;

        this._setBreadcrumb('作品設定・テーマ', null);
        DOM.replace(document.getElementById('js-tab-bar'));

        // dispatch経由でstoryMetaを更新
        DOM.replace(body, FieldBuilder.buildSection(null, [
            { key: 'setting',       label: '世界観・舞台設定',   wide: true, tall: true },
            { key: 'tone',          label: 'トーン・雰囲気',     wide: false },
            { key: 'overallTheme',  label: '全体テーマ',         wide: true  },
            { key: 'futureHooks',   label: '伏線・今後の展開',   wide: true, tall: true },
        ], storyMeta, null, { action: 'UPDATE_STORY_META' }));
    },

    renderStoryboard() {
        const body = document.getElementById('js-editor-body');
        body.className = 'editor-scroll fade-in';

        this._setBreadcrumb('ストーリーボード', null);
        DOM.replace(document.getElementById('js-tab-bar'));

        const episodes = storeManager.getState().episodes;

        if (episodes.length === 0) {
            DOM.replace(body, DOM.create('div', { className: 'storyboard-empty' }, [
                'エピソードがまだありません。\nサイドバーの ＋ ボタンからエピソードを追加してください。',
            ]));
            return;
        }

        const grid = DOM.create('div', { className: 'storyboard-grid' });

        episodes.forEach((episode, index) => {
            const card = DOM.create('div', {
                className: 'storyboard-card',
                draggable: 'true',
                'data-index': String(index),
                onclick: () => AppState.select('episode', episode.id),
            }, [
                DOM.create('div', { className: 'storyboard-card-header' }, [
                    DOM.create('span', { className: 'storyboard-card-num' }, [`EP ${index + 1}`]),
                    DOM.create('span', { className: 'storyboard-card-title' }, [episode.title || '（タイトルなし）']),
                ]),
                ...(episode.period
                    ? [DOM.create('div', { className: 'storyboard-card-meta' }, [episode.period])]
                    : []),
                ...(episode.plot
                    ? [DOM.create('div', { className: 'storyboard-card-plot' }, [episode.plot])]
                    : []),
            ]);

            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', String(index));
                e.dataTransfer.effectAllowed = 'move';
                card.classList.add('dragging');
            });
            card.addEventListener('dragend', () => card.classList.remove('dragging'));
            card.addEventListener('dragover', (e) => { e.preventDefault(); card.classList.add('drag-over'); });
            card.addEventListener('dragleave', () => card.classList.remove('drag-over'));
            card.addEventListener('drop', (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                if (fromIndex !== index) {
                    storeManager.reorderEpisodes(fromIndex, index);
                    EditorRenderer.renderStoryboard();
                    SidebarRenderer.renderStoryList(storeManager.getState().episodes);
                }
            });

            // F-MOBILE-P3 M3-02: タッチ並び替え
            _attachTouchSort(
                card,
                index,
                () => Array.from(grid.querySelectorAll('.storyboard-card')),
                (from, to) => {
                    storeManager.reorderEpisodes(from, to);
                    SidebarRenderer.renderStoryList(storeManager.getState().episodes);
                },
                () => EditorRenderer.renderStoryboard()
            );

            grid.appendChild(card);
        });

        DOM.replace(body, grid);
    },

    _setBreadcrumb(main, sub) {
        const el = document.getElementById('js-breadcrumb');
        const children = sub
            ? [
                DOM.create('span', { className: 'breadcrumb-main' }, [main]),
                DOM.create('span', { className: 'breadcrumb-sep'  }, ['／']),
                DOM.create('span', {}, [sub]),
              ]
            : [DOM.create('span', { className: 'breadcrumb-main' }, [main])];
        DOM.replace(el, ...children);
    },

    _setTabBar(tabs, activeKey, type, entityId) {
        const tabBar = document.getElementById('js-tab-bar');
        const wrap = document.getElementById('js-tab-bar-wrap');
        DOM.replace(tabBar, ...tabs.map(tab => {
            const button = DOM.create('button', {
                className: 'tab-btn',
                'aria-selected': tab.key === activeKey ? 'true' : 'false',
                onclick: () => AppState.selectTab(type, entityId, tab.key),
            }, [tab.label]);
            return button;
        }));

        /* スクロール位置に応じてフェードヒントを制御 */
        const updateFade = tabBar._updateFadeHandler || (() => {
            if (!wrap) return;
            const atEnd = tabBar.scrollLeft + tabBar.clientWidth >= tabBar.scrollWidth - 2;
            wrap.classList.toggle('scrolled-end', atEnd);
        });
        if (tabBar._updateFadeHandler) {
            tabBar.removeEventListener('scroll', tabBar._updateFadeHandler);
        }
        tabBar._updateFadeHandler = updateFade;
        tabBar.addEventListener('scroll', updateFade, { passive: true });

        /* 選択中タブを画面内にスクロール */
        requestAnimationFrame(() => {
            const active = tabBar.querySelector('[aria-selected="true"]');
            if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
            updateFade();
        });
    },

    _buildDangerZone(onDelete, label) {
        return DOM.create('div', { className: 'danger-zone' }, [
            DOM.create('button', {
                className: 'btn btn--danger',
                onclick: onDelete,
            }, [label]),
        ]);
    },
};

/* ═══════════════════════════════════════════════════════════
   RIGHT PANEL RENDERER
═══════════════════════════════════════════════════════════ */
const RightPanelRenderer = {
    render() {
        const panel     = document.getElementById('js-right-panel');
        const selection = AppState.getSelection();
        if (!selection || selection.type === 'storyMeta' || selection.type === 'storyboard') {
            DOM.replace(panel, DOM.create('div', { className: 'right-panel-empty' }, [
                '選択すると\n関連情報が表示されます',
            ]));
            return;
        }

        const state = storeManager.getState();
        const fragment = document.createDocumentFragment();

        if (selection.type === 'person') {
            this._renderPersonPanel(state, selection.id, fragment);
        } else if (selection.type === 'relation') {
            this._renderRelationPanel(state, selection.id, fragment);
        } else if (selection.type === 'episode') {
            this._renderEpisodePanel(state, selection.id, fragment);
        }

        DOM.replace(panel, fragment);
    },

    _renderPersonPanel(state, personId, fragment) {
        const relatedRelations = state.relations.filter(
            relation => relation.personAId === personId || relation.personBId === personId
        );

        const relationSection = DOM.create('div', { className: 'right-panel-section' });
        relationSection.appendChild(DOM.create('div', { className: 'right-panel-title' }, ['関係ライン']));

        if (relatedRelations.length === 0) {
            relationSection.appendChild(DOM.create('div', {
                className: 'right-panel-empty',
                style: { paddingTop: '8px' },
            }, ['関係がまだありません']));
        } else {
            relatedRelations.forEach(relation => {
                const otherId   = relation.personAId === personId ? relation.personBId : relation.personAId;
                const otherName = personNameById(state.persons, otherId);
                const card      = DOM.create('div', {
                    className: 'relation-card',
                    onclick: () => AppState.select('relation', relation.id),
                }, [
                    DOM.create('div', { className: 'relation-card-names' }, [`↔ ${otherName}`]),
                    DOM.create('div', { className: 'relation-card-nature' }, [relation.nature || '（性質未設定）']),
                    DOM.create('div', { className: 'relation-card-tags' }, [
                        ...(relation.timelineStart
                            ? [DOM.create('span', { className: 'tag tag--episode' }, [relation.timelineStart + '〜'])]
                            : []),
                        ...(relation.sexualHistory.length > 0
                            ? [DOM.create('span', { className: 'tag tag--sexual' }, [`性的 ${relation.sexualHistory.length}`])]
                            : []),
                        ...(relation.lies.length > 0
                            ? [DOM.create('span', { className: 'tag tag--lie' }, [`嘘 ${relation.lies.length}`])]
                            : []),
                    ]),
                ]);
                relationSection.appendChild(card);
            });
        }
        fragment.appendChild(relationSection);

        const episodeSection = DOM.create('div', { className: 'right-panel-section' });
        episodeSection.appendChild(DOM.create('div', { className: 'right-panel-title' }, ['出演エピソード']));
        const appearsIn = state.episodes.filter(ep => ep.characterIds.includes(personId));
        if (appearsIn.length === 0) {
            episodeSection.appendChild(DOM.create('div', { className: 'right-panel-empty', style: { paddingTop: '8px' } }, ['なし']));
        } else {
            appearsIn.forEach(episode => {
                const globalIndex = state.episodes.indexOf(episode) + 1;
                const item = DOM.create('div', {
                    className: 'right-panel-episode-item',
                    onclick: () => AppState.select('episode', episode.id),
                }, [`EP ${globalIndex}　${episode.title || '（タイトルなし）'}`]);
                episodeSection.appendChild(item);
            });
        }
        fragment.appendChild(episodeSection);
    },

    _renderRelationPanel(state, relationId, fragment) {
        const relation = state.relations.find(r => r.id === relationId);
        if (!relation) return;

        const statsSection = DOM.create('div', { className: 'right-panel-section' });
        statsSection.appendChild(DOM.create('div', { className: 'right-panel-title' }, ['サマリー']));

        const stats = [
            ['期間',     [relation.timelineStart, relation.timelineEnd].filter(Boolean).join('〜') || '未設定'],
            ['性的経験', `${relation.sexualHistory.length} 件`],
            ['嘘・秘密', `${relation.lies.length} 件`],
            ['感情ログ', `${relation.emotionalLog.length} 件`],
        ];
        stats.forEach(([label, value]) => {
            statsSection.appendChild(DOM.create('div', { className: 'stat-row' }, [
                DOM.create('span', { className: 'stat-label' }, [label]),
                DOM.create('span', { className: 'stat-value' }, [value]),
            ]));
        });
        fragment.appendChild(statsSection);

        if (relation.lies.length > 0) {
            const liesSection = DOM.create('div', { className: 'right-panel-section' });
            liesSection.appendChild(DOM.create('div', { className: 'right-panel-title' }, ['嘘の一覧']));
            relation.lies.forEach((lie, index) => {
                liesSection.appendChild(DOM.create('div', {
                    style: { padding:'7px 10px', background:'var(--color-purple-pale)',
                             border:'1px solid rgba(123,94,167,0.2)', borderRadius:'6px',
                             marginBottom:'6px', fontSize:'11px',
                             color:'var(--color-text-muted)', cursor:'pointer' },
                    onclick: () => AppState.selectTab('relation', relationId, 'lies'),
                }, [lie.lieContent || `嘘 ${index + 1}`]));
            });
            fragment.appendChild(liesSection);
        }
    },

    _renderEpisodePanel(state, episodeId, fragment) {
        const episode = state.episodes.find(ep => ep.id === episodeId);
        if (!episode) return;

        const statsSection = DOM.create('div', { className: 'right-panel-section' });
        statsSection.appendChild(DOM.create('div', { className: 'right-panel-title' }, ['サマリー']));

        const stats = [
            ['登場人物', `${episode.characterIds.length} 人`],
            ['関係ライン', `${episode.relationIds.length} 件`],
            ['本文',    `${(episode.text || '').length} 文字`],
        ];
        stats.forEach(([label, value]) => {
            statsSection.appendChild(DOM.create('div', { className: 'stat-row' }, [
                DOM.create('span', { className: 'stat-label' }, [label]),
                DOM.create('span', { className: 'stat-value' }, [value]),
            ]));
        });
        fragment.appendChild(statsSection);

        if (episode.characterIds.length > 0) {
            const charSection = DOM.create('div', { className: 'right-panel-section' });
            charSection.appendChild(DOM.create('div', { className: 'right-panel-title' }, ['登場人物']));
            episode.characterIds.forEach(charId => {
                const person = state.persons.find(p => p.id === charId);
                if (!person) return;
                charSection.appendChild(DOM.create('div', {
                    className: 'right-panel-char-name',
                    onmouseenter: (e) => PersonPopover.show(person, e.currentTarget),
                    onmouseleave: () => PersonPopover.hide(),
                    onclick: () => AppState.select('person', person.id),
                }, [person.name || '（名前なし）']));
            });
            fragment.appendChild(charSection);
        }
    },
};

/* ═══════════════════════════════════════════════════════════
   FIELD DEFINITIONS
   - 定義をレンダラーから分離して管理
═══════════════════════════════════════════════════════════ */
