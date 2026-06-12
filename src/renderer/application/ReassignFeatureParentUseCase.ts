/**
 * 地物所属変更ユースケース
 *
 * 要件定義書 §2.1: 割譲と合邦機能（所属変更）
 *
 * 特定時刻以降の歴史の錨に対して、子地物の parentId と
 * 旧親・新親の childIds を同一操作として更新する。
 */

import type { Feature } from '@domain/entities/Feature';
import type { SharedVertexGroup } from '@domain/entities/SharedVertexGroup';
import type { Vertex } from '@domain/entities/Vertex';
import type { Coordinate } from '@domain/value-objects/Coordinate';
import {
  FeatureAnchor,
  createAnchorPlacement,
  isEmptyContainerAnchor,
  isLeafPolygonAnchor,
  type AnchorPlacement,
  type AnchorProperty,
} from '@domain/value-objects/FeatureAnchor';
import type { TimePoint } from '@domain/value-objects/TimePoint';
import type { RingCoords } from '@domain/services/GeometryService';
import {
  buildDirectlyGovernedDefaultName,
  deriveParentPolygons,
  getAncestors,
  resolvePolygonAnchorPolygons,
  validateHierarchy,
} from '@domain/services/HierarchyService';
import { polygonDifferenceAll } from '@domain/services/BooleanOperationService';
import { featureCoversRange } from '@domain/services/TimeService';
import {
  mergePolygons,
  validateMergeFeatures,
  validateTransfer,
  type TransferType,
} from '@domain/services/MergeService';
import type { AddFeatureUseCase } from './AddFeatureUseCase';
import { eventBus } from './EventBus';

export class FeatureParentTransferError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FeatureParentTransferError';
  }
}

/**
 * 新規上位領域作成サブフローで積み上げる 1 段分のコンテナ指定（名称・種別ラベル）。
 * 再帰積み上げ（要件定義書 §2.1 line 293）で最内コンテナのさらに上位へ挿入する中間階層を表す。
 */
export interface NewParentContainerSpec {
  readonly name: string;
  readonly kind?: string;
}

/**
 * 新規上位領域作成サブフローの指定（要件定義書 §2.1 line 290-293）。
 * 指定時は in-memory で集約地物（shape なしコンテナ）を新規生成し、
 * 対象地物をその下位領域として一括帰属させる。
 *
 * `name` / `kind` は最内コンテナ（対象地物の直接の新親）の名称・種別。
 * `ancestors` は最内コンテナのさらに上位へ積み上げる新規コンテナ列（外側ほど後ろ。
 * 要件定義書 §2.1 line 293 の再帰積み上げ / 中間階層の後付け挿入）。空または未指定なら単一コンテナ。
 *
 * `parentId` でチェーン最外コンテナ自身の所属を指定する（要件定義書 §2.1 line 292 / line 305）:
 * - `null` または未指定: 新規最上位コンテナ（`parentId === null` / `isTopLevel === true`）— 連邦化。
 * - 非 null: 既存の上位領域に所属する新中間コンテナ — 自治化（既存子と既存親の間に挿入）。
 *
 * 注意（§6.0.1 検出観点2 / 現状.md Phase 4-3 自治化部分「型同期の注意」）:
 * presentation 層 `CreateNewParentInput`（`parentTransferDialogUtils.ts`）と同形の独立宣言。
 * フィールド追加時は両型をセットで見直す（App.svelte のスプレッド橋渡しは構造的型一致に依存）。
 */
export interface CreateNewParentSpec {
  readonly name: string;
  readonly kind?: string;
  readonly parentId?: string | null;
  readonly ancestors?: readonly NewParentContainerSpec[];
}

/**
 * 末端地物 → 集約地物の遷移で自動生成される直轄領（要件定義書 §2.1 line 226-229）の
 * 名称・種別ラベルの上書き指定。所属変更ダイアログでユーザーが入力する（§2.1 line 228）。
 *
 * - `name`: 前後空白除去後が非空ならその名称を採用。空または未指定なら
 *   デフォルト「`<元末端地物名> 直轄領`」へフォールバックする。
 * - `kind`: 前後空白除去後が非空ならその種別を採用。空なら種別なし（明示的な除去）。
 *   本 spec 自体が未指定（`directlyGovernedOverride === undefined`）のときのみ、
 *   元末端地物の種別を継承する（ダイアログ非経由の直接呼び出し・既存テスト互換）。
 *
 * 注意（§6.0.1 検出観点2）: presentation 層 `DirectlyGovernedOverrideInput`
 * （`parentTransferDialogUtils.ts`）と同形の独立宣言。フィールド追加時は両型をセットで見直す。
 */
export interface DirectlyGovernedOverrideSpec {
  readonly name?: string;
  readonly kind?: string;
}

export interface ReassignFeatureParentParams {
  readonly featureIds: readonly string[];
  readonly newParentId: string | null;
  readonly effectiveTime: TimePoint;
  readonly transferType?: TransferType;
  /**
   * 指定時、新規上位領域（集約地物）を作成して対象地物をその下位領域へ帰属させる。
   * このとき `newParentId` は無視され、生成されたコンテナの ID が新親になる。
   */
  readonly createNewParent?: CreateNewParentSpec;
  /**
   * 末端地物 → 集約地物の遷移で自動生成される直轄領の名称・種別の上書き（§2.1 line 228）。
   * 1 操作で遷移する既存末端地物は高々 1 件（征服の新親 / 自治化の所属先 Q）のため、
   * 単一の上書きで足りる（`resolveLeafToContainerTransition` の全呼び出しへ同一値を渡す）。
   */
  readonly directlyGovernedOverride?: DirectlyGovernedOverrideSpec;
}

export interface ReassignFeatureParentResult {
  readonly changedFeatureIds: readonly string[];
  /** 新規上位領域作成サブフローで生成したコンテナの ID（未生成なら null） */
  readonly createdParentId: string | null;
}

/** 末端地物のみの結合（要件定義書 §2.1「合体（結合）機能」）の確定パラメータ。 */
export interface MergeLeafFeaturesParams {
  /** 結合対象の末端地物 ID 群（2 つ以上）。属性・所属の継承元は最初の ID。 */
  readonly featureIds: readonly string[];
  /** 結合を実行する作中時間。元リーフはこの時刻で存在終了し、結果地物が新規開始する。 */
  readonly effectiveTime: TimePoint;
  /** 結果地物の名称（前後空白除去後が空なら最初の対象の名称を継承）。 */
  readonly mergedName?: string;
}

export interface MergeLeafFeaturesResult {
  /** 新規生成された結果末端地物の ID。 */
  readonly mergedFeatureId: string;
  readonly changedFeatureIds: readonly string[];
}

export class ReassignFeatureParentUseCase {
  constructor(private readonly featureUseCase: AddFeatureUseCase) {}

  assertCanAssignNewFeatureToParent(
    newParentId: string,
    effectiveTime: TimePoint
  ): void {
    const parent = this.featureUseCase.getFeatureById(newParentId);
    if (!parent || !parent.existsAt(effectiveTime)) {
      throw new FeatureParentTransferError(`新しい親地物 "${newParentId}" が指定時刻に存在しません`);
    }
    if (parent.featureType !== 'Polygon') {
      throw new FeatureParentTransferError('新しい親には面情報のみ指定できます');
    }
    if (!featureCoversRange(parent, effectiveTime, undefined)) {
      throw new FeatureParentTransferError(
        `新しい親地物 "${newParentId}" は対象地物の存在期間を覆っていません`
      );
    }
  }

