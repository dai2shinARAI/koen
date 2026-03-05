/* ui-dom.js
   DOM・Toast・Banner・Mention・FieldBuilder・ArrayCardBuilder・PersonSelectBuilder
   依存: schema.js, state.js
*/

const DOM = {
    /** タグ作成 + 属性・プロパティ一括設定 */
    create(tag, attrs = {}, children = []) {
        const element = document.createElement(tag);
        Object.entries(attrs).forEach(([key, value]) => {
            if (key === 'className') { element.className = value; }
            else if (key === 'style' && typeof value === 'object') {
                Object.assign(element.style, value);
            } else if (key.startsWith('on') && typeof value === 'function') {
                element.addEventListener(key.slice(2).toLowerCase(), value);
            } else if (key in element) {
                element[key] = value;
            } else {
                element.setAttribute(key, value);
            }
        });
        children.forEach(child => {
            if (typeof child === 'string') element.appendChild(document.createTextNode(child));
            else if (child instanceof Node) element.appendChild(child);
        });
        return element;
    },

    /** 既存要素の子を全消去して再描画 */
    replace(container, ...children) {
        container.innerHTML = '';
        children.forEach(child => container.appendChild(child));
    },
};

/* ═══════════════════════════════════════════════════════════
   TOAST
═══════════════════════════════════════════════════════════ */
const Toast = (() => {
    let hideTimer = null;
    const element = document.getElementById('js-toast');

    const show = (message) => {
        element.textContent = message;
        element.classList.add('toast--visible');
        clearTimeout(hideTimer);
        hideTimer = setTimeout(() => element.classList.remove('toast--visible'), 2000);
    };

    return { show };
})();

/* ═══════════════════════════════════════════════════════════
   WORK SWITCHER UI
   作品セレクトボックスを描画・更新する
═══════════════════════════════════════════════════════════ */
const WorkSwitcherUI = (() => {
    const render = () => {
        const select = document.getElementById('js-work-select');
        if (!select) return;

        let index = [];
        try {
            const raw = localStorage.getItem(WORK_INDEX_KEY);
            index = raw ? JSON.parse(raw) : [];
        } catch (_) { index = []; }

        const currentId = storeManager.getCurrentWorkId();

        select.innerHTML = '';
        if (index.length === 0) {
            const opt = document.createElement('option');
            opt.value = '';
            opt.textContent = '（作品なし）';
            select.appendChild(opt);
            return;
        }

        index
            .sort((a, b) => new Date(b.lastModified || 0) - new Date(a.lastModified || 0))
            .forEach(work => {
                const opt = document.createElement('option');
                opt.value = work.id;
                opt.textContent = work.title || '（無題）';
                opt.selected = work.id === currentId;
                select.appendChild(opt);
            });

        // F-STORAGE: ストレージ使用量を計算してインジケーターを更新
        const storageBar = document.getElementById('js-storage-bar');
        if (storageBar) {
            let totalBytes = 0;
            try {
                for (let i = 0; i < localStorage.length; i++) {
                    const val = localStorage.getItem(localStorage.key(i));
                    totalBytes += val ? val.length * 2 : 0; // UTF-16 換算
                }
            } catch (_) {}
            const limitBytes = 5 * 1024 * 1024;
            const mb  = totalBytes / (1024 * 1024);
            const pct = totalBytes / limitBytes;
            const cls = pct >= 0.95 ? 'storage-bar--danger'
                      : pct >= 0.80 ? 'storage-bar--warning' : '';
            storageBar.textContent = `ストレージ: ${mb.toFixed(1)} MB / 推定上限 5 MB`;
            storageBar.className = 'storage-bar' + (cls ? ` ${cls}` : '');
        }
    };

    return { render };
})();

