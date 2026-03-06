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

function ensureImportedId(id, usedIds) {
    const normalizedId = (typeof id === 'string' ? id.trim() : '');
    if (normalizedId && !usedIds.has(normalizedId)) {
        usedIds.add(normalizedId);
        return normalizedId;
    }
    const newId = generateId();
    usedIds.add(newId);
    return newId;
}

function normalizeImportedStringArray(value) {
    if (!Array.isArray(value)) return [];
    return value
        .filter(item => typeof item === 'string')
        .map(item => item.trim())
        .filter(Boolean);
}

function normalizeImportedObjectArray(value, createEntry) {
    if (!Array.isArray(value)) return [];
    return value
        .filter(item => item && typeof item === 'object' && !Array.isArray(item))
        .map(item => ({ ...createEntry(), ...item }));
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

    const usedIds = new Set();

    const persons = data.persons.map((person, index) => {
        if (!person || typeof person !== 'object' || Array.isArray(person)) {
            throw new Error(`persons[${index}] が不正です`);
        }
        return {
            ...createPerson(),
            ...person,
            id: ensureImportedId(person.id, usedIds),
            sexualHistory: normalizeImportedObjectArray(person.sexualHistory, createSexualHistoryEntry),
            educationHistory: normalizeImportedObjectArray(person.educationHistory, createEducationHistoryEntry),
        };
    });

    const relations = data.relations.map((relation, index) => {
        if (!relation || typeof relation !== 'object' || Array.isArray(relation)) {
            throw new Error(`relations[${index}] が不正です`);
        }
        return {
            ...createRelation('', ''),
            ...relation,
            id: ensureImportedId(relation.id, usedIds),
            personAId: typeof relation.personAId === 'string' ? relation.personAId : '',
            personBId: typeof relation.personBId === 'string' ? relation.personBId : '',
            isOneWay: relation.isOneWay === true,
            sexualHistory: normalizeImportedObjectArray(relation.sexualHistory, createSexualHistoryEntry),
            lies: normalizeImportedObjectArray(relation.lies, createLieEntry),
            emotionalLog: normalizeImportedObjectArray(relation.emotionalLog, createEmotionalLogEntry),
        };
    });

    const episodes = data.episodes.map((episode, index) => {
        if (!episode || typeof episode !== 'object' || Array.isArray(episode)) {
            throw new Error(`episodes[${index}] が不正です`);
        }
        return {
            ...createEpisode(),
            ...episode,
            id: ensureImportedId(episode.id, usedIds),
            tags: normalizeTags(typeof episode.tags === 'string' ? episode.tags : ''),
            characterIds: normalizeImportedStringArray(episode.characterIds),
            relationIds: normalizeImportedStringArray(episode.relationIds),
        };
    });

    const storyMeta = (data.storyMeta && typeof data.storyMeta === 'object' && !Array.isArray(data.storyMeta))
        ? { ...createInitialState().storyMeta, ...data.storyMeta }
        : createInitialState().storyMeta;

    return {
        ...createInitialState(),
        ...data,
        workTitle: typeof data.workTitle === 'string' ? data.workTitle : '',
        persons,
        relations,
        episodes,
        storyMeta,
    };
}
