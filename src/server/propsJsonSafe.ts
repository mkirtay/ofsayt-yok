/** `getServerSideProps` props'unda `undefined` alanlara izin verilmez; JSON turu ile temizler. */
export function propsJsonSafe<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}
