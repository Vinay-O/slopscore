export const add = (a, b) => a + b;

export function activeCount(list) {
  return list.filter((u) => u.active).length;
}
