/**
 * Maps over items with at most `limit` concurrent async operations in
 * flight at once. Used to bound how many simultaneous OSRM requests
 * dispatch/hospital scoring fires - without this, scoring N candidates
 * would mean N simultaneous HTTP calls, regardless of how large N gets.
 */
export const mapWithConcurrencyLimit = async (items, limit, fn) => {
  const results = new Array(items.length);
  let index = 0;

  const worker = async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await fn(items[current]);
    }
  };

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);

  return results;
};