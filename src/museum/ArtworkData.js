/**
 * Loads the local artwork records `npm run fetch:data` writes to
 * public/data/artworks/<museumId>.json. Returns an empty map (not an
 * error) when the file doesn't exist yet, so the app works fine before
 * the fetch script has ever been run - artwork slots just fall back to
 * their placeholder frame (see MuseumBuilder).
 */
export async function loadArtworkData(museumId) {
  const url = `${import.meta.env.BASE_URL}data/artworks/${museumId}.json`;
  let response;
  try {
    response = await fetch(url);
  } catch {
    return new Map();
  }
  if (!response.ok) return new Map();

  let records;
  try {
    records = await response.json();
  } catch {
    return new Map();
  }
  if (!Array.isArray(records)) return new Map();

  return new Map(records.map((record) => [record.id, record]));
}