  reassignFeatureParent(
    params: ReassignFeatureParentParams
  ): ReassignFeatureParentResult {
    const featureIds = [...new Set(params.featureIds)];
    const transferType = params.transferType ?? 'reassign';
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;
    const staged = new Map(features);
    const changedFeatureIds = new Set<string>();
    const usedAnchorIds = collectUsedAnchorIds(staged);
    const prunedParentQueue: CascadingParentSync[] = [];
    // 直轄領自動生成（要件定義書 §2.1 line 226-229）用の staging。
    // 新規末端地物（直轄領）の頂点は検証通過後にまとめて commit し、失敗時のリークを防ぐ。
    // 遷移で旧 shape を破棄した地物の旧頂点は現状残置する（孤立頂点掃除は本サブフェーズの
    // スコープ外として後続へ defer。無害＝未参照で描画・トポロジーに影響しない。現状.md §6 参照）。
    const createdVertices = new Map<string, Vertex>();

    // 新規上位領域作成サブフロー: 対象地物を下位領域に持つ集約地物のチェーン（最内 → 最外）を
    // in-memory に生成して staged へ挿入し、最内コンテナの ID を新親とする
    // （要件定義書 §2.1 line 290-302 / 再帰積み上げ line 293）。
    // childIds を生成時点で各段に充足することで「shape なし ⟹ childIds 非空」不変条件を満たす（§6.6.8）。
    // `createNewParent.parentId` 非 null のとき最外コンテナ自身も既存上位領域 Q に所属する（自治化）。
    let newParentId = params.newParentId;
    let createdParentId: string | null = null;
    const createdContainerIds: string[] = []; // innermost → outermost
    let finalContainerParentId: string | null = null;
    if (params.createNewParent) {
      // 各段の名称の非空検証（要件定義書 §2.1 line 291）。UI の確定ボタン disabled と二重防御。
      const innermostName = params.createNewParent.name.trim();
      if (innermostName === '') {
        throw new FeatureParentTransferError('新規上位領域の名称を入力してください');
      }
      const ancestorSpecs = params.createNewParent.ancestors ?? [];
      const levels: NewParentContainerSpec[] = [
        {
          name: innermostName,
          ...(params.createNewParent.kind !== undefined ? { kind: params.createNewParent.kind } : {}),
        },
      ];
      for (const ancestor of ancestorSpecs) {
        const ancestorName = ancestor.name.trim();
        if (ancestorName === '') {
          throw new FeatureParentTransferError('新規上位領域の名称を入力してください');
        }
        levels.push({
          name: ancestorName,
          ...(ancestor.kind !== undefined ? { kind: ancestor.kind } : {}),
        });
      }
      finalContainerParentId = params.createNewParent.parentId ?? null;
      if (finalContainerParentId !== null) {
        // 自治化: 最外コンテナの所属先 Q の妥当性（存在・面情報・期間カバレッジ）を確定前に検証する
        // （§6.6.1 / §6.6.3 line 586 二重防御）。最外 ≡ … ≡ 最内 ≡ 移動対象の和 のため、Q が各移動対象を
        // 覆えば最外コンテナも覆う（featureIds で検証）。循環参照は staged にチェーンを入れた状態で
        // 下流の validateTransfer（getAncestors(最内) ∌ 移動対象）が担う。
        this.assertContainerParentValid(finalContainerParentId, featureIds, params.effectiveTime, staged);
      }
      const chain = this.buildCreatedContainerChain(
        params.effectiveTime,
        featureIds,
        levels,
        finalContainerParentId
      );
      for (const container of chain) {
        staged.set(container.id, container);
        changedFeatureIds.add(container.id);
        createdContainerIds.push(container.id);
      }
      newParentId = chain[0].id; // 最内コンテナが移動対象の直接の新親
      createdParentId = chain[0].id; // 後方互換: createdParentId は最内コンテナ
    }

    // 末端地物 → 集約地物の遷移で直轄領を生成すべき「変異前に effectiveTime で末端地物だった地物」を控える
    // （要件定義書 §2.1 line 225）。判定は変異前の features（オリジナル状態）で行い、ロード済みの
    // 移行期間ノード（変異前から childIds 保持）を誤って巻き込まない。子を獲得する経路は
    //   (1) 既存末端を新親に指定（征服: newParentId が既存末端）、
    //   (2) 新規上位領域作成サブフローの所属先 Q が既存末端（自治化: createNewParent.parentId）
    // のいずれもあり得るため、特定の候補に絞らず「全 changedFeatureIds のうち変異前に末端だったもの」を
    // 対象とする（§6.0.1 検出観点2: newParentId と所属先 Q の対概念を一様に扱う）。
    const wasLeafAtEffectiveTime = (featureId: string): boolean => {
      const original = features.get(featureId);
      const anchor = original?.getActiveAnchor(params.effectiveTime);
      return anchor !== undefined && isLeafPolygonAnchor(anchor);
    };

    const allFeatures = [...staged.values()];

    this.validateRequest(featureIds, newParentId, params.effectiveTime, allFeatures, transferType);

    const oldParentIds = new Set<string>();
    for (const featureId of featureIds) {
      const feature = staged.get(featureId)!;
      for (const parentId of collectParentIdsFromTime(feature, params.effectiveTime)) {
        oldParentIds.add(parentId);
      }
    }

    for (const featureId of featureIds) {
      const feature = staged.get(featureId)!;
      const updated = this.updatePlacementFromTime(
        feature,
        params.effectiveTime,
        usedAnchorIds,
        (placement) => createAnchorPlacement(
          newParentId,
          placement.childIds
        )
      );
      this.stageFeature(staged, changedFeatureIds, feature, updated);
    }

    if (newParentId !== null) {
      const newParent = staged.get(newParentId)!;
      const movedFeatures = featureIds.map((featureId) => staged.get(featureId)!);
      const updated = this.updateParentChildIdsFromTime(
        newParent,
        params.effectiveTime,
        usedAnchorIds,
        movedFeatures
      );
      this.stageFeature(staged, changedFeatureIds, newParent, updated);
    }

    // 新規コンテナチェーン（連邦化 / 自治化 / 再帰積み上げ）の childIds 同期 + 空区間剪定 +
    // 最外コンテナの所属先 Q 同期。新規コンテナ（shape なし）は子の存在終了で childIds が空化する
    // 区間を持ち得るため（`updateParentChildIdsFromTime` の錨分割で発生）、各段を剪定して不変条件
    // 「shape なし ⟹ childIds 非空」を再保証する（§6.6.8 / Phase 2.5-E 申し送り: 生成だけでなく変異の
    // 各ステップで保証）。旧親除去ループより前に実行する（順序: 子追加 → 剪定 → Q への追加 → 旧親除去）。
    if (createdContainerIds.length > 0) {
      this.syncCreatedContainerChain(
        staged,
        changedFeatureIds,
        params.effectiveTime,
        usedAnchorIds,
        createdContainerIds,
        finalContainerParentId
      );
    }

    // 末端地物 → 集約地物の遷移時の直轄領自動生成（要件定義書 §2.1 line 226-229）。
    // この時点で子の獲得（newParentId の childIds 更新 / syncCreatedContainerChain での所属先 Q 同期）は
    // 完了している。変異前に末端だった changedFeatureIds を走査し、移行期間ノード錨を獲得したものを
    // resolveLeafToContainerTransition で解決する（征服の newParentId・自治化の所属先 Q を一様に網羅）。
    // 反復中に直轄領が changedFeatureIds へ追加されるため、走査対象はスナップショットで固定する
    // （直轄領は新規地物で features に存在せず wasLeafAtEffectiveTime=false のため二重処理されない）。
    for (const featureId of [...changedFeatureIds]) {
      if (!wasLeafAtEffectiveTime(featureId)) continue;
      this.resolveLeafToContainerTransition(
        staged,
        changedFeatureIds,
        createdVertices,
        params.effectiveTime,
        featureId,
        params.directlyGovernedOverride
      );
    }

    for (const oldParentId of oldParentIds) {
      if (oldParentId === newParentId) continue;
      const oldParent = staged.get(oldParentId);
      if (!oldParent) {
        throw new FeatureParentTransferError(`元の親地物 "${oldParentId}" が見つかりません`);
      }
      const updated = this.updatePlacementFromTime(
        oldParent,
        params.effectiveTime,
        usedAnchorIds,
        (placement) => createAnchorPlacement(
          placement.parentId,
          placement.childIds.filter((id) => !featureIds.includes(id))
        )
      );
      const pruned = this.removeEmptyParentRangesFromTime(
        oldParent,
        updated,
        params.effectiveTime,
        featureIds
      );
      if (pruned) {
        this.stageFeature(staged, changedFeatureIds, oldParent, pruned);
        if (pruned !== updated) {
          prunedParentQueue.push({ original: oldParent });
        }
      } else {
        this.stageFeatureDeletion(staged, changedFeatureIds, oldParent);
        prunedParentQueue.push({ original: oldParent });
      }
    }

    this.cascadeParentCleanup(
      staged,
      changedFeatureIds,
      params.effectiveTime,
      usedAnchorIds,
      prunedParentQueue
    );

    this.validateStagedHierarchy(staged, params.effectiveTime, changedFeatureIds);

    const deletedFeatures = [...changedFeatureIds]
      .filter((featureId) => !staged.has(featureId))
      .map((featureId) => features.get(featureId))
      .filter((feature): feature is Feature => feature !== undefined);

    // 直轄領の新規頂点は検証通過後にのみ反映する（validateStagedHierarchy より後）。
    // 検証で throw した場合は createdVertices が live マップへ漏れないため atomic 性を保つ。
    if (createdVertices.size > 0) {
      const verticesMap = this.featureUseCase.getVertices() as Map<string, Vertex>;
      for (const [vertexId, vertex] of createdVertices) {
        verticesMap.set(vertexId, vertex);
      }
    }

    for (const featureId of changedFeatureIds) {
      const updated = staged.get(featureId);
      if (updated) {
        features.set(featureId, updated);
        eventBus.emit('feature:added', { featureId });
      } else if (features.delete(featureId)) {
        eventBus.emit('feature:removed', { featureId });
      }
    }
    this.cleanupDeletedFeatureArtifacts(deletedFeatures);

    return { changedFeatureIds: [...changedFeatureIds], createdParentId };
  }

