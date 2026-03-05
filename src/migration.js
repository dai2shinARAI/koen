/* migration.js
   detectSchemaVersion・migrateFromV38Format・migrateV2toV3・MIGRATIONS・migrateToLatest
   依存: schema.js
*/

function detectSchemaVersion(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('データ形式が不正です（オブジェクトではありません）');
    if (typeof raw.schemaVersion === 'number') return raw.schemaVersion;
    if (Array.isArray(raw.persons))   return 2;   // v3/v3_fixed: schemaVersion フィールドなし
    if (raw.protagonist !== undefined) return 1;   // v38: protagonist フィールドあり
    throw new Error('スキーマバージョンを判定できません。対応するフォーマット: v38形式 または v3形式');
}

/**
 * v2（v3/v3_fixed形式）を v3 にマイグレート
 * 主な作業: schemaVersion の付与 + 欠損フィールドの補完
 * @param {Object} data - v2データ
 * @returns {AppState} v3データ
 */
function migrateV2toV3(data) {
    const base = createInitialState();
    return {
        ...base,
        ...data,
        schemaVersion: 3,
        // 欠損フィールドをデフォルト値で補完
        persons: (data.persons || []).map(p => ({
            ...createPerson(),
            ...p,
            sexualHistory:    Array.isArray(p.sexualHistory)    ? p.sexualHistory    : [],
            educationHistory: Array.isArray(p.educationHistory) ? p.educationHistory : [],
        })),

        relations: (data.relations || []).map(r => ({
            ...createRelation(r.personAId || '', r.personBId || ''),
            ...r,
            sexualHistory: Array.isArray(r.sexualHistory) ? r.sexualHistory : [],
            lies:          Array.isArray(r.lies)          ? r.lies          : [],
            emotionalLog:  Array.isArray(r.emotionalLog)  ? r.emotionalLog  : [],
        })),

        episodes: (data.episodes || []).map(e => ({
            ...createEpisode(),
            ...e,
            characterIds: Array.isArray(e.characterIds) ? e.characterIds : [],
            relationIds:  Array.isArray(e.relationIds)  ? e.relationIds  : [],
        })),
        storyMeta: { ...base.storyMeta, ...(data.storyMeta || {}) },
    };
}

