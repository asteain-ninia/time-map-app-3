import { describe, it, expect } from 'vitest';
import { Feature } from '@domain/entities/Feature';
import { Vertex } from '@domain/entities/Vertex';
import { FeatureAnchor } from '@domain/value-objects/FeatureAnchor';
import { Ring } from '@domain/value-objects/Ring';
import { TimePoint } from '@domain/value-objects/TimePoint';
import { Coordinate } from '@domain/value-objects/Coordinate';
import { collectMapSceneEntries } from '@presentation/components/mapSceneEntries';
import { hitTest } from '@infrastructure/rendering/hitTestUtils';
import { buildSceneVertexOwnerMap } from '@infrastructure/rendering/vertexSelectionContext';
import { computeRenderWrapOffsets } from '@presentation/components/mapCanvasUtils';
import {
  getFeatureLabelPosition,
  measureFeatureLabelArea,
} from '@presentation/components/labelRendererUtils';
import { geoToWrappedSvgX, geoToSvgY } from '@infrastructure/rendering/featureRenderingUtils';

/**
 * Phase 2-D-6-1+2 で導入した sceneEntries 共通中間表現の対概念整合性を固定する。
 *
 * 「描画される地物 = ヒットテスト対象 = 頂点所有者として現れる地物 = wrapOffsets 算出に
 * 寄与する地物」が同じ集合であることを、同一 sceneEntries 入力から各経路を実行して
 * 検証する（開発ガイド §6.1.2 / §6.6.9 / §6.0.1 検出観点2）。
 *
 * また、Polygon の polygonRings 解決経路（リーフ / コンテナ / 移行期間ノード）が
 * 「描画される領域 = 選択できる領域 = wrapOffsets 算出対象」を同一座標列で表すことを
 * 固定する（§6.6.9 「同じ shape 解決経路を共有する」）。
 */