  /**
   * 末端地物のみの結合の確定経路（要件定義書 §2.1「合体（結合）機能」line 326-329）。
   *
   * 「元の末端地物はすべてその時刻に存在を終了する歴史の錨が打たれ、結果の末端地物が
   * 新規開始する」を実装する:
   *   - 各結合対象の錨を effectiveTime で打ち切る（`terminateFeatureExistenceAt`）。
   *     effectiveTime 以前の歴史（錨・形状・頂点参照）は保持され、頂点クリーンアップの対象に
   *     ならない（歴史錨が参照し続ける頂点を消すとロード時検証が拒否する。§6.4.15 / §6.4.17）。
   *     地物が effectiveTime ちょうどに開始していた場合のみ全錨が消え、地物ごと消滅する
   *     （存在期間が空になるため。この場合のみ頂点クリーンアップが走る）。
   *   - 形状の論理和（`mergePolygons`）を持つ新規末端地物を effectiveTime から開始する。
   *   - 親の childIds を effectiveTime で錨分割し、元リーフ除去 + 結果地物追加へ同期する。
   *     childIds が空化した区間は剪定し、全消滅した旧親は連鎖的に消滅させる
   *     （要件定義書 §2.1 line 349「旧親領域がいずれも下位領域を全て失う結果になる場合、
   *     当該時刻以降の旧親領域は自動的に消滅する」）。
   *
   * 所属変更と同じ staged エンジン（`updateParentChildIdsFromTime` /
   * `removeEmptyParentRangesFromTime` / `cascadeParentCleanup` / `validateStagedHierarchy` /
   * `cleanupDeletedFeatureArtifacts`）を共有するため本クラスに置く（§6.6.9 / §6.4.17:
   * 親 childIds の時刻同期・空コンテナ剪定・結果状態検証の判定を所属変更経路と単一実装で共有し、
   * 経路間ドリフトを防ぐ）。
   *
   * 結果地物の有効期間は [effectiveTime, 結合対象の有効錨 end の最小値)（全錨が開区間なら開区間）。
   * この区間内では各対象の形状が不変で、時間スライスごとの末端地物排他（地図全体）を満たして
   * いたため、論理和である結果形状も構成的に排他を満たす。最小値を超えて延長すると、対象消滅後に
   * その領域を占有した別の末端地物と重複し「保存できるが開けないファイル」（§6.4.15）を作り得る
   * ため延長しない（§2.2.3 空間競合解決の起動配線が無い現段階での保守的設計。配線後に再検討）。
   *
   * 末端→集約遷移の解決（`resolveLeafToContainerTransition`）は本経路では呼ばない:
   * 結合の変異で childIds を獲得するのは結果地物の親（resultParentId）のみであり、その親は
   * effectiveTime で結合対象（= 子）を持つため変異前から末端ではない。よって「変異前に末端 ∧
   * 変異後に移行期間ノード」となる地物は構造上生じない（§6.1.8 の結果状態による証明。
   * 経路ゲートではない）。上位領域決定ダイアログで既存末端を結果地物の親に選べるようになる
   * 後続サブフェーズ（現状.md §6.10 Phase 4-6 残作業）で遷移解決の共有が必要になる。
   */
  mergeLeafFeatures(params: MergeLeafFeaturesParams): MergeLeafFeaturesResult {
    const { effectiveTime } = params;
    const featureIds = [...new Set(params.featureIds)];
    const features = this.featureUseCase.getFeaturesMap() as Map<string, Feature>;

    // 事前条件検証（件数・重複・上位下位関係・末端のみ・同一上位領域の暫定制約）。
    // 選択時（App.svelte の addMergeTarget）と同一サービスを共有して判定ドリフトを防ぐ（§6.6.1）。
    const validation = validateMergeFeatures(featureIds, [...features.values()], effectiveTime);
    if (!validation.valid) {
      throw new FeatureParentTransferError(validation.error ?? '結合対象が不正です');
    }

    // 形状収集は描画・派生サービスと同じ shape 解決経路を共有する（§6.6.9 / B30 統一方針）。
    const coordMap = new Map<string, Coordinate>();
    for (const [id, vertex] of this.featureUseCase.getVertices()) {
      coordMap.set(id, vertex.coordinate);
    }
    const targetAnchors = new Map<string, FeatureAnchor>();
    const polygonsList: RingCoords[][] = [];
    for (const featureId of featureIds) {
      // 存在・有効性・Polygon・末端は validateMergeFeatures が保証済み。
      const anchor = features.get(featureId)!.getActiveAnchor(effectiveTime)!;
      targetAnchors.set(featureId, anchor);
      polygonsList.push(...resolvePolygonAnchorPolygons(anchor, coordMap));
    }
    const mergeResult = mergePolygons(polygonsList);
    if (!mergeResult.success) {
      throw new FeatureParentTransferError(mergeResult.error ?? '結合に失敗しました');
    }

    // 結果地物の有効期間の終端 = 結合対象の有効錨 end の最小値（上記 doc コメント参照）。
    let mergedEnd: TimePoint | undefined;
    for (const anchor of targetAnchors.values()) {
      const end = anchor.timeRange.end;
      if (end && (!mergedEnd || end.isBefore(mergedEnd))) {
        mergedEnd = end;
      }
    }

    // 結果地物の所属と属性: 同一上位領域の暫定制約により parentId は一意（最初の対象から継承）。
    // 属性も最初の対象から継承し、名称のみ mergedName で上書きする（上位領域決定 /
    // プロパティ決定ダイアログは Phase 4-6 後続サブフェーズ。要件定義書 §2.1 line 341-348）。
    const firstAnchor = targetAnchors.get(featureIds[0])!;
    const resultParentId = firstAnchor.placement.parentId;
    const mergedName = params.mergedName?.trim();
    const property: AnchorProperty = mergedName
      ? { ...firstAnchor.property, name: mergedName }
      : firstAnchor.property;

    const { feature: mergedFeature, vertices: createdVertices } =
      this.featureUseCase.buildLeafPolygonFeature(
        mergedEnd ? { start: effectiveTime, end: mergedEnd } : { start: effectiveTime },
        mergeResult.mergedPolygons,
        property,
        resultParentId
      );

    // ここから staged 変異。検証 throw 時は live マップ・頂点へ一切反映されない（atomic 性。
    // reassignFeatureParent と同型）。
    const staged = new Map(features);
    const changedFeatureIds = new Set<string>();
    const usedAnchorIds = collectUsedAnchorIds(staged);
    const prunedParentQueue: CascadingParentSync[] = [];
    const targetIdSet = new Set(featureIds);

    staged.set(mergedFeature.id, mergedFeature);
    changedFeatureIds.add(mergedFeature.id);
    for (const anchor of mergedFeature.anchors) {
      usedAnchorIds.add(anchor.id);
    }

    // (1) 元リーフの存在終了。打ち切りで除去される後続錨（start >= effectiveTime）が下位領域を
    // 持っていた場合（外部生成 .gimoza 由来の後続移行期間ノード錨のみ持ち得る。effectiveTime の
    // 有効錨は末端検証済みで childIds 空）、その子の parentId 参照を後段 (2) の前に控える。
    const survivingTargets: Feature[] = [];
    const orphanedChildIds = new Set<string>();
    for (const featureId of featureIds) {
      const original = staged.get(featureId)!;
      for (const anchor of original.anchors) {
        if (anchor.timeRange.start.isAtOrAfter(effectiveTime)) {
          for (const childId of anchor.placement.childIds) {
            orphanedChildIds.add(childId);
          }
        }
      }
      const terminated = terminateFeatureExistenceAt(original, effectiveTime);
      if (terminated) {
        staged.set(featureId, terminated);
        survivingTargets.push(terminated);
      } else {
        staged.delete(featureId);
      }
      changedFeatureIds.add(featureId);
    }

    // (2) 打ち切られた後続錨だけが親だった子の parentId クリア（最上位化）。削除経路の
    // 「子の parentId クリア」と同じ解体セマンティクス（§6.4.17）。effectiveTime 以前の参照は
    // 存在しない（子の参照区間 = 破棄された後続錨の区間）ため from-time 更新で網羅される。
    for (const childId of orphanedChildIds) {
      if (targetIdSet.has(childId)) continue;
      const child = staged.get(childId);
      if (!child) continue;
      const updated = this.updatePlacementFromTime(
        child,
        effectiveTime,
        usedAnchorIds,
        (placement) => placement.parentId !== null && targetIdSet.has(placement.parentId)
          ? createAnchorPlacement(null, placement.childIds)
          : placement
      );
      this.stageFeature(staged, changedFeatureIds, child, updated);
    }

    // (3) 親の childIds 同期。effectiveTime 以降に結合対象を子として参照する全親
    // （effectiveTime 時点の共通親 + 破棄された後続錨だけが参照していた別親）を錨分割で更新する。
    // 結果地物は自身の親（resultParentId）にのみ追加する: `buildParentPlacementForSegment` は
    // targets の active 判定のみで childIds へ追加するため、targets の与え方で所属先を制御する。
    const oldParentIds = new Set<string>();
    for (const featureId of featureIds) {
      for (const parentId of collectParentIdsFromTime(features.get(featureId)!, effectiveTime)) {
        oldParentIds.add(parentId);
      }
    }
    const syncTargetIds = new Set([...featureIds, mergedFeature.id]);
    for (const parentId of oldParentIds) {
      const parent = staged.get(parentId);
      if (!parent) {
        // 結合対象自身が他対象の（破棄された後続区間の）親で、存在終了により消滅済みのケース。
        if (targetIdSet.has(parentId)) continue;
        throw new FeatureParentTransferError(`元の親地物 "${parentId}" が見つかりません`);
      }
      const syncTargets = parentId === resultParentId
        ? [...survivingTargets, mergedFeature]
        : survivingTargets;
      const updated = this.updateParentChildIdsFromTime(
        parent,
        effectiveTime,
        usedAnchorIds,
        syncTargets,
        syncTargetIds
      );
      const pruned = this.removeEmptyParentRangesFromTime(parent, updated, effectiveTime, featureIds);
      if (pruned) {
        this.stageFeature(staged, changedFeatureIds, parent, pruned);
        if (pruned !== updated) {
          prunedParentQueue.push({ original: parent });
        }
      } else {
        this.stageFeatureDeletion(staged, changedFeatureIds, parent);
        prunedParentQueue.push({ original: parent });
      }
    }

    this.cascadeParentCleanup(
      staged,
      changedFeatureIds,
      effectiveTime,
      usedAnchorIds,
      prunedParentQueue
    );

    this.validateStagedHierarchy(staged, effectiveTime, changedFeatureIds);

    const deletedFeatures = [...changedFeatureIds]
      .filter((featureId) => !staged.has(featureId))
      .map((featureId) => features.get(featureId))
      .filter((feature): feature is Feature => feature !== undefined);

    // 結果地物の新規頂点は検証通過後にのみ反映する（atomic 性。reassignFeatureParent と同型）。
    const verticesMap = this.featureUseCase.getVertices() as Map<string, Vertex>;
    for (const [vertexId, vertex] of createdVertices) {
      verticesMap.set(vertexId, vertex);
    }

    for (const featureId of changedFeatureIds) {
      const updated = staged.get(featureId);
      if (updated) {
        features.set(featureId, updated);
        eventBus.emit('feature:added', { featureId });
      } else if (features.delete(featureId)) {
        eventBus.emit('feature:removed', { featureId });
      }
    }
    this.cleanupDeletedFeatureArtifacts(deletedFeatures);

    return { mergedFeatureId: mergedFeature.id, changedFeatureIds: [...changedFeatureIds] };
  }

