/**
 * レイヤーエンティティ
 * 地理情報を階層的に管理するための層。
 */
export class Layer {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly visible: boolean;
  readonly opacity: number;
  readonly description: string;

  constructor(
    id: string,
    name: string,
    order: number,
    visible: boolean = true,
    opacity: number = 1.0,
    description: string = ''
  ) {
    this.id = id;
    this.name = name;
    this.order = order;
    this.visible = visible;
    this.opacity = opacity;
    this.description = description;
  }

  withVisible(visible: boolean): Layer {
    return new Layer(this.id, this.name, this.order, visible, this.opacity, this.description);
  }

  withOpacity(opacity: number): Layer {
    return new Layer(this.id, this.name, this.order, this.visible, opacity, this.description);
  }

  withName(name: string): Layer {
    return new Layer(this.id, name, this.order, this.visible, this.opacity, this.description);
  }

  withOrder(order: number): Layer {
    return new Layer(this.id, this.name, order, this.visible, this.opacity, this.description);
  }

  equals(other: Layer): boolean {
    return this.id === other.id;
  }
}