describe('sceneEntries 経路の対概念整合性', () => {
  const time = new TimePoint(1000);

  function toCoords(vertices: ReadonlyMap<string, Vertex>): ReadonlyMap<string, Coordinate> {
    const m = new Map<string, Coordinate>();
    for (const [id, v] of vertices) m.set(id, v.coordinate);
    return m;
  }

  function pointFeature(id: string, vertexId: string): Feature {
    return new Feature(id, 'Point', [
      new FeatureAnchor(
        `${id}-anchor`,
        { start: new TimePoint(0) },
        { name: id, description: '' },
        { type: 'Point', vertexId },
        { parentId: null, childIds: [], isTopLevel: true }
      ),
    ]);
  }

  function polygonFeature(id: string, vertexIds: string[]): Feature {
    return new Feature(id, 'Polygon', [
      new FeatureAnchor(
        `${id}-anchor`,
        { start: new TimePoint(0) },
        { name: id, description: '' },
        {
          type: 'Polygon',
          rings: [new Ring(`${id}-ring`, vertexIds, 'territory', null)],
        },
        { parentId: null, childIds: [], isTopLevel: true }
      ),
    ]);
  }

  /** childIds を持つ Polygon 地物（コンテナ or 移行期間ノード）を作る */
  function polygonFeatureWithChildren(
    id: string,
    vertexIds: string[] | null, // null なら shape なし（コンテナ）
    childIds: string[]
  ): Feature {
    const shape =
      vertexIds === null
        ? undefined
        : {
            type: 'Polygon' as const,
            rings: [new Ring(`${id}-ring`, vertexIds, 'territory', null)],
          };
    return new Feature(id, 'Polygon', [
      new FeatureAnchor(
        `${id}-anchor`,
        { start: new TimePoint(0) },
        { name: id, description: '' },
        shape,
        { parentId: null, childIds, isTopLevel: true }
      ),
    ]);
  }

  it('同じ sceneEntries から描画対象・hitTest対象・owner map・wrapOffsets が同じ地物集合を扱う', () => {
    const vertices = new Map([
      ['v1', new Vertex('v1', new Coordinate(10, 20))],
      ['v2', new Vertex('v2', new Coordinate(30, 40))],
      ['poly-v1', new Vertex('poly-v1', new Coordinate(900, -10))],
      ['poly-v2', new Vertex('poly-v2', new Coordinate(910, -10))],
      ['poly-v3', new Vertex('poly-v3', new Coordinate(910, 10))],
      ['poly-v4', new Vertex('poly-v4', new Coordinate(900, 10))],
    ]);
    const features = [
      pointFeature('p1', 'v1'),
      pointFeature('p2', 'v2'),
      polygonFeature('poly', ['poly-v1', 'poly-v2', 'poly-v3', 'poly-v4']),
    ];
    const sceneEntries = collectMapSceneEntries(features, time, toCoords(vertices));
    const sceneFeatureIds = new Set(sceneEntries.map((e) => e.feature.id));

    expect(sceneFeatureIds).toEqual(new Set(['p1', 'p2', 'poly']));

    const hitP1 = hitTest(new Coordinate(10, 20), sceneEntries, vertices, 1.0);
    const hitP2 = hitTest(new Coordinate(30, 40), sceneEntries, vertices, 1.0);
    const hitPoly = hitTest(new Coordinate(905, 0), sceneEntries, vertices, 1.0);
    expect(hitP1?.featureId).toBe('p1');
    expect(hitP2?.featureId).toBe('p2');
    expect(hitPoly?.featureId).toBe('poly');

    const ownerMap = buildSceneVertexOwnerMap(sceneEntries);
    expect(ownerMap.get('v1')?.has('p1')).toBe(true);
    expect(ownerMap.get('poly-v1')?.has('poly')).toBe(true);
    const allOwners = new Set<string>();
    for (const owners of ownerMap.values()) {
      for (const id of owners) allOwners.add(id);
    }
    expect(allOwners).toEqual(sceneFeatureIds);

    const offsets = computeRenderWrapOffsets(
      { x: 0, y: 0, width: 360, height: 180 },
      sceneEntries,
      vertices
    );
    expect(offsets).toContain(-720);
    expect(offsets).toContain(-1080);
  });

  it('sceneEntries から除外された地物は hitTest / owner map / wrapOffsets のいずれにも現れない', () => {
    const vertices = new Map([
      ['v-active', new Vertex('v-active', new Coordinate(10, 20))],
      ['v-inactive', new Vertex('v-inactive', new Coordinate(900, 10))],
    ]);
    const features = [
      pointFeature('active', 'v-active'),
      new Feature('inactive', 'Point', [
        new FeatureAnchor(
          'inactive-anchor',
          { start: new TimePoint(3000) },
          { name: 'inactive', description: '' },
          { type: 'Point', vertexId: 'v-inactive' },
          { parentId: null, childIds: [], isTopLevel: true }
        ),
      ]),
    ];
    const sceneEntries = collectMapSceneEntries(features, time, toCoords(vertices));
    const sceneFeatureIds = new Set(sceneEntries.map((e) => e.feature.id));

    expect(sceneFeatureIds).toEqual(new Set(['active']));

    const hitInactive = hitTest(new Coordinate(900, 10), sceneEntries, vertices, 1.0);
    expect(hitInactive).toBeNull();

    const ownerMap = buildSceneVertexOwnerMap(sceneEntries);
    expect(ownerMap.has('v-inactive')).toBe(false);
    expect(ownerMap.has('v-active')).toBe(true);

    const offsets = computeRenderWrapOffsets(
      { x: 0, y: 0, width: 360, height: 180 },
      sceneEntries,
      vertices
    );
    expect(offsets).not.toContain(-720);
    expect(offsets).not.toContain(-1080);
  });

  /**
   * Phase 2.5-B: 集約地物（shape なし + childIds 非空）は派生形状を介して描画・hitTest・
   * wrapOffsets の対象になる（開発ガイド §6.6.9）。頂点 owner map にはコンテナ自身は現れない
   * （コンテナは shape プロパティを持たず頂点を所有しない）。`parentId` の双方向接続が無いと
   * ルートの選定が変わるため、子側の `parentId` を必ず親へ向ける。
   */
  function polygonFeatureWithParent(id: string, vertexIds: string[], parentId: string): Feature {
    return new Feature(id, 'Polygon', [
      new FeatureAnchor(
        `${id}-anchor`,
        { start: new TimePoint(0) },
        { name: id, description: '' },
        {
          type: 'Polygon',
          rings: [new Ring(`${id}-ring`, vertexIds, 'territory', null)],
        },
        { parentId, childIds: [], isTopLevel: false }
      ),
    ]);
  }

  it('集約地物（shape なし + childIds 非空）は描画・hitTest・wrapOffsets に含まれ、頂点 owner map にのみ現れない', () => {
    const vertices = new Map([
      ['leaf-v1', new Vertex('leaf-v1', new Coordinate(0, 0))],
      ['leaf-v2', new Vertex('leaf-v2', new Coordinate(10, 0))],
      ['leaf-v3', new Vertex('leaf-v3', new Coordinate(10, 10))],
      ['leaf-v4', new Vertex('leaf-v4', new Coordinate(0, 10))],
    ]);
    const leaf = polygonFeatureWithParent(
      'leaf',
      ['leaf-v1', 'leaf-v2', 'leaf-v3', 'leaf-v4'],
      'container'
    );
    const container = polygonFeatureWithChildren('container', null, ['leaf']);
    const sceneEntries = collectMapSceneEntries([leaf, container], time, toCoords(vertices));

    // depth 順で container（depth=0）→ leaf（depth=1）の順に並ぶ
    expect(sceneEntries.map((e) => e.feature.id)).toEqual(['container', 'leaf']);

    // hitTest: 派生形状内ならコンテナ・リーフどちらもヒット候補。最初にヒットする entry
    // （container が depth 順で先）が返る。これは Phase 2.5-C で DOM target / depth tie-break で再設計予定
    const hitInside = hitTest(new Coordinate(5, 5), sceneEntries, vertices, 1.0);
    expect(hitInside).not.toBeNull();
    expect(hitInside?.featureId).toBe('container');

    // 派生形状外はヒットしない
    const hitOutside = hitTest(new Coordinate(50, 50), sceneEntries, vertices, 1.0);
    expect(hitOutside).toBeNull();

    // 頂点 owner map: コンテナは shape を持たないため頂点を所有しない。leaf のみ
    const ownerMap = buildSceneVertexOwnerMap(sceneEntries);
    const allOwners = new Set<string>();
    for (const owners of ownerMap.values()) {
      for (const id of owners) allOwners.add(id);
    }
    expect(allOwners).toEqual(new Set(['leaf']));

    // wrapOffsets: leaf 由来の経度範囲（0..10）が反映される。基本タイルのみで十分
    const offsets = computeRenderWrapOffsets(
      { x: 0, y: 0, width: 360, height: 180 },
      sceneEntries,
      vertices
    );
    expect(offsets).toEqual([-360, 0, 360]);
  });

  /**
   * 集約地物の派生形状が遠方経度（基本タイル外）にあるとき、wrapOffsets はその範囲を
   * 反映する必要がある（開発ガイド §6.6.9: 「描画される領域 = wrapOffsets 算出対象」）。
   * 旧 `mapCanvasUtils.getSceneEntryLongitudeBounds` は `if (!anchor.shape) return null;` で
   * 集約地物を即除外しており、コンテナ由来の遠方経度が wrapOffsets に寄与せず偶然 leaf の
   * 経度範囲だけが反映されていた。本テストはコンテナだけが遠方経度を持つ構成で、
   * 派生形状経由で wrapOffsets が拡張されることを固定する。
   */
  it('集約地物の派生形状が遠方経度にあるとき、wrapOffsets がそれを反映する', () => {
    // leaf を遠方（経度 900..910）に配置。コンテナの派生形状は leaf の和 → 遠方経度を含む。
    const vertices = new Map([
      ['far-v1', new Vertex('far-v1', new Coordinate(900, -10))],
      ['far-v2', new Vertex('far-v2', new Coordinate(910, -10))],
      ['far-v3', new Vertex('far-v3', new Coordinate(910, 10))],
      ['far-v4', new Vertex('far-v4', new Coordinate(900, 10))],
    ]);
    const leaf = polygonFeatureWithParent(
      'far-leaf',
      ['far-v1', 'far-v2', 'far-v3', 'far-v4'],
      'far-container'
    );
    const container = polygonFeatureWithChildren('far-container', null, ['far-leaf']);

    const sceneEntries = collectMapSceneEntries([container, leaf], time, toCoords(vertices));

    expect(sceneEntries.map((e) => e.feature.id)).toEqual(['far-container', 'far-leaf']);

    // コンテナ entry を取り出して、polygonRings が遠方経度を保持していることを確認
    const containerEntry = sceneEntries.find((e) => e.feature.id === 'far-container');
    expect(containerEntry).toBeDefined();
    expect(containerEntry!.polygonRings).not.toBeNull();
    const containerXs = containerEntry!.polygonRings![0].map((c) => c.x);
    expect(Math.min(...containerXs)).toBeGreaterThanOrEqual(900);

    // wrapOffsets: コンテナ + leaf 両方が経度 900..910 の範囲を寄与し、隣接ラップタイルが必要
    const offsets = computeRenderWrapOffsets(
      { x: 0, y: 0, width: 360, height: 180 },
      sceneEntries,
      vertices
    );
    // 遠方経度（900..910）は基本タイル（[-360,0,360]）に加えて -720 / -1080 のラップが必要
    expect(offsets).toContain(-720);
    expect(offsets).toContain(-1080);

    // 検証: コンテナだけでも wrapOffsets が同じ遠方範囲をカバーすることを単独で確認
    // （leaf 由来の経度に偶然依存していないこと = §6.6.9 / §6.1.2 遵守の証跡）
    const containerOnlySceneEntries = sceneEntries.filter((e) => e.feature.id === 'far-container');
    const containerOnlyOffsets = computeRenderWrapOffsets(
      { x: 0, y: 0, width: 360, height: 180 },
      containerOnlySceneEntries,
      vertices
    );
    expect(containerOnlyOffsets).toContain(-720);
    expect(containerOnlyOffsets).toContain(-1080);
  });

  it('派生形状を解決できない集約地物は 4 経路すべてから除外される', () => {
    // child が features 配列に含まれない（または vertexCoordinates 空）→ 派生空 → 描画不能
    const vertices = new Map<string, Vertex>();
    const container = polygonFeatureWithChildren('container', null, ['missing-child']);
    const sceneEntries = collectMapSceneEntries([container], time, toCoords(vertices));

    expect(sceneEntries).toEqual([]);

    const hitContainer = hitTest(new Coordinate(5, 5), sceneEntries, vertices, 1.0);
    expect(hitContainer).toBeNull();

    const ownerMap = buildSceneVertexOwnerMap(sceneEntries);
    expect(ownerMap.size).toBe(0);

    const offsets = computeRenderWrapOffsets(
      { x: 0, y: 0, width: 360, height: 180 },
      sceneEntries,
      vertices
    );
    expect(offsets).toEqual([-360, 0, 360]);
  });

  /**
   * shape あり + childIds 非空 = 「移行期間ノード」。Phase 2-C-3 で除外条件と
   * 確立した「shape を保持し childIds 非空」の地物について、§6.6.9 が
   * 「描画される領域 = 選択できる領域 = wrapOffsets 算出対象」を明示的に
   * 回帰テスト対象としているため、3 経路（描画用 polygonRings / hitTest /
   * wrapOffsets）が同じ解決済み座標を共有することを固定する。
   *
   * `deriveParentShape` は子の和を返す純粋関数であり、子が解決できない（features 配列に
   * 含まれない / 派生失敗）ケースでは空を返す。移行期間ノードの「派生空 → 親自身の shape
   * fallback」は呼び出し側 `mapSceneEntries.resolvePolygonRings` の責務であることを固定する。
   */
  describe('shape あり + childIds 非空 の移行期間ノード（§6.6.9 射程）', () => {
    it('派生が空のとき、3 経路が親自身の shape rings に揃う', () => {
      // 親 polygon が shape を持つが、子 ID は features 配列に存在しない →
      // deriveParentShape は children なしで空を返す → 親の shape を fallback として使う。
      // この fallback 座標列が hitTest / wrapOffsets と一致することを固定する。
      const vertices = new Map([
        ['p-v1', new Vertex('p-v1', new Coordinate(0, 0))],
        ['p-v2', new Vertex('p-v2', new Coordinate(20, 0))],
        ['p-v3', new Vertex('p-v3', new Coordinate(20, 20))],
        ['p-v4', new Vertex('p-v4', new Coordinate(0, 20))],
      ]);
      const transitional = polygonFeatureWithChildren(
        'transitional',
        ['p-v1', 'p-v2', 'p-v3', 'p-v4'],
        ['missing-child'] // child が features に存在しない → 派生空
      );
      const sceneEntries = collectMapSceneEntries([transitional], time, toCoords(vertices));

      expect(sceneEntries).toHaveLength(1);
      const polygonRings = sceneEntries[0].polygonRings;
      expect(polygonRings).not.toBeNull();
      // 親の shape rings を fallback として使う
      expect(polygonRings![0]).toEqual([
        { x: 0, y: 0 },
        { x: 20, y: 0 },
        { x: 20, y: 20 },
        { x: 0, y: 20 },
      ]);

      // hitTest: 親の rings 内をクリックすると当該地物がヒット
      const hitInside = hitTest(new Coordinate(10, 10), sceneEntries, vertices, 1.0);
      expect(hitInside?.featureId).toBe('transitional');
      // 親の rings 外はヒットしない
      const hitOutside = hitTest(new Coordinate(30, 30), sceneEntries, vertices, 1.0);
      expect(hitOutside).toBeNull();

      // wrapOffsets: 親の rings の経度範囲（0-20）が反映される（基本タイルのみ）
      const offsets = computeRenderWrapOffsets(
        { x: 0, y: 0, width: 360, height: 180 },
        sceneEntries,
        vertices
      );
      expect(offsets).toEqual([-360, 0, 360]);

      // ラベル位置・面積判定も polygonRings を共有する（開発ガイド §6.6.9）。
      // 親 shape rings の重心 = (10, 10)、面積 = 400。polygonRings は同じ rings の fallback なので一致。
      const labelPos = getFeatureLabelPosition(
        sceneEntries[0].anchor,
        vertices,
        polygonRings
      );
      expect(labelPos?.x).toBe(geoToWrappedSvgX(10));
      expect(labelPos?.y).toBe(geoToSvgY(10));
      const labelArea = measureFeatureLabelArea(
        sceneEntries[0].anchor,
        vertices,
        polygonRings
      );
      expect(labelArea).toBe(400);
    });

    it('派生が空でない子を持つとき、3 経路が派生形状（子の和）に揃う', () => {
      // 親 polygon は広い shape (-50..50) を持つが、子 leaf は (0..10) の狭い領域。
      // deriveParentShape は子の和 = leaf 形状を返すので、3 経路はその座標を使う。
      const vertices = new Map([
        // 親自身の shape rings（fallback として使われるべきでない）
        ['p-big-1', new Vertex('p-big-1', new Coordinate(-50, -50))],
        ['p-big-2', new Vertex('p-big-2', new Coordinate(50, -50))],
        ['p-big-3', new Vertex('p-big-3', new Coordinate(50, 50))],
        ['p-big-4', new Vertex('p-big-4', new Coordinate(-50, 50))],
        // 子 leaf の shape rings（派生で使われる）
        ['c-v1', new Vertex('c-v1', new Coordinate(0, 0))],
        ['c-v2', new Vertex('c-v2', new Coordinate(10, 0))],
        ['c-v3', new Vertex('c-v3', new Coordinate(10, 10))],
        ['c-v4', new Vertex('c-v4', new Coordinate(0, 10))],
      ]);
      const child = polygonFeature('leaf-child', ['c-v1', 'c-v2', 'c-v3', 'c-v4']);
      const transitional = polygonFeatureWithChildren(
        'transitional',
        ['p-big-1', 'p-big-2', 'p-big-3', 'p-big-4'],
        ['leaf-child']
      );
      // features 配列順は親→子（描画順）
      const sceneEntries = collectMapSceneEntries(
        [transitional, child],
        time,
        toCoords(vertices)
      );

      // 親 entry の polygonRings が派生形状（子の狭い領域）を反映する
      const transitionalEntry = sceneEntries.find((e) => e.feature.id === 'transitional');
      expect(transitionalEntry).toBeDefined();
      const parentRings = transitionalEntry!.polygonRings;
      expect(parentRings).not.toBeNull();
      expect(parentRings).toHaveLength(1);
      // 派生形状は子の和 = (0,0)-(10,0)-(10,10)-(0,10) を含むため、X 座標範囲が 0..10 に収まる
      const xs = parentRings![0].map((c) => c.x);
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
      expect(Math.max(...xs)).toBeLessThanOrEqual(10);

      // hitTest: 親自身の shape 内だが派生形状外（例: 25, 25）はヒットしない
      // （これが §6.6.9 の核心。「描画されない領域はクリックできない」）
      const hitOutsideDerived = hitTest(new Coordinate(25, 25), sceneEntries, vertices, 1.0);
      // 子 leaf は (0..10) なので (25, 25) は子にも親派生にもヒットしない
      expect(hitOutsideDerived).toBeNull();
      // 派生領域内（5, 5）は親（または子）がヒット
      const hitInsideDerived = hitTest(new Coordinate(5, 5), sceneEntries, vertices, 1.0);
      expect(hitInsideDerived).not.toBeNull();
      // 親 entry が features 配列順で先 → 最初に hit する
      expect(hitInsideDerived?.featureId).toBe('transitional');

      // wrapOffsets: 親の経度範囲は派生形状の (0..10) ベース。広い shape (-50..50)
      // ベースでないことを確認するため、基本タイル以外は不要
      const offsets = computeRenderWrapOffsets(
        { x: 0, y: 0, width: 360, height: 180 },
        sceneEntries,
        vertices
      );
      expect(offsets).toEqual([-360, 0, 360]);

      // ラベル位置も派生形状ベース。親 shape の重心は (0, 0)（-50..50 平均）だが、
      // 派生形状（子 leaf = 0..10）の重心は (5, 5) 付近に来る。
      // 開発ガイド §6.6.9: 「ラベル位置の基準形状」と「描画される領域」が一致すること。
      const labelPos = getFeatureLabelPosition(
        transitionalEntry!.anchor,
        vertices,
        parentRings
      );
      expect(labelPos).not.toBeNull();
      // ラベル X 座標は派生形状の経度平均（0..10 範囲）に対応した SVG 座標。
      // 親 shape ベース (-50..50 重心 0) なら geoToWrappedSvgX(0) = 180 だが、
      // 派生形状ベースなら 180 ではない値（重心経度が 0..10 に収まる）になる。
      const labelLon = (labelPos!.x - 180);
      expect(labelLon).toBeGreaterThanOrEqual(0);
      expect(labelLon).toBeLessThanOrEqual(10);

      // 面積判定も派生形状ベース（子 leaf の 10x10 = 100）。親 shape の 100x100 = 10000 ではない。
      const labelArea = measureFeatureLabelArea(
        transitionalEntry!.anchor,
        vertices,
        parentRings
      );
      expect(labelArea).toBeLessThanOrEqual(100);
    });
  });
});