/* ═══════════════════════════════════════════════════════════
   V38 FORMAT MIGRATION
   旧エディタのJSONフォーマットからの移行
═══════════════════════════════════════════════════════════ */
function migrateFromV38Format(oldData) {
    const protagonist  = oldData.protagonist  || {};
    const oldCast      = oldData.cast         || [];
    const oldRelations = oldData.relationship_details || [];
    const oldEpisodes  = oldData.story?.episodes || [];
    const oldLies      = oldData.secrets_and_lies || [];

    const migratedProtagonist = {
        ...createPerson(),
        id:                oldData.protagonist_id || generateId(),
        isProtagonist:     true,
        name:              protagonist.name              || '',
        nameKana:          protagonist.name_kana         || '',
        nickname:          protagonist.nickname          || '',
        age:               protagonist.age               || '',
        birthDate:         protagonist.birth_date        || '',
        birthPlace:        protagonist.birth_place       || '',
        bloodType:         protagonist.blood_type        || '',
        gender:            protagonist.gender            || '',
        occupation:        protagonist.occupation        || '',
        attributes:        protagonist.attributes        || '',
        height:            protagonist.height            || '',
        weight:            protagonist.weight            || '',
        threeSizes:        protagonist.three_sizes       || '',
        hair:              protagonist.hair              || '',
        eyes:              protagonist.eyes              || '',
        skin:              protagonist.skin              || '',
        bodyType:          protagonist.body_type         || '',
        features:          protagonist.features          || '',
        personalitySurface:  protagonist.personality_surface  || '',
        personalityCore:     protagonist.personality_core     || '',
        personalityWeakness: protagonist.personality_weakness || '',
        personalityStrength: protagonist.personality_strength || '',
        sexualAspect:     protagonist.sexual_aspect      || '',
        futureDream:      protagonist.future_dream       || '',
        awakening:        protagonist.awakening || protagonist.special_story || '',
        memo:             protagonist.memo               || '',
        currentAffiliation: protagonist.current_affiliation || '',
        currentMental:      protagonist.current_mental      || '',
        currentLiving:      protagonist.current_living      || '',
        educationSummary:   oldData.life?.education?.summary  || '',
        educationHistory:   oldData.life?.education?.history  || [],
        income:             oldData.life?.income               || '',
        assets:             oldData.life?.assets               || '',
        sexualHistory:      Array.isArray(oldData.sexual_history)
            ? oldData.sexual_history.map(entry => ({
                partnerName:     entry.partner_name        || '',
                relationship:    entry.relationship        || '',
                period:          entry.period              || '',
                partnerAge:      String(entry.partner_age_at_time || ''),
                duration:        String(entry.duration_months     || ''),
                countEstimate:   String(entry.with_ayaka_count_estimate || ''),
                partnerVirginity: entry.partner_virgin ? 'あり' : '',
                partnerBody:     [
                    entry.penis_size_cm ? `${entry.penis_size_cm}cm` : '',
                    entry.phimosis || '',
                ].filter(Boolean).join(' / '),
                howItStarted:   '',
                emotionalTone:  '',
                details:        entry.details || '',
            }))
            : [],
    };

    const migratedCast = oldCast.map(castMember => ({
        ...createPerson(),
        id:                  castMember.id         || generateId(),
        name:                castMember.name        || '',
        role:                castMember.role        || '',
        age:                 castMember.age         || '',
        gender:              castMember.gender      || '',
        birthDate:           castMember.birth_date  || '',
        birthPlace:          castMember.birth_place || '',
        bloodType:           castMember.blood_type  || '',
        occupation:          castMember.occupation  || '',
        height:              castMember.height      || '',
        weight:              castMember.weight      || '',
        threeSizes:          castMember.three_sizes || '',
        hair:                castMember.hair        || '',
        eyes:                castMember.eyes        || '',
        skin:                castMember.skin        || '',
        bodyType:            castMember.body_type   || '',
        features:            castMember.features    || '',
        personalitySurface:  castMember.personality || '',
        personalityCore:     castMember.personality_core || '',
        personalityWeakness: castMember.weakness    || '',
        personalityStrength: castMember.strength    || '',
        jealousy:            castMember.jealousy    || '',
        sexualFeatures:      castMember.sexual_features || '',
        kink:                castMember.kink        || '',
        income:              castMember.income      || '',
        memo:                castMember.memo        || '',
    }));

    const allPersons = [migratedProtagonist, ...migratedCast];

    const findPersonIdByName = (name) =>
        allPersons.find(p => p.name === name)?.id || '';

    const migratedRelations = oldRelations.map(oldRelation => {
        const partnerId = oldRelation.partner_id
            || findPersonIdByName(oldRelation.partner)
            || '';
        const relatedLies = oldLies
            .filter(lie => lie.target_person_id === partnerId)
            .map(lie => ({
                lieContent:     lie.lie             || '',
                truth:          lie.truth           || '',
                howMaintained:  Array.isArray(lie.how_maintained)
                    ? lie.how_maintained.join('\n')
                    : (lie.how_maintained || ''),
                reason:         lie.reason         || '',
                innerConflict:  lie.inner_conflict || '',
            }));

        return {
            ...createRelation(migratedProtagonist.id, partnerId),
            nature:         oldRelation.nature          || '',
            timelineStart:  oldRelation.timeline_start  || '',
            timelineEnd:    oldRelation.timeline_end    || '',
            summary:        oldRelation.summary         || '',
            aftermathA:     oldRelation.aftermath_protagonist || '',
            aftermathB:     oldRelation.aftermath_partner     || '',
            themeImpact:    oldRelation.theme_impact    || '',
            memo:           oldRelation.memo            || '',
            lies:           relatedLies,
        };
    });

    const migratedEpisodes = oldEpisodes.map(oldEpisode => ({
        ...createEpisode(),
        title:      oldEpisode.title       || '',
        plot:       oldEpisode.plot        || '',
        keyMoments: oldEpisode.key_moments || '',
        mentalChange: oldEpisode.mental_change || '',
        text:       oldEpisode.text        || '',
    }));

    return {
        workTitle:  oldData.work_title || '',
        persons:    allPersons,
        relations:  migratedRelations,
        episodes:   migratedEpisodes,
        storyMeta: {
            setting:      oldData.story?.setting        || '',
            tone:         oldData.story?.tone           || '',
            overallTheme: oldData.story?.overall_theme  || '',
            futureHooks:  oldData.story?.future_hooks   || '',
        },
    };
}

