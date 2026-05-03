export function arrayMove(arr, from, to) {
  if (from === to || from < 0 || from >= arr.length) return arr;
  const clamped = Math.max(0, Math.min(to, arr.length - 1));
  const next = arr.slice();
  const [item] = next.splice(from, 1);
  next.splice(clamped, 0, item);
  return next;
}
