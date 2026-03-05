/* schema.js
   スキーマバージョン・テーブル定数・データファクトリ関数
   依存: なし
*/

'use strict';

/* ═══════════════════════════════════════════════════════════
   SCHEMA VERSION & DATA MODEL
   スキーマバージョン履歴:
     1 = v38形式（protagonist フィールドあり）
     2 = v3/v3_fixed形式（schemaVersion フィールドなし）
     3 = v4形式（schemaVersion フィールド追加）
     4 = エピソードに tags フィールドを追加
     5 = 関係に isOneWay フィールドを追加（現行）
   マイグレーション: MIGRATIONS パイプライン参照（migration.js）
═══════════════════════════════════════════════════════════ */

/** 現在のスキーマバージョン（破壊的変更時にインクリメント） */
const SCHEMA_VERSION = 5;

/**
 * @typedef {Object} AppState
 * @property {number}     schemaVersion  - スキーマバージョン（必須）
 * @property {string}     workTitle      - 作品タイトル
 * @property {Person[]}   persons        - 登場人物配列
 * @property {Relation[]} relations      - 関係配列
 * @property {Episode[]}  episodes       - エピソード配列
 * @property {StoryMeta}  storyMeta      - 作品メタ情報
 */

/**
 * @typedef {Object} Person
 * @property {string}   id              - UUID（必須・不変）
 * @property {boolean}  isProtagonist   - 主人公フラグ
 * @property {string}   name            - 氏名
 * @property {string}   nameKana        - 読み仮名
 * @property {string}   nickname        - 通称・あだ名
 * @property {string}   age             - 年齢
 * @property {string}   birthDate       - 誕生日
 * @property {string}   birthPlace      - 出身地
 * @property {string}   bloodType       - 血液型
 * @property {string}   gender          - 性別
 * @property {string}   occupation      - 職業
 * @property {string}   role            - 物語上の役割
 * @property {string}   attributes      - 属性タグ
 * @property {string}   height          - 身長
 * @property {string}   weight          - 体重
 * @property {string}   threeSizes      - スリーサイズ
 * @property {string}   hair            - 髪型・色
 * @property {string}   eyes            - 目の色・形
 * @property {string}   skin            - 肌質
 * @property {string}   bodyType        - 体型
 * @property {string}   features        - 外見的特徴
 * @property {string}   scent           - 体臭・香り
 * @property {string}   voice           - 声質
 * @property {string}   personalitySurface  - 表の性格
 * @property {string}   personalityCore     - 内面・本質
 * @property {string}   personalityWeakness - 弱点
 * @property {string}   personalityStrength - 強み
 * @property {string}   loveStyle       - 恋愛スタイル
 * @property {string}   maternal        - 母性・庇護欲
 * @property {string}   jealousy        - 嫉妬・執着
 * @property {string}   futureDream     - 将来の夢・目標
 * @property {string}   awakening       - 覚醒・変化の契機
 * @property {string}   memo            - メモ
 * @property {string}   sexualAspect    - 性的側面
 * @property {string}   sexualFeatures  - 性的身体的特徴
 * @property {string}   kink            - 性癖
 * @property {string}   reactionPattern - 反応パターン
 * @property {SexualHistoryEntry[]} sexualHistory  - 性的経験カード
 * @property {string}   currentReference    - 基準時点
 * @property {string}   currentAffiliation  - 所属
 * @property {string}   currentMental       - 精神状態
 * @property {string}   currentLiving       - 居住環境
 * @property {string}   income              - 収入
 * @property {string}   assets              - 資産
 * @property {string}   educationSummary    - 学歴サマリー
 * @property {EducationHistoryEntry[]} educationHistory - 学歴タイムライン
 */

/**
 * @typedef {Object} Relation
 * @property {string}   id          - UUID（必須・不変）
 * @property {string}   personAId   - 人物AのID（Person.id 参照・一方通行時の「主体」）
 * @property {string}   personBId   - 人物BのID（Person.id 参照・一方通行時の「対象」）
 * @property {boolean}  isOneWay    - 一方通行フラグ（false=双方向、true=一方通行）
 * @property {string}   nature      - 関係の性質
 * @property {string}   timelineStart - 関係開始時期
 * @property {string}   timelineEnd   - 関係終了時期
 * @property {string}   summary     - 関係の概要
 * @property {string}   aftermathA  - 人物Aのその後
 * @property {string}   aftermathB  - 人物Bのその後
 * @property {string}   themeImpact - テーマへの影響
 * @property {string}   memo        - メモ
 * @property {SexualHistoryEntry[]} sexualHistory - 性的経験カード
 * @property {LieEntry[]}           lies          - 嘘・秘密カード
 * @property {EmotionalLogEntry[]}  emotionalLog  - 感情変化ログ
 */

/**
 * @typedef {Object} Episode
 * @property {string}   id          - UUID（必須・不変）
 * @property {string}   title       - タイトル
 * @property {string}   period      - 時期
 * @property {string}   plot        - あらすじ
 * @property {string}   keyMoments  - キーモーメント
 * @property {string}   mentalChange - 心理的変化
 * @property {string}   theme       - テーマ
 * @property {string}   tags        - 分類タグ（カンマ区切り）
 * @property {string}   memo        - メモ
 * @property {string}   text        - 執筆テキスト
 * @property {string[]} characterIds - 登場人物IDリスト（Person.id[] 参照）
 * @property {string[]} relationIds  - 関係IDリスト（Relation.id[] 参照）
 */