  private validateRequest(
    featureIds: readonly string[],
    newParentId: string | null,
    effectiveTime: TimePoint,
    allFeatures: readonly Feature[],
    transferType: TransferType
  ): void {
    const featureMap = new Map(allFeatures.map((feature) => [feature.id, feature]));

    if (featureIds.length === 0) {
      throw new FeatureParentTransferError('所属変更の対象地物が指定されていません');
    }

    for (const featureId of featureIds) {
      const feature = featureMap.get(featureId);
      if (!feature) {
        throw new FeatureParentTransferError(`所属変更の対象地物が見つかりません: ${featureId}`);
      }
      const activeAnchor = feature.getActiveAnchor(effectiveTime);
      if (!activeAnchor) {
        throw new FeatureParentTransferError(`地物 "${featureId}" は指定時刻に存在しません`);
      }
      if (feature.featureType !== 'Polygon') {
        throw new FeatureParentTransferError('所属変更できるのは面情報のみです');
      }
      // 集約展開分岐（Phase 4-4 / 要件定義書 §2.1 line 313）:
      // scope='children'（transferType='annex'）は集約地物の「下位領域すべて」を一括移動する経路で、
      // 直接の下位領域には集約地物（多層コンテナ）が含まれ得る。移動対象の集約地物は自身の下位領域
      // （subtree）を保持したまま位相のみ変わるため、リーフ制約を課さない（childIds は移動時も保持し
      // 「shape なし ⟹ childIds 非空」不変条件を維持。開発ガイド §6.6.8）。
      // scope='selected'（cede / reassign）は対象自身を直接移動するため末端地物に限る（line 313 の
      // ドメイン側強制。UI の canTransferSelectedFeature と対をなす二重防御。開発ガイド §6.6.1 / §6.0.1 検出観点2）。
      if (transferType !== 'annex') {
        this.assertLeafFromTime(feature, effectiveTime);
      }
    }

    if (newParentId !== null) {
      const parent = featureMap.get(newParentId);
      if (!parent || !parent.existsAt(effectiveTime)) {
        throw new FeatureParentTransferError(`新しい親地物 "${newParentId}" が指定時刻に存在しません`);
      }
      if (parent.featureType !== 'Polygon') {
        throw new FeatureParentTransferError('新しい親には面情報のみ指定できます');
      }
      this.assertParentCoversTargetRanges(
        parent,
        featureIds.map((featureId) => featureMap.get(featureId)!),
        effectiveTime
      );
    }

    const transferValidation = validateTransfer(
      { featureIds, newParentId, type: transferType },
      (featureId) => {
        const feature = featureMap.get(featureId);
        if (!feature) return [];
        return getAncestors(feature, allFeatures, effectiveTime).map((ancestor) => ancestor.id);
      }
    );
    if (!transferValidation.valid) {
      throw new FeatureParentTransferError(transferValidation.error ?? '所属変更の指定が不正です');
    }
  }

  private assertLeafFromTime(feature: Feature, effectiveTime: TimePoint): void {
    for (const anchor of feature.anchors) {
      if (anchor.timeRange.end && !anchor.timeRange.end.isAtOrAfter(effectiveTime)) {
        continue;
      }
      if (anchor.timeRange.end && anchor.timeRange.end.equals(effectiveTime)) {
        continue;
      }
      if (anchor.placement.childIds.length > 0) {
        throw new FeatureParentTransferError(
          `地物 "${feature.id}" は下位領域を持つため、直接の所属変更はできません`
        );
      }
    }
  }