/* ═══════════════════════════════════════════════════════════
   BANNER
   - localStorage失敗など重大なエラーを永続表示
═══════════════════════════════════════════════════════════ */
const Banner = (() => {
    let element = null;

    const getOrCreate = () => {
        if (element) return element;
        element = document.createElement('div');
        element.id = 'js-banner';
        element.style.cssText = [
            'position:fixed', 'top:48px', 'left:0', 'right:0',
            'background:#8b2635', 'color:#fff', 'padding:8px 16px',
            'font-size:13px', 'text-align:center', 'z-index:9999',
            'display:none', 'gap:12px', 'align-items:center', 'justify-content:center',
        ].join(';');
        const closeBtn = document.createElement('button');
        closeBtn.textContent = '✕';
        closeBtn.style.cssText = 'background:none;border:none;color:inherit;cursor:pointer;font-size:14px;padding:0 4px;';
        closeBtn.onclick = hide;
        element.appendChild(closeBtn);
        document.body.appendChild(element);
        return element;
    };

    const show = (message) => {
        const el = getOrCreate();
        const existingText = el.querySelector('span');
        if (existingText) {
            existingText.textContent = message;
        } else {
            const span = document.createElement('span');
            span.textContent = message;
            el.insertBefore(span, el.firstChild);
        }
        el.style.display = 'flex';
    };

    const hide = () => {
        if (element) element.style.display = 'none';
    };

    return { show, hide };
})();


const Mention = (() => {
    let popup        = null;
    let currentState = null; // { textarea, atIndex, query }
    let activeIndex  = 0;

    const getPersons = () => storeManager.getState().persons;
    const personDisplayName = (person) => person.name || '（名前なし）';

    const close = () => {
        popup?.remove();
        popup = null;
        currentState = null;
        activeIndex = 0;
    };

    const _buildItems = (filtered) => filtered.map((person, index) => {
        return DOM.create('div', {
            className: 'mention-popup-item',
            'aria-selected': index === 0 ? 'true' : 'false',
            onmousedown: (event) => { event.preventDefault(); insert(person); },
        }, [
            DOM.create('div', {
                className: 'person-avatar',
                style: { width: '22px', height: '22px', fontSize: '11px', background: SidebarRenderer.personColor(person.id) }
            }, [person.name.charAt(0) || '?']),
            DOM.create('div', {}, [
                DOM.create('div', { className: 'mention-popup-item-name' }, [personDisplayName(person)]),
                DOM.create('div', { className: 'mention-popup-item-role'  }, [person.role || '']),
            ]),
        ]);
    });

    const open = (textarea, atIndex, query) => {
        const filtered = getPersons().filter(person =>
            !query || person.name.includes(query)
        );

        if (!filtered.length) { close(); return; }

        // 同じtextareaで既にポップアップが開いている場合は中身だけ更新（animation再実行を防ぐ）
        if (popup && popup.isConnected && currentState?.textarea === textarea) {
            currentState = { textarea, atIndex, query };
            activeIndex  = 0;
            const itemsContainer = popup.querySelector('.mention-popup-items');
            if (itemsContainer) {
                itemsContainer.innerHTML = '';
                _buildItems(filtered).forEach(item => itemsContainer.appendChild(item));
                return;
            }
        }

        // 初回またはtextareaが変わった場合は新規作成
        close();
        currentState = { textarea, atIndex, query };
        activeIndex  = 0;
        const itemsContainer = DOM.create('div', { className: 'mention-popup-items' });
        _buildItems(filtered).forEach(item => itemsContainer.appendChild(item));

        popup = DOM.create('div', { className: 'mention-popup' }, [
            DOM.create('div', { className: 'mention-popup-header' }, ['人物を選択（↑↓ Enter）']),
            itemsContainer,
        ]);

        const rect = textarea.getBoundingClientRect();
        popup.style.top  = `${rect.bottom + 4}px`;
        popup.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
        document.body.appendChild(popup);
    };

    const setActiveIndex = (newIndex) => {
        if (!popup) return;
        const items = popup.querySelectorAll('.mention-popup-item');
        items[activeIndex]?.setAttribute('aria-selected', 'false');
        activeIndex = (newIndex + items.length) % items.length;
        items[activeIndex]?.setAttribute('aria-selected', 'true');
        items[activeIndex]?.scrollIntoView({ block: 'nearest' });
    };

    const confirmSelection = () => {
        if (!popup) return false;
        popup.querySelectorAll('.mention-popup-item')[activeIndex]
            ?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
        return true;
    };

    const insert = (person) => {
        if (!currentState) return;
        const { textarea, atIndex, query } = currentState;
        const tag    = `@[${person.name}|${person.id}]`;
        const before = textarea.value.slice(0, atIndex);
        const after  = textarea.value.slice(atIndex + 1 + query.length);
        textarea.value = before + tag + after;
        const cursorPos = before.length + tag.length;
        textarea.setSelectionRange(cursorPos, cursorPos);
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        close();
        textarea.focus();
    };

    /** textareaにメンション機能を付与（重複アタッチ防止） */
    const attach = (textarea) => {
        if (textarea.dataset.mentionAttached) return;
        textarea.dataset.mentionAttached = '1';

        // AbortController でリスナーを管理（デタッチ時にまとめて解除）
        const controller = new AbortController();
        const { signal } = controller;
        textarea._mentionAbortController = controller;

        textarea.addEventListener('input', () => {
            const position = textarea.selectionStart;
            const textBefore = textarea.value.slice(0, position);
            const atIndex = textBefore.lastIndexOf('@');
            if (atIndex === -1) { close(); return; }
            const query = textBefore.slice(atIndex + 1);
            if (/[\s\n]/.test(query)) { close(); return; }
            open(textarea, atIndex, query);
        }, { signal });

        textarea.addEventListener('keydown', (event) => {
            if (!popup) return;
            switch (event.key) {
                case 'ArrowDown': event.preventDefault(); setActiveIndex(activeIndex + 1); break;
                case 'ArrowUp':   event.preventDefault(); setActiveIndex(activeIndex - 1); break;
                case 'Enter':     if (confirmSelection()) event.preventDefault();           break;
                case 'Escape':    close();                                                  break;
            }
        }, { signal });

        textarea.addEventListener('blur', () => setTimeout(close, 150), { signal });
    };

    return { attach, close };
})();

