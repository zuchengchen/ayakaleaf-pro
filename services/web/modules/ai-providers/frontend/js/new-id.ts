/** A random id for a new provider or model. */
export function newId() {
  return Math.random().toString(36).slice(2, 12)
}