  private assertParentCoversTargetRanges(
    parent: Feature,
    targetFeatures: readonly Feature[],
    effectiveTime: TimePoint
  ): void {
    for (const feature of targetFeatures) {
      for (const anchor of feature.anchors) {
        if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
          continue;
        }
        const rangeStart = anchor.timeRange.start.isBefore(effectiveTime)
          ? effectiveTime
          : anchor.timeRange.start;
        if (!featureCoversRange(parent, rangeStart, anchor.timeRange.end)) {
          throw new FeatureParentTransferError(
            `新しい親地物 "${parent.id}" は対象地物 "${feature.id}" の存在期間を覆っていません`
          );
        }
      }
    }
  }

  /**
   * 自治化（要件定義書 §2.1 line 305）における新規コンテナの所属先 Q を確定前に検証する。
   *
   * 新規コンテナ Y は移動対象の和を子に持つため、Y の所属先 Q は移動対象の存在期間を覆う
   * 面情報でなければならない（Q が Y を覆う ⟸ Q が各移動対象を覆う、∵ Y ≡ 移動対象の和）。
   * 循環参照（Q が移動対象自身またはその下位領域）は staged に Y(parentId=Q) を入れた状態で
   * `validateRequest` 内の `validateTransfer`（`getAncestors(Y)` ∌ 移動対象）が担うため、ここでは
   * 存在・面情報・期間カバレッジのみを検証する（§6.6.1 / §6.6.3 line 586 二重防御）。
   */
  private assertContainerParentValid(
    containerParentId: string,
    featureIds: readonly string[],
    effectiveTime: TimePoint,
    staged: ReadonlyMap<string, Feature>
  ): void {
    const containerParent = staged.get(containerParentId);
    if (!containerParent || !containerParent.existsAt(effectiveTime)) {
      throw new FeatureParentTransferError(
        `新規上位領域の所属先 "${containerParentId}" が指定時刻に存在しません`
      );
    }
    if (containerParent.featureType !== 'Polygon') {
      throw new FeatureParentTransferError('新規上位領域の所属先には面情報のみ指定できます');
    }
    const targets = featureIds
      .map((id) => staged.get(id))
      .filter((feature): feature is Feature => feature !== undefined);
    this.assertParentCoversTargetRanges(containerParent, targets, effectiveTime);
  }

  /**
   * 新規上位領域作成サブフローのコンテナチェーンを構築する（要件定義書 §2.1 line 290-293 再帰積み上げ）。
   *
   * 返り値は innermost → outermost の順:
   * - 最内（index 0）: childIds = featureIds（移動対象）、name/kind = levels[0]。
   * - 中間/最外（index k≥1）: childIds = [直前コンテナ.id]、name/kind = levels[k]。
   * - 最外: parentId = finalParentId（null = 連邦化 / 非 null = 自治化）。中間: parentId = 直上コンテナ.id。
   *
   * 親子の ID は相互依存（子は親の id、親は子の id を要する）のため、まず親 null で innermost →
   * outermost に順次構築し（各段は直前段を子に持つので childIds は確定）、構築後に内側コンテナの
   * parentId を直上コンテナへ付け替える 2 パスで解決する。各構築は childIds 非空のため
   * 「shape なし ⟹ childIds 非空」不変条件を生成時に保証する（§6.6.8 / buildContainerFeature が拒否）。
   */
  private buildCreatedContainerChain(
    effectiveTime: TimePoint,
    featureIds: readonly string[],
    levels: readonly NewParentContainerSpec[],
    finalParentId: string | null
  ): Feature[] {
    const chain: Feature[] = [];
    let childIdsForLevel: readonly string[] = featureIds;
    for (let index = 0; index < levels.length; index++) {
      const level = levels[index];
      const isOutermost = index === levels.length - 1;
      const container = this.featureUseCase.buildContainerFeature(
        effectiveTime,
        childIdsForLevel,
        {
          name: level.name,
          description: '',
          ...(level.kind !== undefined ? { kind: level.kind } : {}),
        },
        isOutermost ? finalParentId : null
      );
      chain.push(container);
      childIdsForLevel = [container.id];
    }
    for (let index = 0; index < chain.length - 1; index++) {
      chain[index] = withContainerParent(chain[index], chain[index + 1].id);
    }
    return chain;
  }

  /**
   * 新規コンテナチェーンの childIds を「直前コンテナの実寿命」へ同期し、各段の空 childIds 区間を
   * 剪定する。最後に最外コンテナを所属先 Q（自治化）へ同期する。
   *
   * 最内（index 0）は既に移動対象との同期済み（`updateParentChildIdsFromTime` で newParent として処理）
   * のため剪定のみ。中間/最外（index k≥1）は剪定後の直前コンテナの実寿命へ childIds を絞ってから剪定する。
   * この「子追加 → 剪定 → 次段同期」の順序により、各段が直前段の実寿命でのみ子に持ち、validateStagedHierarchy
   * が「親が子を主張するが子非存在」の区間で誤拒否する失敗モードを防ぐ（単一コンテナ自治化と同じ順序保証）。
   *
   * 正常フロー（移動対象が effectiveTime に有効）では各段が effectiveTime に子を持つため消滅しないが、
   * 直前コンテナが全子喪失で消滅した場合は当該段も唯一の子を失うため連鎖消滅させる（防御分岐）。
   */
  private syncCreatedContainerChain(
    staged: Map<string, Feature>,
    changedFeatureIds: Set<string>,
    effectiveTime: TimePoint,
    usedAnchorIds: Set<string>,
    createdContainerIds: readonly string[],
    finalParentId: string | null
  ): void {
    let previousPruned: Feature | null = null;
    for (let index = 0; index < createdContainerIds.length; index++) {
      const containerId = createdContainerIds[index];
      const current = staged.get(containerId);
      if (!current) {
        previousPruned = null;
        continue;
      }
      if (index > 0 && previousPruned === null) {
        // 直前コンテナ消滅 → 唯一の子を失うため連鎖消滅（防御分岐: 正常フロー未到達）。
        staged.delete(containerId);
        changedFeatureIds.add(containerId);
        continue;
      }

      const synced = index === 0
        ? current
        : this.updateParentChildIdsFromTime(current, effectiveTime, usedAnchorIds, [previousPruned!]);
      const pruned = pruneEmptyContainerAnchors(synced);
      changedFeatureIds.add(containerId);
      if (pruned === null) {
        staged.delete(containerId);
        previousPruned = null;
      } else {
        staged.set(containerId, pruned);
        previousPruned = pruned;
      }
    }

    // 自治化（要件定義書 §2.1 line 305）: 最外コンテナを所属先 Q の下位領域へ同期する（親 ≡ 子の和の維持）。
    // 剪定後の最外を渡すことで Q は最外の実寿命でのみ子に持つ（差分空で最外が消滅した場合は同期不要）。
    if (finalParentId !== null && previousPruned !== null) {
      const containerParent = staged.get(finalParentId);
      if (containerParent) {
        const updated = this.updateParentChildIdsFromTime(
          containerParent,
          effectiveTime,
          usedAnchorIds,
          [previousPruned]
        );
        this.stageFeature(staged, changedFeatureIds, containerParent, updated);
      }
    }
  }

  private updatePlacementFromTime(
    feature: Feature,
    effectiveTime: TimePoint,
    usedAnchorIds: Set<string>,
    updater: (placement: AnchorPlacement) => AnchorPlacement
  ): Feature {
    const updatedAnchors: FeatureAnchor[] = [];
    let changed = false;

    for (const anchor of feature.anchors) {
      if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
        updatedAnchors.push(anchor);
        continue;
      }

      const startsAtOrAfter = anchor.timeRange.start.isAtOrAfter(effectiveTime);
      if (startsAtOrAfter) {
        const updatedPlacement = updater(anchor.placement);
        if (samePlacement(anchor.placement, updatedPlacement)) {
          updatedAnchors.push(anchor);
        } else {
          updatedAnchors.push(anchor.withPlacement(updatedPlacement));
          changed = true;
        }
        continue;
      }

      const updatedPlacement = updater(anchor.placement);
      if (samePlacement(anchor.placement, updatedPlacement)) {
        updatedAnchors.push(anchor);
        continue;
      }

      updatedAnchors.push(anchor.withTimeRange({
        start: anchor.timeRange.start,
        end: effectiveTime,
      }));
      updatedAnchors.push(new FeatureAnchor(
        this.createSplitAnchorId(anchor.id, usedAnchorIds),
        { start: effectiveTime, end: anchor.timeRange.end },
        anchor.property,
        anchor.shape,
        updatedPlacement
      ));
      changed = true;
    }

    return changed ? feature.withAnchors(updatedAnchors) : feature;
  }

  private updateParentChildIdsFromTime(
    feature: Feature,
    effectiveTime: TimePoint,
    usedAnchorIds: Set<string>,
    targetFeatures: readonly Feature[],
    targetFeatureIds = new Set(targetFeatures.map((target) => target.id))
  ): Feature {
    const updatedAnchors: FeatureAnchor[] = [];
    let changed = false;

    for (const anchor of feature.anchors) {
      if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
        updatedAnchors.push(anchor);
        continue;
      }

      const segmentStart = anchor.timeRange.start.isBefore(effectiveTime)
        ? effectiveTime
        : anchor.timeRange.start;
      const segments = buildParentChildSegments(
        anchor,
        segmentStart,
        targetFeatures,
        targetFeatureIds
      );

      if (segments.length === 1 &&
        samePlacement(anchor.placement, segments[0].placement) &&
        sameOptionalTime(anchor.timeRange.end, segments[0].end)) {
        updatedAnchors.push(anchor);
        continue;
      }

      changed = true;
      if (anchor.timeRange.start.isBefore(effectiveTime)) {
        updatedAnchors.push(anchor.withTimeRange({
          start: anchor.timeRange.start,
          end: effectiveTime,
        }));
      }

      let usesOriginalId = !anchor.timeRange.start.isBefore(effectiveTime);
      for (const segment of segments) {
        const anchorId = usesOriginalId
          ? anchor.id
          : this.createSplitAnchorId(anchor.id, usedAnchorIds);
        usesOriginalId = false;
        updatedAnchors.push(new FeatureAnchor(
          anchorId,
          segment.end ? { start: segment.start, end: segment.end } : { start: segment.start },
          anchor.property,
          anchor.shape,
          segment.placement
        ));
      }
    }

    return changed ? feature.withAnchors(updatedAnchors) : feature;
  }

  private validateStagedHierarchy(
    staged: ReadonlyMap<string, Feature>,
    effectiveTime: TimePoint,
    changedFeatureIds: ReadonlySet<string>
  ): void {
    // 「shape なし ⟹ childIds 非空」不変条件の結果状態検証（開発ガイド §6.1.8 / §6.6.8）。
    // 各変異サイトの剪定（pruneEmptyContainerAnchors / removeEmptyParentRangesFromTime）が
    // 経路ごとに分散しているため、剪定漏れの回帰は経路ゲートでは検出できない。漏れると
    // 実行時は沈黙し、保存後の次回ロード（validateShapePresence）で初めて拒否される
    // 「保存できるが開けないファイル」になるため、変異後の staged 状態をここで走査して
    // 操作ごと拒否する。
    // なお削除経路（HierarchyService.planFeatureRemoval）に同等のゲートは意図的に置かない:
    // 削除側の剪定は単一共有経路（sweepReferencesToDeleted, B31-B33 で統一済み）+ 同一述語
    // （isEmptyContainerAnchor）共有のため分散リスクがない。削除経路に第 2 の剪定サイトが
    // 生まれた時点でゲート追加を検討する（2026-06-10 レビュー判断）。
    for (const feature of staged.values()) {
      if (!changedFeatureIds.has(feature.id)) continue;
      for (const anchor of feature.anchors) {
        if (isEmptyContainerAnchor(anchor)) {
          throw new FeatureParentTransferError(
            `地物 "${feature.id}" の錨 "${anchor.id}" が「形状なし・下位領域なし」の不正状態になります（剪定漏れ）`
          );
        }
      }
    }

    const validationTimes = collectValidationTimes([...staged.values()], effectiveTime);
    for (const time of validationTimes) {
      const errors = validateHierarchy([...staged.values()], time)
        .concat(validateChildReferences([...staged.values()], time))
        .filter((error) => changedFeatureIds.has(error.featureId));
      if (errors.length > 0) {
        throw new FeatureParentTransferError(errors[0].message);
      }
    }
  }

  private stageFeature(
    staged: Map<string, Feature>,
    changedFeatureIds: Set<string>,
    original: Feature,
    updated: Feature
  ): void {
    if (updated === original) return;
    staged.set(updated.id, updated);
    changedFeatureIds.add(updated.id);
  }

  private stageFeatureDeletion(
    staged: Map<string, Feature>,
    changedFeatureIds: Set<string>,
    original: Feature
  ): void {
    staged.delete(original.id);
    changedFeatureIds.add(original.id);
  }

  private cascadeParentCleanup(
    staged: Map<string, Feature>,
    changedFeatureIds: Set<string>,
    effectiveTime: TimePoint,
    usedAnchorIds: Set<string>,
    queue: CascadingParentSync[]
  ): void {
    while (queue.length > 0) {
      const current = queue.shift()!;
      const updatedChild = staged.get(current.original.id) ?? null;
      const targetFeatures = updatedChild ? [updatedChild] : [];
      const targetFeatureIds = new Set([current.original.id]);

      for (const parentId of collectParentIdsFromTime(current.original, effectiveTime)) {
        const parent = staged.get(parentId);
        if (!parent) continue;

        const updatedParent = this.updateParentChildIdsFromTime(
          parent,
          effectiveTime,
          usedAnchorIds,
          targetFeatures,
          targetFeatureIds
        );
        const prunedParent = this.removeEmptyParentRangesFromTime(
          parent,
          updatedParent,
          effectiveTime,
          [current.original.id]
        );

        if (prunedParent) {
          this.stageFeature(staged, changedFeatureIds, parent, prunedParent);
          if (prunedParent !== updatedParent) {
            queue.push({ original: parent });
          }
        } else {
          this.stageFeatureDeletion(staged, changedFeatureIds, parent);
          queue.push({ original: parent });
        }
      }
    }
  }

  /**
   * 旧親から子を除去した結果「childIds が空になった effectiveTime 以降の区間」の錨を剪定する。
   * 対象は「除去された子を元々持っていた区間」のみ（`didLoseRemovedChildren`）で、
   * 元から空だった無関係な区間は触らない。全錨が消えたら null（地物ごと消滅）。
   *
   * **削除経路との意図的な非対称**: 削除経路（`HierarchyService.sweepReferencesToDeleted`）は
   * 「shape を保持する錨は childIds が空になっても残す（末端地物へ戻る）」が、本関数は
   * shape の有無を確認せず剪定する。所属変更では除去された子地物が**別の場所に存続する**ため、
   * 旧親が移行期間ノード（shape あり + childIds 非空。外部生成 .gimoza 由来のみ）だった場合に
   * shape を末端として温存すると、存続する子と領土が重複し末端地物排他（要件定義書 §2.1）へ
   * 違反する。削除経路では子自体が消滅するため温存しても重複しない。純粋な集約地物
   * （shape なし）ではどちらの経路も同じ挙動になる。移行期間ノードの shape 取り扱いポリシー
   * 全般は現状.md B34 で追跡中（仕様確定待ち）。
   *
   * **結合経路（`mergeLeafFeatures`）からの呼び出しの根拠は別**: 結合では除去された子
   * （結合対象）は存在終了して消滅するため上記の排他重複は生じないが、子を全て失った
   * 旧親区間の剪定は要件定義書 §2.1 line 349「旧親領域がいずれも下位領域を全て失う結果に
   * なる場合、当該時刻以降の旧親領域は自動的に消滅する」が直接規定する仕様挙動であり、
   * shape 温存（削除経路の「末端へ戻る」）へ揃えてはいけない。
   */
  private removeEmptyParentRangesFromTime(
    original: Feature,
    feature: Feature,
    effectiveTime: TimePoint,
    removedChildIds: readonly string[]
  ): Feature | null {
    const anchors: FeatureAnchor[] = [];
    let changed = false;
    const removedChildIdSet = new Set(removedChildIds);

    for (const anchor of feature.anchors) {
      if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
        anchors.push(anchor);
        continue;
      }

      if (anchor.timeRange.start.isBefore(effectiveTime)) {
        anchors.push(anchor);
        continue;
      }

      if (anchor.placement.childIds.length === 0 &&
        this.didLoseRemovedChildren(original, anchor.timeRange.start, removedChildIdSet)) {
        changed = true;
        continue;
      }
      anchors.push(anchor);
    }

    if (anchors.length === 0) return null;
    return changed ? feature.withAnchors(anchors) : feature;
  }

  private didLoseRemovedChildren(
    original: Feature,
    time: TimePoint,
    removedChildIds: ReadonlySet<string>
  ): boolean {
    const originalAnchor = original.getActiveAnchor(time);
    if (!originalAnchor) return false;
    return originalAnchor.placement.childIds.some((childId) => removedChildIds.has(childId));
  }

  /**
   * 末端地物 → 集約地物の遷移時の直轄領自動生成（要件定義書 §2.1 line 226-229 / §6.4）。
   *
   * 遷移した地物（新親）の effectiveTime 以降の各錨について、子の獲得で「shape あり Polygon +
   * childIds 非空」（移行期間ノード）になった区間を検出し:
   *   - 旧形状 − 下位領域の和 の差分（`polygonDifferenceAll`）を算出する。
   *   - 差分が非空なら新規末端地物（直轄領）を生成し、当該錨の下位領域へ追加する。
   *     名称はデフォルト「`<元名> 直轄領`」＋種別は元末端地物から継承するが、ダイアログからの
   *     上書き（`override`）が指定されていればそれを優先する（§2.1 line 228）。
   *     差分が複数領域に分かれる場合は 1 末端地物の複数領土リング（飛び地化）で保持する
   *     （§2.1 line 229 / §6.6.2 / §6.6.5）。
   *   - 差分が空（下位領域が旧形状を完全に覆う）なら直轄領は生成しない（§2.1 line 230）。
   *   - いずれの場合も新親の shape を破棄し集約地物化する（§2.1 line 225）。childIds は移動子＋
   *     直轄領で必ず非空のため「shape なし ⟹ childIds 非空」不変条件を維持する（§6.6.8）。
   *
   * 直轄領は旧形状の部分集合（差分は面積を増やさない）であり、旧形状は遷移前に末端地物排他
   * （地図全体）を満たしていたため、直轄領は他の末端地物とも下位領域とも空間的に重ならない。
   * よって本経路は空間競合を構造上生まず、§2.2.3 整合性維持プロセスの起動配線は不要
   * （要件定義書 §2.1 line 145-153 / 開発ガイド §6.6.8）。
   *
   * 既知の単純化（現スコープでは実害なし）: 遷移地物が effectiveTime 以降に複数の移行期間ノード錨を
   * 持つ（名称変更等で既に区間分割済みの）場合、錨ごとに別 ID の直轄領を生成するため、同一領域が
   * 連続区間で別地物に分かれ得る。構造的には有効（各区間で親≡子の和は成立）。1 地物の複数錨へ
   * まとめる方が自然な可能性があり、将来の精緻化候補。
   */
  private resolveLeafToContainerTransition(
    staged: Map<string, Feature>,
    changedFeatureIds: Set<string>,
    createdVertices: Map<string, Vertex>,
    effectiveTime: TimePoint,
    transitionFeatureId: string,
    override?: DirectlyGovernedOverrideSpec
  ): void {
    const stagedFeature = staged.get(transitionFeatureId);
    if (!stagedFeature) return;

    const allStaged = [...staged.values()];
    // 旧形状（subject）と子の和（clip）を同一の解決規則で揃えるため、両者とも HierarchyService の
    // `resolvePolygonAnchorPolygons`（subject）/ `deriveParentPolygons`（clip = 内部で同関数を使用）で
    // 解決する（§6.6.9: 同じ shape 解決経路を共有。別解決器だと欠落頂点・退化リングの扱いが非対称になる）。
    // 両 API は座標マップ（`ReadonlyMap<string, Coordinate>`）を要するため一度だけ構築する。
    const coordMap = new Map<string, Coordinate>();
    for (const [id, vertex] of this.featureUseCase.getVertices()) {
      coordMap.set(id, vertex.coordinate);
    }

    const newAnchors: FeatureAnchor[] = [];
    let changed = false;

    for (const anchor of stagedFeature.anchors) {
      const shape = anchor.shape;
      // effectiveTime 以降で「shape あり Polygon + childIds 非空」= 子の獲得で生じた移行期間ノード。
      if (
        !anchor.timeRange.start.isAtOrAfter(effectiveTime) ||
        shape === undefined ||
        shape.type !== 'Polygon' ||
        anchor.placement.childIds.length === 0
      ) {
        newAnchors.push(anchor);
        continue;
      }

      changed = true;

      // 旧形状（破棄される末端 shape）を MultiPolygon として解決する（subject）。
      const subjectPolygons = resolvePolygonAnchorPolygons(anchor, coordMap);
      // 子の和（clip）は正規の派生経路 `deriveParentPolygons` で解決し、shape 解決のドリフトを防ぐ
      // （§6.6.9）。この移行期間ノード錨の childIds を子として anchor.start 時点で union 済み
      // MultiPolygon を得る（末端は自身 shape、集約は再帰下降、移行期間ノードは派生空なら自身 shape へ
      // fallback、と同一規則 = `resolveChildPolygonsForUnion`）。clip は polygonDifferenceAll が内部で
      // 結合するため union 済みでも等価。
      // 時間解決の前提（現スコープでは実害なし）: 子形状は遷移錨 start 時点で解決し、生成する直轄領錨は
      // 遷移錨の全 range に適用する。本経路の移動子は range 内で静的なため一致する（単一時刻解決と整合）。
      // 子形状が range 内で変化する将来経路が出た場合は時間スライス分割を要検討。
      const childPolygons = deriveParentPolygons(
        stagedFeature,
        allStaged,
        coordMap,
        anchor.timeRange.start
      );
      const difference = polygonDifferenceAll(subjectPolygons, childPolygons);

      if (difference.isEmpty) {
        // 差分が空: 直轄領は生成せず shape のみ破棄（§2.1 line 230）。
        newAnchors.push(anchor.withShape(undefined));
        continue;
      }

      // 名称・種別の決定（§2.1 line 228）。ダイアログからの上書き（`override`）が指定されていれば
      // それを優先し、未指定（ダイアログ非経由の直接呼び出し）ならデフォルト「`<元名> 直轄領`」＋
      // 元末端地物の種別継承へフォールバックする。
      // - name: 上書きが前後空白除去後に非空ならその名称、空ならデフォルト名称。
      // - kind: 上書き spec が存在すれば override.kind（空文字＝種別なしの明示的除去）、
      //   spec 自体が未指定のときのみ元末端地物の種別を継承する。
      const overrideName = override?.name?.trim();
      const name =
        overrideName !== undefined && overrideName !== ''
          ? overrideName
          : buildDirectlyGovernedDefaultName(anchor.property.name);
      let kind: string | undefined;
      if (override !== undefined) {
        const overrideKind = override.kind?.trim() ?? '';
        kind = overrideKind !== '' ? overrideKind : undefined;
      } else {
        kind = anchor.property.kind;
      }

      const built = this.featureUseCase.buildLeafPolygonFeature(
        anchor.timeRange,
        difference.polygons,
        {
          name,
          description: '',
          ...(kind !== undefined ? { kind } : {}),
        },
        transitionFeatureId
      );
      staged.set(built.feature.id, built.feature);
      changedFeatureIds.add(built.feature.id);
      for (const [vertexId, vertex] of built.vertices) {
        createdVertices.set(vertexId, vertex);
      }

      newAnchors.push(
        anchor
          .withShape(undefined)
          .withPlacement(
            createAnchorPlacement(anchor.placement.parentId, [
              ...anchor.placement.childIds,
              built.feature.id,
            ])
          )
      );
    }

    if (changed) {
      this.stageFeature(
        staged,
        changedFeatureIds,
        stagedFeature,
        stagedFeature.withAnchors(newAnchors)
      );
    }
  }

  private cleanupDeletedFeatureArtifacts(deletedFeatures: readonly Feature[]): void {
    if (deletedFeatures.length === 0) return;

    const features = this.featureUseCase.getFeaturesMap();
    const vertices = this.featureUseCase.getVertices() as Map<string, Vertex>;
    const sharedGroups = this.featureUseCase.getSharedVertexGroups() as Map<string, SharedVertexGroup>;
    const usedVertexIds = collectAllUsedVertexIds(features);
    const removedVertexIds = new Set<string>();

    for (const feature of deletedFeatures) {
      for (const vertexId of collectFeatureVertexIds(feature)) {
        if (usedVertexIds.has(vertexId) || removedVertexIds.has(vertexId)) continue;
        if (vertices.delete(vertexId)) {
          removedVertexIds.add(vertexId);
        }
      }
    }

    if (removedVertexIds.size === 0) return;

    for (const [groupId, group] of sharedGroups) {
      const nextVertexIds = group.vertexIds.filter((vertexId) => !removedVertexIds.has(vertexId));
      if (nextVertexIds.length === group.vertexIds.length) continue;
      if (nextVertexIds.length <= 1) {
        sharedGroups.delete(groupId);
      } else {
        sharedGroups.set(groupId, group.withVertexIds(nextVertexIds));
      }
    }
  }

  private createSplitAnchorId(anchorId: string, usedAnchorIds: Set<string>): string {
    let suffix = 1;
    let candidate = `${anchorId}-parent-${suffix}`;
    while (usedAnchorIds.has(candidate)) {
      suffix += 1;
      candidate = `${anchorId}-parent-${suffix}`;
    }
    usedAnchorIds.add(candidate);
    return candidate;
  }
}

