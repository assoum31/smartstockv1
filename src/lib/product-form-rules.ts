type ProtectedProductFields = {
  purchase_price: number;
  system_quantity: number;
};

/** Sellers send protected fields unchanged; purchase price is saved separately by RPC. */
export function productRowForUpdate<T extends ProtectedProductFields>(
  row: T,
  product: ProtectedProductFields | null,
  isManager: boolean,
): T {
  if (!product || isManager) return row;
  return {
    ...row,
    purchase_price: product.purchase_price,
    system_quantity: product.system_quantity,
  };
}
