export interface Repository<T> { find(id: string): T | undefined; save(item: T): void }
export class Order { constructor(public id: string, public total: number) {} }
export class OrderRepository implements Repository<Order> {
  private items = new Map<string, Order>();
  find(id: string) { return this.items.get(id); }
  save(o: Order) { this.items.set(o.id, o); }
}
export class OrderService {
  constructor(private repo: OrderRepository) {}
  placeOrder(id: string, total: number) { const o = new Order(id, total); this.repo.save(o); return o; }
}