interface ParentChildSegment {
  readonly start: TimePoint;
  readonly end?: TimePoint;
  readonly placement: AnchorPlacement;
}

interface CascadingParentSync {
  readonly original: Feature;
}

function appendUnique(baseIds: readonly string[], idsToAdd: readonly string[]): string[] {
  const result = [...baseIds];
  for (const id of idsToAdd) {
    if (!result.includes(id)) {
      result.push(id);
    }
  }
  return result;
}

/**
 * 新規コンテナ（生成直後の単一開区間錨）の parentId を付け替える（チェーン内側 → 直上コンテナ）。
 * `createAnchorPlacement` 経由で `isTopLevel === (parentId === null)` 同値不変条件を再構築する
 * （現状.md §6.12 / 開発ガイド §6.6.8）。childIds は構築時のまま維持する。
 */
function withContainerParent(container: Feature, parentId: string): Feature {
  const anchors = container.anchors.map((anchor) =>
    anchor.withPlacement(createAnchorPlacement(parentId, anchor.placement.childIds))
  );
  return container.withAnchors(anchors);
}

/**
 * 集約地物（shape を持たない錨）で childIds が空になった区間を剪定する。
 *
 * 不変条件「shape なし ⟹ childIds 非空」（要件定義書 §4.1 / 開発ガイド §6.6.8）を
 * 変異後に再保証する。新規コンテナは `{ start: effectiveTime }` の開区間として生成され、
 * `updateParentChildIdsFromTime` の錨分割で「子を持たない区間」が「shape なし + childIds 空」
 * になり得るため、その区間を落とす。落とす対象は末尾区間に限らない: 子が時間ギャップを持つ
 * （いったん存在を終了し後で再開する）場合は中間の空区間も生じ、本関数は位置を問わず
 * 全ての空 shape なし錨を剪定する（filter は anchor の位置に依存しない）。
 *
 * 全錨が消える場合は下位領域全喪失としてコンテナ消滅を表す null を返す
 * （要件定義書 §2.1「集約地物が全ての下位領域を失った場合、自動的に消滅する」）。
 */
