/* ai-export.js (F-AI)
   AIExportDialog — 設定データを Markdown に変換してクリップボードにコピー
   依存: state.js, ui-dom.js
*/
'use strict';

/* ═══════════════════════════════════════════════════════════
   MARKDOWN BUILDERS
═══════════════════════════════════════════════════════════ */

/** 値が空でない場合のみ "- ラベル: 値\n" を返す */
const _field = (label, value) => {
    if (!value || !String(value).trim()) return '';
    return `- ${label}: ${String(value).trim()}\n`;
};

/** 人物一覧を Markdown 文字列に変換 */
const _buildPersonsMd = (state) => {
    if (!state.persons.length) return '（登場人物はいません）\n';
    let md = '';
    state.persons.forEach(p => {
        const name = p.name || '（名前なし）';
        const role = p.role ? `（${p.role}）` : '';
        const star = p.isProtagonist ? ' ★主人公' : '';
        md += `## ${name}${role}${star}\n\n`;

        // 基本情報
        const basic = [
            _field('読み', p.nameKana),
            _field('通称', p.nickname),
            _field('年齢', p.age),
            _field('性別', p.gender),
            _field('誕生日', p.birthDate),
            _field('出身地', p.birthPlace),
            _field('血液型', p.bloodType),
            _field('職業', p.occupation),
            _field('属性', p.attributes),
        ].join('');
        if (basic) md += basic + '\n';

        // 外見
        const appearance = [
            _field('身長', p.height),
            _field('体重', p.weight),
            _field('スリーサイズ', p.threeSizes),
            _field('髪', p.hair),
            _field('目', p.eyes),
            _field('肌', p.skin),
            _field('体型', p.bodyType),
            _field('外見的特徴', p.features),
            _field('声質', p.voice),
            _field('体臭・香り', p.scent),
        ].join('');
        if (appearance) md += `**【外見】**\n${appearance}\n`;

        // 性格・内面
        const personality = [
            _field('性格（表）', p.personalitySurface),
            _field('性格（内面）', p.personalityCore),
            _field('弱点', p.personalityWeakness),
            _field('強み', p.personalityStrength),
            _field('恋愛スタイル', p.loveStyle),
            _field('嫉妬・執着', p.jealousy),
            _field('母性・庇護欲', p.maternal),
            _field('将来の夢', p.futureDream),
            _field('覚醒・変化の契機', p.awakening),
        ].join('');
        if (personality) md += `**【性格・内面】**\n${personality}\n`;

        // 現在の状況
        const current = [
            _field('基準時点', p.currentReference),
            _field('所属', p.currentAffiliation),
            _field('精神状態', p.currentMental),
            _field('居住環境', p.currentLiving),
            _field('収入', p.income),
            _field('資産', p.assets),
        ].join('');
        if (current) md += `**【現在の状況】**\n${current}\n`;

        // 性的側面
        const sexual = [
            _field('性的側面', p.sexualAspect),
            _field('性的身体的特徴', p.sexualFeatures),
            _field('性癖', p.kink),
            _field('反応パターン', p.reactionPattern),
        ].join('');
        if (sexual) md += `**【性的側面】**\n${sexual}\n`;

        if (p.memo && p.memo.trim()) md += `**【メモ】**\n${p.memo.trim()}\n\n`;

        // 性的経験（未登録の相手分）
        if (p.sexualHistory && p.sexualHistory.length) {
            md += `**【性的経験（${p.sexualHistory.length}件）】**\n`;
            p.sexualHistory.forEach((h, i) => {
                md += `### ${h.partnerName || `経験 ${i + 1}`}\n`;
                md += [
                    _field('関係性', h.relationship),
                    _field('期間', h.period),
                    _field('相手の年齢', h.partnerAge),
                    _field('継続期間', h.duration),
                    _field('行為回数', h.countEstimate),
                    _field('相手の経験', h.partnerVirginity),
                    _field('相手の身体的特徴', h.partnerBody),
                    _field('きっかけ・経緯', h.howItStarted),
                    _field('感情的な性質', h.emotionalTone),
                    _field('詳細メモ', h.details),
                ].join('');
                md += '\n';
            });
        }

        md += '---\n\n';
    });
    return md;
};

