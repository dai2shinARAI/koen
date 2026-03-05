/* story-viewer.js
   StoryViewer — 連続本文ビュワー
   依存: state.js, ui-dom.js
*/
'use strict';

const StoryViewer = (() => {
    let _overlay = null;

    const _onKeydown = (e) => {
        if (e.key === 'Escape') close();
    };

    const open = () => {
        if (_overlay) return;

        const state    = storeManager.getState();
        const episodes = state.episodes.filter(ep => ep.text && ep.text.trim() !== '');

        const body = (() => {
            if (episodes.length === 0) {
                return DOM.create('div', { className: 'story-viewer-body' }, [
                    DOM.create('div', { className: 'story-viewer-empty' }, [
                        '本文が入力されているエピソードがありません。\nエピソードの「本文」タブから本文を入力してください。',
                    ]),
                ]);
            }

            const allEpisodes = state.episodes;
            const items = episodes.map(ep => {
                const globalIndex = allEpisodes.indexOf(ep) + 1;
                return DOM.create('div', { className: 'story-viewer-episode' }, [
                    DOM.create('div', { className: 'story-viewer-ep-header' }, [
                        DOM.create('span', { className: 'story-viewer-ep-num' }, [`EP ${globalIndex}`]),
                        DOM.create('span', { className: 'story-viewer-ep-title' }, [ep.title || '（タイトルなし）']),
                    ]),
                    DOM.create('div', { className: 'story-viewer-ep-text' }, [ep.text]),
                ]);
            });

            return DOM.create('div', { className: 'story-viewer-body' }, items);
        })();

        const closeBtn = DOM.create('button', {
            className: 'story-viewer-close',
            'aria-label': '閉じる',
            onclick: close,
        }, ['✕']);

        const dialog = DOM.create('div', {
            className: 'story-viewer-dialog',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-label': '連続本文ビュワー',
        }, [
            DOM.create('div', { className: 'story-viewer-header' }, [
                DOM.create('div', { className: 'story-viewer-title' }, ['Story Viewer']),
                closeBtn,
            ]),
            body,
        ]);

        _overlay = DOM.create('div', {
            className: 'story-viewer-overlay',
            onclick: (e) => { if (e.target === _overlay) close(); },
        }, [dialog]);

        document.body.appendChild(_overlay);
        document.addEventListener('keydown', _onKeydown);
    };

    const close = () => {
        if (!_overlay) return;
        document.body.removeChild(_overlay);
        document.removeEventListener('keydown', _onKeydown);
        _overlay = null;
    };

    return { open, close };
})();