/* ═══════════════════════════════════════════════════════════
   PERSON POPOVER
   - 右パネルの人物名ホバー時に基本情報を表示する小カード
═══════════════════════════════════════════════════════════ */
const PersonPopover = (() => {
    let popover = null;

    const hide = () => {
        popover?.remove();
        popover = null;
    };

    const show = (person, anchorEl) => {
        hide();
        const rows = [
            person.role       && ['役割', person.role],
            person.age        && ['年齢', person.age],
            person.occupation && ['職業', person.occupation],
            person.personalitySurface && ['性格', person.personalitySurface],
        ].filter(Boolean);

        popover = DOM.create('div', { className: 'person-popover' }, [
            DOM.create('div', { className: 'person-popover-name' }, [person.name || '（名前なし）']),
            ...rows.map(([label, value]) =>
                DOM.create('div', { className: 'person-popover-row' }, [
                    DOM.create('span', { className: 'person-popover-label' }, [label]),
                    DOM.create('span', { className: 'person-popover-value' }, [value]),
                ])
            ),
        ]);

        const rect = anchorEl.getBoundingClientRect();
        popover.style.top  = `${rect.top}px`;
        popover.style.left = `${Math.max(8, rect.left - 228 - 8)}px`;
        document.body.appendChild(popover);
    };

    return { show, hide };
})();