function pruneEmptyContainerAnchors(feature: Feature): Feature | null {
  const anchors = feature.anchors.filter((anchor) => !isEmptyContainerAnchor(anchor));
  if (anchors.length === feature.anchors.length) return feature;
  if (anchors.length === 0) return null;
  return feature.withAnchors(anchors);
}

function samePlacement(a: AnchorPlacement, b: AnchorPlacement): boolean {
  return a.parentId === b.parentId &&
    a.isTopLevel === b.isTopLevel &&
    sameStringArray(a.childIds, b.childIds);
}

function sameStringArray(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((value, index) => value === b[index]);
}

function sameOptionalTime(a: TimePoint | undefined, b: TimePoint | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.equals(b);
}

function collectValidationTimes(
  features: readonly Feature[],
  effectiveTime: TimePoint
): TimePoint[] {
  const times: TimePoint[] = [effectiveTime];
  for (const feature of features) {
    for (const anchor of feature.anchors) {
      if (anchor.timeRange.start.isAtOrAfter(effectiveTime) &&
        !times.some((time) => time.equals(anchor.timeRange.start))) {
        times.push(anchor.timeRange.start);
      }
      if (anchor.timeRange.end && anchor.timeRange.end.isAtOrAfter(effectiveTime) &&
        !times.some((time) => time.equals(anchor.timeRange.end))) {
        times.push(anchor.timeRange.end);
      }
    }
  }
  return times;
}