/** 関係一覧を Markdown 文字列に変換 */
const _buildRelationsMd = (state) => {
    if (!state.relations.length) return '（関係はありません）\n';
    const personMap = {};
    state.persons.forEach(p => { personMap[p.id] = p.name || '（名前なし）'; });

    let md = '';
    state.relations.forEach(r => {
        const nameA = personMap[r.personAId] || '（不明）';
        const nameB = personMap[r.personBId] || '（不明）';
        md += `## ${nameA} ↔ ${nameB}\n\n`;

        const info = [
            _field('関係性', r.nature),
            _field('開始時期', r.timelineStart),
            _field('終了時期', r.timelineEnd),
            _field('概要', r.summary),
            _field(`${nameA}のその後`, r.aftermathA),
            _field(`${nameB}のその後`, r.aftermathB),
            _field('テーマへの影響', r.themeImpact),
        ].join('');
        if (info) md += info + '\n';

        // 感情変化ログ
        if (r.emotionalLog && r.emotionalLog.length) {
            md += `**【感情変化ログ（${r.emotionalLog.length}件）】**\n`;
            r.emotionalLog.forEach((log, i) => {
                md += `### ログ ${i + 1}\n`;
                md += [
                    _field('時期', log.period),
                    _field('きっかけ', log.trigger),
                    _field(`${nameA}の気持ち`, log.emotionA),
                    _field(`${nameB}の気持ち`, log.emotionB),
                    _field('メモ', log.note),
                ].join('');
                md += '\n';
            });
        }

        // 性的経験
        if (r.sexualHistory && r.sexualHistory.length) {
            md += `**【性的経験（${r.sexualHistory.length}件）】**\n`;
            r.sexualHistory.forEach((h, i) => {
                md += `### 経験 ${i + 1}\n`;
                md += [
                    _field('時期', h.period),
                    _field('回数（概算）', h.countEstimate),
                    _field('場所', h.location),
                    _field('感情的な性質', h.emotionalTone),
                    _field('詳細メモ', h.details),
                ].join('');
                md += '\n';
            });
        }

        // 嘘・秘密
        if (r.lies && r.lies.length) {
            md += `**【嘘・秘密（${r.lies.length}件）】**\n`;
            r.lies.forEach((lie, i) => {
                md += `### ${lie.lieContent || `嘘 ${i + 1}`}\n`;
                md += [
                    _field('実際の真実', lie.truth),
                    _field('嘘の維持方法', lie.howMaintained),
                    _field('嘘をつく理由', lie.reason),
                    _field('内的葛藤', lie.innerConflict),
                ].join('');
                md += '\n';
            });
        }

        if (r.memo && r.memo.trim()) md += `**【メモ】**\n${r.memo.trim()}\n\n`;

        md += '---\n\n';
    });
    return md;
};

/** エピソード一覧を Markdown 文字列に変換 */
const _buildEpisodesMd = (state) => {
    if (!state.episodes.length) return '（エピソードはありません）\n';
    const personMap = {};
    state.persons.forEach(p => { personMap[p.id] = p.name || '（名前なし）'; });
    const relationMap = {};
    state.relations.forEach(r => {
        const nameA = personMap[r.personAId] || '（不明）';
        const nameB = personMap[r.personBId] || '（不明）';
        relationMap[r.id] = `${nameA} ↔ ${nameB}`;
    });

    let md = '';
    state.episodes.forEach((ep, i) => {
        const title = ep.title || '（タイトルなし）';
        const period = ep.period ? `（${ep.period}）` : '';
        md += `## EP ${i + 1}: ${title}${period}\n\n`;

        const info = [
            _field('あらすじ', ep.plot),
            _field('キーモーメント', ep.keyMoments),
            _field('心理的変化', ep.mentalChange),
            _field('テーマ', ep.theme),
        ].join('');
        if (info) md += info + '\n';

        if (ep.characterIds && ep.characterIds.length) {
            const names = ep.characterIds.map(id => personMap[id] || id).join('、');
            md += `- 登場人物: ${names}\n`;
        }
        if (ep.relationIds && ep.relationIds.length) {
            const rels = ep.relationIds.map(id => relationMap[id] || id).join('、');
            md += `- 関係: ${rels}\n`;
        }
        if (ep.memo && ep.memo.trim()) md += `- メモ: ${ep.memo.trim()}\n`;

        if (ep.text && ep.text.trim()) {
            md += `\n**【本文】**\n\n${ep.text.trim()}\n`;
        }

        md += '\n---\n\n';
    });
    return md;
};