/* ═══════════════════════════════════════════════════════════
   FIELD BUILDER
   - フォームフィールドの生成を一元管理
═══════════════════════════════════════════════════════════ */
const FieldBuilder = {
    /**
     * フィールド定義配列からグリッドを生成。
     * V-03対応: dataObjectへの直接書き込みを廃止。dispatchConfig経由でStateManagerに通知する。
     *
     * @param {Array}    fieldDefs    - { key, label, wide, tall, short }[]
     * @param {Object}   dataObject   - 値の読み取り専用（初期値表示のみに使用）
     * @param {Function} [onChangeCallback] - サイドバー再描画など付随処理（省略可）
     * @param {Object}   [dispatchConfig]   - { action: string, id?: string }
     *   例: { action: 'UPDATE_PERSON', id: person.id }
     *   省略時は後方互換のため直接代入フォールバック（非推奨）
     */
    buildGrid(fieldDefs, dataObject, onChangeCallback = null, dispatchConfig = null) {
        const grid = DOM.create('div', { className: 'field-grid' });
        fieldDefs.forEach(def => {
            grid.appendChild(this.buildField(def, dataObject, onChangeCallback, dispatchConfig));
        });
        return grid;
    },

    /**
     * 単一フィールドを生成する。
     * dispatchConfig が与えられた場合は storeManager.dispatch() 経由で更新し、
     * 直接ミューテーション（V-03脆弱性）を回避する。
     */
    buildField(def, dataObject, onChangeCallback = null, dispatchConfig = null) {
        const isWide     = def.wide  === true;
        const isTextarea = isWide || def.type === 'textarea';
        const wrapper    = DOM.create('div', { className: `field${isWide ? ' field--full' : ''}` });
        const label      = DOM.create('label', {}, [def.label]);
        const input      = isTextarea
            ? DOM.create('textarea', { placeholder: `${def.label}…` })
            : DOM.create('input',    { type: 'text', placeholder: `${def.label}…` });

        if (def.tall  && isTextarea) input.classList.add('textarea--tall');
        if (def.short && isTextarea) input.classList.add('textarea--short');

        input.value = dataObject[def.key] || '';

        input.addEventListener('input', () => {
            if (dispatchConfig) {
                // V-03根本解決: dispatch経由でStateManagerに変更を通知（直接代入を廃止）
                storeManager.dispatch(dispatchConfig.action, {
                    id:    dispatchConfig.id,
                    key:   def.key,
                    value: input.value,
                });
                onChangeCallback?.();
            } else {
                // V-03完結: dispatchConfigなしはArrayCardBuilderのdispatchCallbackパターン
                // 配列エントリへの直接代入 + dispatchCallback通知でStateManagerに伝播
                dataObject[def.key] = input.value;
                onChangeCallback?.(); // ここではdispatchCallbackが渡される
            }
        });

        Mention.attach(input);

        wrapper.appendChild(label);
        wrapper.appendChild(input);
        return wrapper;
    },

    /**
     * セクション（タイトル＋グリッド）を生成する。
     * dispatchConfig を渡すと全フィールドがdispatch経由で更新される。
     */
    buildSection(title, fieldDefs, dataObject, onChangeCallback = null, dispatchConfig = null) {
        const section = DOM.create('div', { className: 'field-section' });
        if (title) {
            section.appendChild(DOM.create('div', { className: 'field-section-title' }, [title]));
        }
        section.appendChild(this.buildGrid(fieldDefs, dataObject, onChangeCallback, dispatchConfig));
        return section;
    },
};

