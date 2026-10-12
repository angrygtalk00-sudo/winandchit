export const PRODUCT_UPDATED_EVENT = 'winandchit:product-updated'
export const PRODUCT_UPDATED_STORAGE_KEY = 'winandchit_product_updated'

export function notifyProductUpdated(productId, created = false) {
  const update = { productId: String(productId || ''), created, updatedAt: Date.now() }
  try { sessionStorage.removeItem('catalog_cache_v1') } catch (error) {}
  try { localStorage.setItem(PRODUCT_UPDATED_STORAGE_KEY, JSON.stringify(update)) } catch (error) {}
  window.dispatchEvent(new CustomEvent(PRODUCT_UPDATED_EVENT, { detail: update }))
}

export function notifyProductDeleted(productId) {
  const update = { productId: String(productId || ''), deleted: true, updatedAt: Date.now() }
  try { sessionStorage.removeItem('catalog_cache_v1') } catch (error) {}
  try { localStorage.setItem(PRODUCT_UPDATED_STORAGE_KEY, JSON.stringify(update)) } catch (error) {}
  window.dispatchEvent(new CustomEvent(PRODUCT_UPDATED_EVENT, { detail: update }))
}