/**
 * @typedef {Object} StoryMeta
 * @property {string} setting      - 世界観・舞台設定
 * @property {string} tone         - 作品のトーン
 * @property {string} overallTheme - 全体テーマ
 * @property {string} futureHooks  - 将来の展開フック
 */

/**
 * @typedef {Object} SexualHistoryEntry
 * @property {string} partnerName     - 相手の名前
 * @property {string} relationship    - 関係性
 * @property {string} period          - 時期
 * @property {string} partnerAge      - 相手の年齢
 * @property {string} duration        - 交際期間
 * @property {string} countEstimate   - 回数目安
 * @property {string} partnerVirginity - 相手の経験有無
 * @property {string} partnerBody     - 相手の身体的特徴
 * @property {string} howItStarted    - 始まりの経緯
 * @property {string} emotionalTone   - 感情的トーン
 * @property {string} details         - 詳細
 */

/**
 * @typedef {Object} LieEntry
 * @property {string} lieContent    - 嘘の内容
 * @property {string} truth         - 真実
 * @property {string} howMaintained - 維持方法
 * @property {string} reason        - 嘘をつく理由
 * @property {string} innerConflict - 内的葛藤
 */

/**
 * @typedef {Object} EmotionalLogEntry
 * @property {string} period    - 時期
 * @property {string} trigger   - きっかけ
 * @property {string} emotionA  - 人物Aの気持ち
 * @property {string} emotionB  - 人物Bの気持ち
 * @property {string} note      - メモ
 */

/**
 * @typedef {Object} EducationHistoryEntry
 * @property {string} period - 期間
 * @property {string} event  - 出来事
 */

/* ═══════════════════════════════════════════════════════════
   CONSTANTS
═══════════════════════════════════════════════════════════ */
const createInitialState = () => ({
    schemaVersion: SCHEMA_VERSION,
    workTitle:  '',
    persons:    [],
    relations:  [],
    episodes:   [],
    storyMeta:  { setting: '', tone: '', overallTheme: '', futureHooks: '' },
});

const createPerson = () => ({
    id: generateId(),
    isProtagonist:       false,
    name: '', nameKana: '', nickname: '',
    age: '', birthDate: '', birthPlace: '', bloodType: '', gender: '',
    occupation: '', role: '', attributes: '',
    height: '', weight: '', threeSizes: '', hair: '', eyes: '', skin: '',
    bodyType: '', features: '', scent: '', voice: '',
    personalitySurface: '', personalityCore: '',
    personalityWeakness: '', personalityStrength: '',
    loveStyle: '', maternal: '', jealousy: '',
    futureDream: '', awakening: '', memo: '',
    sexualAspect: '', sexualFeatures: '', kink: '', reactionPattern: '',
    sexualHistory: [],
    currentReference: '', currentAffiliation: '', currentMental: '',
    currentLiving: '', income: '', assets: '',
    educationSummary: '',
    educationHistory: [],
});

const createRelation = (personAId, personBId) => ({
    id: generateId(),
    personAId, personBId,
    isOneWay: false,
    nature: '', timelineStart: '', timelineEnd: '',
    summary: '', aftermathA: '', aftermathB: '', themeImpact: '', memo: '',
    sexualHistory: [],
    lies: [],
    emotionalLog: [],
});

const createEpisode = () => ({
    id: generateId(),
    title: '', period: '',
    plot: '', keyMoments: '', mentalChange: '', theme: '', tags: '', memo: '',
    text: '',
    characterIds: [],
    relationIds: [],
});

/**
 * エピソードタグ文字列を正規化する（保存時・読み込み時に使用）
 * - 全角カンマを半角に統一して分割
 * - 各タグをトリム・改行除去・最大20文字に切り捨て
 * - 空要素・重複を除去
 * - カンマ区切り文字列として返す
 * @param {string} raw
 * @returns {string}
 */
const normalizeTags = (raw) => {
    if (!raw) return '';
    return [...new Set(
        raw.replace(/，/g, ',')
           .split(',')
           .map(t => t.replace(/\n/g, '').trim().slice(0, 20))
           .filter(Boolean)
    )].join(',');
};

const createSexualHistoryEntry = () => ({
    partnerName: '', relationship: '', period: '', partnerAge: '',
    duration: '', countEstimate: '', partnerVirginity: '',
    partnerBody: '', howItStarted: '', emotionalTone: '', details: '',
});

const createLieEntry = () => ({
    lieContent: '', truth: '', howMaintained: '', reason: '', innerConflict: '',
});

const createEmotionalLogEntry = () => ({
    period: '', trigger: '', emotionA: '', emotionB: '', note: '',
});

const createEducationHistoryEntry = () => ({
    period: '', event: '',
});

/* ═══════════════════════════════════════════════════════════
   FILE UTILITIES
═══════════════════════════════════════════════════════════ */

/**
 * ファイル名として安全な文字列に変換する。
 * Windows / macOS 禁止文字・制御文字を '_' に置換し、
 * 全て '_' になった場合は fallback を返す。
 * @param {string} rawStr
 * @param {string} fallback
 * @returns {string}
 */
const sanitizeFilename = (rawStr, fallback) =>
    (rawStr || '').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim().replace(/^_+$/, '') || fallback;

/* ═══════════════════════════════════════════════════════════
   DOM HELPERS
   - ビルダーパターンで読みやすく
═══════════════════════════════════════════════════════════ */