/* ═══════════════════════════════════════════════════════════
   ARRAY CARD BUILDER
   - 配列データ（性的経験・嘘・感情ログ等）のカードUIを生成
═══════════════════════════════════════════════════════════ */
const ArrayCardBuilder = {
    /**
     * 配列データのカードUIを生成する。
     * V-03対応: 配列エントリはIDを持たないため直接ミューテーションが避けられないが、
     * dispatchCallback を呼ぶことで変更後に StateManager へ通知する。
     *
     * @param {Object} config
     * @param {Array}    config.array            - データ配列（参照）
     * @param {string}   config.title            - セクションタイトル
     * @param {string}   config.titleKey         - カードタイトルとして表示するフィールドのキー
     * @param {string}   config.addLabel         - 追加ボタンのラベル
     * @param {Function} config.createEntry      - 新規エントリファクトリ
     * @param {Array}    config.fieldDefs        - フィールド定義
     * @param {Function} config.onUpdate         - 追加・削除後のUI再描画コールバック
     * @param {Function} [config.dispatchCallback] - 配列変更後にStateManagerへ通知するコールバック
     *   例: () => storeManager.dispatch('UPDATE_PERSON', { id: person.id, key: 'sexualHistory', value: [...array] })
     */
    build(config) {
        const { array, title, titleKey, addLabel, createEntry, fieldDefs, onUpdate, dispatchCallback } = config;
        // deepFreeze済みの入力配列からミュータブルな作業コピーを作成する
        const workArray = (array || []).map(e => ({ ...e }));

        const section = DOM.create('div', { className: 'array-section' });
        const header  = DOM.create('div', { className: 'array-header' });
        const titleEl = DOM.create('div', { className: 'array-header-title' }, [title]);
        const addBtn  = DOM.create('button', {
            className: 'array-add-btn',
            onclick: () => {
                workArray.push(createEntry());
                dispatchCallback?.(workArray);
                onUpdate();
            },
        }, [addLabel]);

        header.appendChild(titleEl);
        header.appendChild(addBtn);
        section.appendChild(header);

        const cardsContainer = DOM.create('div', { className: 'array-cards-container' });
        section.appendChild(cardsContainer);

        const renderCards = () => {
            cardsContainer.innerHTML = '';
            workArray.forEach((entry, index) => {
                cardsContainer.appendChild(this._buildCard(entry, index, titleKey, fieldDefs, workArray, onUpdate, renderCards, dispatchCallback));
            });
        };

        renderCards();
        return section;
    },

    _buildCard(entry, index, titleKey, fieldDefs, array, onUpdate, renderCards, dispatchCallback) {
        const card   = DOM.create('div', { className: 'array-card' });
        const header = DOM.create('div', { className: 'array-card-header' });
        const badge  = DOM.create('div', { className: 'array-card-index' }, [String(index + 1)]);

        const titleInput = DOM.create('input', {
            className: 'array-card-title-input',
            placeholder: 'タイトル…',
            value: entry[titleKey] || '',
        });
        titleInput.addEventListener('input', () => {
            // entry はミュータブルなコピー（workArray の要素）なので直接更新できる
            entry[titleKey] = titleInput.value;
            dispatchCallback?.(array);
        });

        const deleteBtn = DOM.create('button', {
            className: 'array-card-del-btn',
            'aria-label': '削除',
            onclick: () => {
                if (!confirm('削除しますか？')) return;
                array.splice(index, 1);
                dispatchCallback?.(array);
                onUpdate();
                if (renderCards) renderCards();
            },
        }, ['×']);

        header.appendChild(badge);
        header.appendChild(titleInput);
        header.appendChild(deleteBtn);

        const body = DOM.create('div', { className: 'array-card-body' });
        // フィールド変更時は entry（ミュータブルコピー）を直接更新し、array ごと dispatch する
        fieldDefs.forEach(def => {
            const field = FieldBuilder.buildField(def, entry, () => dispatchCallback?.(array));
            body.appendChild(field);
        });

        card.appendChild(header);
        card.appendChild(body);
        return card;
    },
};

/* ═══════════════════════════════════════════════════════════
   SHARED HELPERS
═══════════════════════════════════════════════════════════ */
/** 人物IDから名前を返す共通ヘルパー */
const personNameById = (persons, id) => persons.find(p => p.id === id)?.name || '（不明）';