/**
 * v3 を v4 にマイグレート
 * 主な作業: Episode に tags フィールドを補完
 * @param {Object} data - v3データ
 * @returns {Object} v4データ
 */
function migrateV3toV4(data) {
    return {
        ...data,
        schemaVersion: 4,
        episodes: (data.episodes || []).map(e => ({
            tags: '',
            ...e,
        })),
    };
}

/**
 * v4 を v5 にマイグレート
 * 主な作業: Relation に isOneWay: false フィールドを補完
 * @param {Object} data - v4データ
 * @returns {Object} v5データ
 */
function migrateV4toV5(data) {
    return {
        ...data,
        schemaVersion: 5,
        relations: (data.relations || []).map(r => ({
            isOneWay: false,
            ...r,
        })),
    };
}

const MIGRATIONS = [
    {
        from: 1, to: 2,
        // v1（v38形式）→ v2（persons/relations/episodes形式）
        migrate: migrateFromV38Format,
    },
    {
        from: 2, to: 3,
        // v2（v3/v3_fixed: schemaVersionなし）→ v3（schemaVersion付き）
        migrate: migrateV2toV3,
    },
    {
        from: 3, to: 4,
        // v3 → v4: Episode に tags フィールドを追加
        migrate: migrateV3toV4,
    },
    {
        from: 4, to: 5,
        // v4 → v5: Relation に isOneWay フィールドを追加
        migrate: migrateV4toV5,
    },
];

/**
 * 任意バージョンのデータを最新（SCHEMA_VERSION）にマイグレートする
 * @param {Object} raw
 * @returns {AppState}
 */
function migrateToLatest(raw) {
    const version = detectSchemaVersion(raw);

    if (version > SCHEMA_VERSION) {
        throw new Error(`このファイルはより新しいバージョン（v${version}）で作成されています。エディタを更新してください。`);
    }

    if (version === SCHEMA_VERSION) return raw;

    // パイプラインを順次適用して最新バージョンへ変換
    let current = raw;
    let currentVersion = version;

    while (currentVersion < SCHEMA_VERSION) {
        const step = MIGRATIONS.find(m => m.from === currentVersion);
        if (!step) {
            throw new Error(`バージョン ${currentVersion} → ${currentVersion + 1} のマイグレーションが定義されていません。`);
        }
        current = step.migrate(current);
        currentVersion = step.to;
    }

    return current;
}

/**
 * マイグレーション後のデータ構造を検証し、警告リストを返す。
 * 純関数・例外なし。問題があってもデータを変更しない。
 * @param {Object} state - マイグレーション済みデータ
 * @returns {string[]} 警告メッセージの配列（空なら問題なし）
 */
function validateMigratedState(state) {
    const warnings = [];
    if (!state || typeof state !== 'object') return ['データが空またはオブジェクトではありません'];

    // schemaVersion チェック
    if (state.schemaVersion !== SCHEMA_VERSION) {
        warnings.push(`スキーマバージョンが不一致です（期待: v${SCHEMA_VERSION}、実際: v${state.schemaVersion ?? '不明'}）`);
    }

    // relations: personAId / personBId が空の関係を検出
    if (Array.isArray(state.relations)) {
        const blankCount = state.relations.filter(r => !r.personAId || !r.personBId).length;
        if (blankCount > 0) {
            warnings.push(`人物IDが未設定の関係が ${blankCount} 件あります`);
        }
    }

    return warnings;
}

/**
 * migrateToLatest の冪等性を簡易チェックするデバッグ用ユーティリティ。
 * 同一データに対して2回適用した結果が JSON 文字列表現レベルで一致するかを返す。
 * 主に開発者がブラウザコンソールから利用することを想定している。
 *
 * @param {Object} raw - マイグレーション対象の生データ
 * @returns {boolean} true の場合、2回目の適用で差分が発生しなかったことを示す
 */
function debugCheckMigrationIdempotence(raw) {
    try {
        const first  = migrateToLatest(raw);
        const second = migrateToLatest(first);
        return JSON.stringify(first) === JSON.stringify(second);
    } catch (error) {
        console.error('debugCheckMigrationIdempotence failed:', error);
        return false;
    }
}