function buildParentChildSegments(
  anchor: FeatureAnchor,
  segmentStart: TimePoint,
  targetFeatures: readonly Feature[],
  targetFeatureIds: ReadonlySet<string>
): ParentChildSegment[] {
  const boundaryPoints = collectTargetBoundaryPoints(targetFeatures, segmentStart, anchor.timeRange.end);
  const rawSegments: ParentChildSegment[] = [];
  let currentStart = segmentStart;

  for (const boundaryPoint of [...boundaryPoints, anchor.timeRange.end].filter(
    (point): point is TimePoint => point !== undefined
  )) {
    rawSegments.push({
      start: currentStart,
      end: boundaryPoint,
      placement: buildParentPlacementForSegment(anchor.placement, currentStart, targetFeatures, targetFeatureIds),
    });
    currentStart = boundaryPoint;
  }

  if (!anchor.timeRange.end) {
    rawSegments.push({
      start: currentStart,
      placement: buildParentPlacementForSegment(anchor.placement, currentStart, targetFeatures, targetFeatureIds),
    });
  }

  return mergeParentChildSegments(rawSegments);
}

function buildParentPlacementForSegment(
  basePlacement: AnchorPlacement,
  time: TimePoint,
  targetFeatures: readonly Feature[],
  targetFeatureIds: ReadonlySet<string>
): AnchorPlacement {
  const baseChildIds = basePlacement.childIds.filter((childId) => !targetFeatureIds.has(childId));
  const activeTransferredChildIds = targetFeatures
    .filter((feature) => feature.getActiveAnchor(time) !== undefined)
    .map((feature) => feature.id);
  return createAnchorPlacement(
    basePlacement.parentId,
    appendUnique(baseChildIds, activeTransferredChildIds)
  );
}

function mergeParentChildSegments(segments: readonly ParentChildSegment[]): ParentChildSegment[] {
  const merged: ParentChildSegment[] = [];
  for (const segment of segments) {
    const previous = merged[merged.length - 1];
    if (previous &&
      samePlacement(previous.placement, segment.placement) &&
      sameOptionalTime(previous.end, segment.start)) {
      merged[merged.length - 1] = {
        start: previous.start,
        end: segment.end,
        placement: previous.placement,
      };
      continue;
    }
    merged.push(segment);
  }
  return merged;
}

function collectTargetBoundaryPoints(
  targetFeatures: readonly Feature[],
  start: TimePoint,
  end: TimePoint | undefined
): TimePoint[] {
  const points: TimePoint[] = [];
  for (const feature of targetFeatures) {
    for (const anchor of feature.anchors) {
      if (anchor.timeRange.start.isAtOrAfter(start) &&
        !anchor.timeRange.start.equals(start) &&
        isBeforeOptional(anchor.timeRange.start, end) &&
        !points.some((point) => point.equals(anchor.timeRange.start))) {
        points.push(anchor.timeRange.start);
      }
      if (anchor.timeRange.end &&
        anchor.timeRange.end.isAtOrAfter(start) &&
        !anchor.timeRange.end.equals(start) &&
        isBeforeOptional(anchor.timeRange.end, end) &&
        !points.some((point) => point.equals(anchor.timeRange.end))) {
        points.push(anchor.timeRange.end);
      }
    }
  }
  return points.sort((a, b) => a.compareTo(b));
}

function isBeforeOptional(time: TimePoint, end: TimePoint | undefined): boolean {
  return !end || time.isBefore(end);
}

/**
 * 地物の存在を effectiveTime で終了させる（要件定義書 §2.1 line 329「元の末端地物はすべて
 * その時刻に存在を終了する歴史の錨が打たれ」）。
 *
 * - effectiveTime 以前に終了する錨: 保持（存在終了前の歴史・形状・頂点参照は破壊しない）。
 * - effectiveTime を跨ぐ錨: end = effectiveTime へ切り詰める（半開区間 [start, end) のため
 *   ゼロ長錨は生じず、effectiveTime ちょうどから開始する後続地物と隙間も重複もない）。
 * - effectiveTime 以降に開始する錨: 除去（存在終了後の歴史は破棄される）。
 *
 * 全錨が消えた場合（地物が effectiveTime ちょうどに開始していた場合）は null = 地物ごと消滅。
 */
function terminateFeatureExistenceAt(feature: Feature, effectiveTime: TimePoint): Feature | null {
  const kept: FeatureAnchor[] = [];
  let changed = false;
  for (const anchor of feature.anchors) {
    if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
      kept.push(anchor);
      continue;
    }
    if (anchor.timeRange.start.isAtOrAfter(effectiveTime)) {
      changed = true;
      continue;
    }
    kept.push(anchor.withTimeRange({ start: anchor.timeRange.start, end: effectiveTime }));
    changed = true;
  }
  if (kept.length === 0) return null;
  return changed ? feature.withAnchors(kept) : feature;
}

function collectParentIdsFromTime(feature: Feature, effectiveTime: TimePoint): Set<string> {
  const parentIds = new Set<string>();
  for (const anchor of feature.anchors) {
    if (anchor.timeRange.end && !effectiveTime.isBefore(anchor.timeRange.end)) {
      continue;
    }
    if (anchor.placement.parentId !== null) {
      parentIds.add(anchor.placement.parentId);
    }
  }
  return parentIds;
}

function collectUsedAnchorIds(features: ReadonlyMap<string, Feature>): Set<string> {
  const ids = new Set<string>();
  for (const feature of features.values()) {
    for (const anchor of feature.anchors) {
      ids.add(anchor.id);
    }
  }
  return ids;
}

function collectFeatureVertexIds(feature: Feature): Set<string> {
  const ids = new Set<string>();
  for (const anchor of feature.anchors) {
    if (!anchor.shape) continue;
    switch (anchor.shape.type) {
      case 'Point':
        ids.add(anchor.shape.vertexId);
        break;
      case 'LineString':
        for (const vertexId of anchor.shape.vertexIds) {
          ids.add(vertexId);
        }
        break;
      case 'Polygon':
        for (const ring of anchor.shape.rings) {
          for (const vertexId of ring.vertexIds) {
            ids.add(vertexId);
          }
        }
        break;
    }
  }
  return ids;
}

function collectAllUsedVertexIds(features: ReadonlyMap<string, Feature>): Set<string> {
  const ids = new Set<string>();
  for (const feature of features.values()) {
    for (const vertexId of collectFeatureVertexIds(feature)) {
      ids.add(vertexId);
    }
  }
  return ids;
}

function validateChildReferences(
  features: readonly Feature[],
  time: TimePoint
): { featureId: string; message: string }[] {
  const errors: { featureId: string; message: string }[] = [];
  const featureMap = new Map(features.map((feature) => [feature.id, feature]));

  for (const feature of features) {
    const anchor = feature.getActiveAnchor(time);
    if (!anchor) continue;

    for (const childId of anchor.placement.childIds) {
      const child = featureMap.get(childId);
      const childAnchor = child?.getActiveAnchor(time);
      if (!child || !childAnchor) {
        errors.push({
          featureId: feature.id,
          message: `地物 "${feature.id}" の子 "${childId}" が存在しません`,
        });
        continue;
      }
      if (childAnchor.placement.parentId !== feature.id) {
        errors.push({
          featureId: feature.id,
          message: `地物 "${feature.id}" の子 "${childId}" の親参照が一致しません`,
        });
      }
    }
  }

  return errors;
}