/** 全データを Markdown に変換 */
const _buildAllMd = (state) => {
    const title = state.workTitle || '（無題）';
    let md = `# ${title}\n\n`;

    const meta = state.storyMeta || {};
    const metaSection = [
        _field('世界観・舞台', meta.setting),
        _field('作品のトーン', meta.tone),
        _field('全体テーマ', meta.overallTheme),
        _field('将来の展開フック', meta.futureHooks),
    ].join('');
    if (metaSection) md += `## 作品情報\n\n${metaSection}\n---\n\n`;

    md += `# 登場人物\n\n${_buildPersonsMd(state)}`;
    md += `# 関係\n\n${_buildRelationsMd(state)}`;
    md += `# エピソード\n\n${_buildEpisodesMd(state)}`;
    return md;
};

/* ═══════════════════════════════════════════════════════════
   AI EXPORT DIALOG (F-AI)
═══════════════════════════════════════════════════════════ */
const AIExportDialog = (() => {
    const TEMPLATES = [
        { id: 'persons',   label: '人物一覧',     build: (s) => `# ${s.workTitle || '（無題）'} — 登場人物\n\n${_buildPersonsMd(s)}` },
        { id: 'relations', label: '関係図',       build: (s) => `# ${s.workTitle || '（無題）'} — 関係\n\n${_buildRelationsMd(s)}` },
        { id: 'episodes',  label: 'エピソード一覧', build: (s) => `# ${s.workTitle || '（無題）'} — エピソード\n\n${_buildEpisodesMd(s)}` },
        { id: 'all',       label: '全て',          build: _buildAllMd },
    ];

    let _activeTemplateId = 'all';

    const _overlayEl  = () => document.getElementById('js-ai-export-overlay');
    const _textareaEl = () => document.getElementById('js-ai-export-textarea');
    const _countEl    = () => document.getElementById('js-ai-export-count');

    const _updateOutput = () => {
        const state    = storeManager.getState();
        const template = TEMPLATES.find(t => t.id === _activeTemplateId) || TEMPLATES[TEMPLATES.length - 1];
        const md       = template.build(state);

        const ta = _textareaEl();
        if (ta) ta.value = md;

        const countEl = _countEl();
        if (countEl) countEl.textContent = `約 ${md.length.toLocaleString()} 文字`;

        // タブのアクティブ状態を更新
        document.querySelectorAll('.ai-export-tab').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.template === _activeTemplateId);
        });
    };

    const open = () => {
        _overlayEl()?.classList.remove('hidden');
        _updateOutput();
    };

    const close = () => {
        _overlayEl()?.classList.add('hidden');
    };

    const copyToClipboard = () => {
        const ta = _textareaEl();
        if (!ta) return;
        if (navigator.clipboard) {
            navigator.clipboard.writeText(ta.value).then(() => {
                Toast.show('クリップボードにコピーしました');
            }).catch(() => {
                _fallbackCopy(ta);
            });
        } else {
            _fallbackCopy(ta);
        }
    };

    const _fallbackCopy = (ta) => {
        ta.select();
        try {
            document.execCommand('copy');
            Toast.show('クリップボードにコピーしました');
        } catch (_) {
            Toast.show('⚠ コピーに失敗しました。手動でテキストを選択してコピーしてください');
        }
    };

    const init = () => {
        // テンプレートタブのクリック
        document.querySelectorAll('.ai-export-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                _activeTemplateId = btn.dataset.template;
                _updateOutput();
            });
        });

        // コピーボタン
        document.getElementById('js-ai-export-copy')?.addEventListener('click', copyToClipboard);

        // 閉じるボタン
        document.getElementById('js-ai-export-close')?.addEventListener('click', close);

        // オーバーレイ背景クリック
        _overlayEl()?.addEventListener('click', (e) => {
            if (e.target === _overlayEl()) close();
        });

        // ESC キー（キャプチャフェーズで先取り）
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !_overlayEl()?.classList.contains('hidden')) {
                e.stopPropagation();
                close();
            }
        }, { capture: true });
    };

    return { open, close, init };
})();
