import type { ManageLayersUseCase } from '@application/ManageLayersUseCase';
import type { Layer } from '@domain/entities/Layer';

/**
 * レイヤー関連の読み取り専用クエリ。
 */
export class LayerQueryService {
  constructor(private readonly manageLayers: ManageLayersUseCase) {}

  getLayers(): readonly Layer[] {
    return [...this.manageLayers.getLayers()];
  }

  getLayerById(layerId: string): Layer | undefined {
    return this.manageLayers.getLayerById(layerId);
  }
}