/* ═══════════════════════════════════════════════════════════
   PERSON SELECT BUILDER
   - 人物選択セレクト・チップUIを生成
═══════════════════════════════════════════════════════════ */
const PersonSelectBuilder = {
    /** シングルセレクト（関係の人物A・Bなど） */
    buildSingle(currentId, onChange) {
        const { persons } = storeManager.getState();
        const select = DOM.create('select', {
            className: 'person-select-dropdown',
        });
        const blankOption = DOM.create('option', { value: '' }, ['人物を選択…']);
        select.appendChild(blankOption);
        persons.forEach(person => {
            const option = DOM.create('option', {
                value: person.id,
                selected: person.id === currentId,
            }, [person.name || `（id: ${person.id}）`]);
            select.appendChild(option);
        });
        select.addEventListener('change', () => onChange(select.value));
        return select;
    },

    /** マルチセレクト（エピソード登場人物など） */
    buildMulti(currentIds, onChange, chipClass = '') {
        // BUG-05: state内配列の直接ミューテーション防止のため、内部作業用コピーを持つ
        let _ids = [...currentIds];
        const container    = DOM.create('div', { className: 'person-select-container' });
        const chipsWrapper = DOM.create('div', { className: 'chips-container' });
        container.appendChild(chipsWrapper);

        const rebuild = () => {
            const existingSelect = container.querySelector('select');
            if (existingSelect) container.removeChild(existingSelect);
            chipsWrapper.innerHTML = '';

            const { persons } = storeManager.getState();
            const usedIds = new Set(_ids);

            const select = DOM.create('select', { className: 'person-select-dropdown' });
            select.appendChild(DOM.create('option', { value: '' }, ['人物を追加…']));
            persons
                .filter(person => !usedIds.has(person.id))
                .forEach(person => {
                    select.appendChild(DOM.create('option', { value: person.id }, [
                        person.name || `（id: ${person.id}）`,
                    ]));
                });

            select.addEventListener('change', () => {
                if (!select.value) return;
                _ids = [..._ids, select.value];
                onChange([..._ids]);
                rebuild();
                select.value = '';
            });

            _ids.forEach(personId => {
                const person = persons.find(p => p.id === personId);
                if (!person) return;
                const chip = DOM.create('span', {
                    className: `chip${chipClass ? ` ${chipClass}` : ''}`,
                }, [
                    person.name || personId,
                    DOM.create('button', {
                        className: 'chip-remove-btn',
                        'aria-label': `${person.name}を削除`,
                        onclick: () => {
                            _ids = _ids.filter(id => id !== personId);
                            onChange([..._ids]);
                            rebuild();
                        },
                    }, ['×']),
                ]);
                chipsWrapper.appendChild(chip);
            });

            container.insertBefore(select, chipsWrapper);
        };

        rebuild();
        return container;
    },

    /** 関係マルチセレクト（エピソード関連関係など） */
    buildRelationMulti(currentIds, onChange) {
        // BUG-05: state内配列の直接ミューテーション防止のため、内部作業用コピーを持つ
        let _ids = [...currentIds];
        const container    = DOM.create('div', { className: 'person-select-container' });
        const chipsWrapper = DOM.create('div', { className: 'chips-container' });
        container.appendChild(chipsWrapper);

        const rebuild = () => {
            const { persons, relations } = storeManager.getState();
            const usedIds = new Set(_ids);

            const existingSelect = container.querySelector('select');
            if (existingSelect) container.removeChild(existingSelect);
            chipsWrapper.innerHTML = '';

            const select = DOM.create('select', { className: 'person-select-dropdown' });
            select.appendChild(DOM.create('option', { value: '' }, ['関係を追加…']));
            relations
                .filter(relation => !usedIds.has(relation.id))
                .forEach(relation => {
                    const label = `${personNameById(persons, relation.personAId)} ↔ ${personNameById(persons, relation.personBId)}`;
                    select.appendChild(DOM.create('option', { value: relation.id }, [label]));
                });

            select.addEventListener('change', () => {
                if (!select.value) return;
                _ids = [..._ids, select.value];
                onChange([..._ids]);
                rebuild();
            });

            _ids.forEach(relationId => {
                const relation = relations.find(r => r.id === relationId);
                if (!relation) return;
                const label = `${personNameById(persons, relation.personAId)} ↔ ${personNameById(persons, relation.personBId)}`;
                const chip = DOM.create('span', { className: 'chip chip--relation' }, [
                    label,
                    DOM.create('button', {
                        className: 'chip-remove-btn',
                        'aria-label': `${label}を削除`,
                        onclick: () => {
                            _ids = _ids.filter(id => id !== relationId);
                            onChange([..._ids]);
                            rebuild();
                        },
                    }, ['×']),
                ]);
                chipsWrapper.appendChild(chip);
            });

            container.insertBefore(select, chipsWrapper);
        };

        rebuild();
        return container;
    },
};
