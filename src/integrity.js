/* integrity.js
   checkIntegrity・showIntegrityWarnings・validateImportedState
   依存: schema.js, state.js
*/

function checkIntegrity(state) {
    const warnings = [];
    const personIds  = new Set(state.persons.map(p => p.id));
    const relationIds = new Set(state.relations.map(r => r.id));

    // Episode の characterIds / relationIds に孤立IDがないか
    state.episodes.forEach(ep => {
        ep.characterIds.forEach(cid => {
            if (!personIds.has(cid)) {
                warnings.push({
                    type: 'orphan_char',
                    entityId: ep.id,
                    entityTitle: ep.title || '（無題）',
                    message: `エピソード「${ep.title || '無題'}」に存在しない人物ID（${cid.slice(0,8)}…）が含まれています`,
                });
            }
        });
        ep.relationIds.forEach(rid => {
            if (!relationIds.has(rid)) {
                warnings.push({
                    type: 'orphan_rel',
                    entityId: ep.id,
                    entityTitle: ep.title || '（無題）',
                    message: `エピソード「${ep.title || '無題'}」に存在しない関係ID（${rid.slice(0,8)}…）が含まれています`,
                });
            }
        });
    });

    // Relation の personAId / personBId が有効な Person を指しているか
    state.relations.forEach(rel => {
        const nameA = state.persons.find(p => p.id === rel.personAId)?.name;
        const nameB = state.persons.find(p => p.id === rel.personBId)?.name;
        if (rel.personAId && !personIds.has(rel.personAId)) {
            warnings.push({
                type: 'broken_relation',
                entityId: rel.id,
                entityTitle: '関係',
                message: `関係（ID: ${rel.id.slice(0,8)}…）の人物Aが存在しません`,
            });
        }
        if (rel.personBId && !personIds.has(rel.personBId)) {
            warnings.push({
                type: 'broken_relation',
                entityId: rel.id,
                entityTitle: '関係',
                message: `関係（ID: ${rel.id.slice(0,8)}…）の人物Bが存在しません`,
            });
        }
    });

    return warnings;
}

/**
 * 整合性警告を Banner に表示する（警告がなければ Banner を消去）
 * @param {IntegrityWarning[]} warnings
 */
function showIntegrityWarnings(warnings) {
    if (warnings.length === 0) { Banner.hide(); return; }
    const msg = `⚠ 参照整合性の問題が ${warnings.length} 件あります: ${warnings[0].message}${warnings.length > 1 ? `（他${warnings.length - 1}件）` : ''}`;
    Banner.show(msg);
}

/* ═══════════════════════════════════════════════════════════
   IMPORT VALIDATOR
   - インポートデータの構造を検証し、不正なデータでクラッシュしない
═══════════════════════════════════════════════════════════ */
function validateImportedState(data) {
    if (!data || typeof data !== 'object') throw new Error('データ形式が不正です');

    // v3形式の必須フィールドチェック
    if (!Array.isArray(data.persons))   throw new Error('persons フィールドが不正です');
    if (!Array.isArray(data.relations)) throw new Error('relations フィールドが不正です');
    if (!Array.isArray(data.episodes))  throw new Error('episodes フィールドが不正です');

    // IDの重複チェック
    const allIds = [
        ...data.persons.map(p => p.id),
        ...data.relations.map(r => r.id),
        ...data.episodes.map(e => e.id),
    ].filter(Boolean);
    const idSet = new Set(allIds);
    if (idSet.size !== allIds.length) {
        console.warn('インポートデータにID重複があります。続行します。');
    }

    // persons の各要素が最低限の構造を持つことを確認
    data.persons.forEach((p, i) => {
        if (!p || typeof p !== 'object') throw new Error(`persons[${i}] が不正です`);
        if (!p.id) data.persons[i].id = generateId(); // IDがなければ付与
    });

    return data;
}
