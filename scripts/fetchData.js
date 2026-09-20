#!/usr/bin/env node
/**
 * npm run fetch:data
 *
 * Fetches artwork metadata + images for each museum from the Finna API
 * (api.finna.fi, no key required) and saves everything locally so the app
 * never talks to a live API at runtime:
 *
 *   public/data/artworks/<museumId>.json          - array of artwork records
 *   public/data/artworks/<museumId>/images/<id>.jpg - downloaded images
 *
 * It also updates public/museums/<museumId>.json's artworkSlots[].artworkId
 * fields (in order) to point at the fetched records, so the layout the app
 * already loads picks up real artwork without any other code changes.
 *
 * IMPORTANT: this script was written against Finna's documented API shape
 * but could not be tested against the live API from the sandbox this was
 * built in (outbound access to finna.fi is blocked there). Run it here on
 * a machine with normal internet access; if a field name has drifted from
 * what's implemented below, this script logs the raw first record's keys
 * so the mismatch is easy to spot and fix.
 *
 * Only records whose image rights are public domain, CC0, or CC BY are
 * kept - see `isReusableLicense`.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const FINNA_BASE = 'https://api.finna.fi/api/v1';

/**
 * One entry per museum. `buildingFilter` narrows results to that
 * organisation's collection; `lookfor` is a broad term likely to surface
 * paintings with images. Both can be loosened if a museum's search comes
 * back empty - see the console output for hit counts at each step.
 */
const MUSEUMS = [
  {
    id: 'ateneum',
    name: 'Ateneum Art Museum',
    lookfor: 'maalaus',
    filters: ['building:"0/Ateneum/"', 'free_online_boolean:"1"'],
    candidatePoolSize: 40,
  },
];

const ACCEPTABLE_LICENSE_PATTERNS = [/public\s*domain/i, /\bCC0\b/i, /\bCC[\s-]?BY([\s-]4\.0)?\b(?!.*NC)(?!.*ND)(?!.*SA)/i];

function isReusableLicense(rightsText) {
  if (!rightsText) return false;
  return ACCEPTABLE_LICENSE_PATTERNS.some((re) => re.test(rightsText));
}

async function finnaSearch({ lookfor, filters, page = 1, limit = 20 }) {
  const params = new URLSearchParams();
  params.set('lookfor', lookfor);
  params.set('type', 'AllFields');
  params.set('page', String(page));
  params.set('limit', String(limit));
  for (const f of filters) params.append('filter[]', f);
  for (const f of ['id', 'title', 'images']) params.append('field[]', f);

  const url = `${FINNA_BASE}/search?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finna search failed: ${res.status} ${res.statusText} (${url})`);
  return res.json();
}

async function finnaRecord(id) {
  const params = new URLSearchParams();
  params.set('id', id);
  for (const f of ['id', 'title', 'nonPresenterAuthors', 'year', 'publicationDates', 'measurements', 'summary', 'imageRights', 'images', 'recordPage']) {
    params.append('field[]', f);
  }
  const url = `${FINNA_BASE}/record?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Finna record fetch failed: ${res.status} ${res.statusText} (${url})`);
  const body = await res.json();
  return body.records?.[0] ?? null;
}

function parseMeasurementsCm(measurements) {
  // Finna measurement strings look like "60 cm x 45 cm" or "60 x 45 cm".
  if (!Array.isArray(measurements) || measurements.length === 0) return null;
  const match = measurements[0].match(/(\d+(?:[.,]\d+)?)\s*cm?\s*x\s*(\d+(?:[.,]\d+)?)/i);
  if (!match) return null;
  const widthCm = parseFloat(match[1].replace(',', '.'));
  const heightCm = parseFloat(match[2].replace(',', '.'));
  if (!Number.isFinite(widthCm) || !Number.isFinite(heightCm)) return null;
  return { widthCm, heightCm };
}

async function downloadImage(relativeOrAbsoluteUrl, destPath) {
  const url = relativeOrAbsoluteUrl.startsWith('http') ? relativeOrAbsoluteUrl : `https://api.finna.fi${relativeOrAbsoluteUrl}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image download failed: ${res.status} ${res.statusText} (${url})`);
  const buffer = Buffer.from(await res.arrayBuffer());
  await writeFile(destPath, buffer);
  return buffer.length;
}

async function fetchMuseum(museum) {
  console.log(`\n=== ${museum.name} (${museum.id}) ===`);

  const layoutPath = path.join(ROOT, 'public', 'museums', `${museum.id}.json`);
  const layout = JSON.parse(await readFile(layoutPath, 'utf8'));
  const slots = layout.floors.flatMap((f) => f.artworkSlots ?? []);
  console.log(`Layout has ${slots.length} artwork slot(s) to fill.`);

  const searchResult = await finnaSearch({ lookfor: museum.lookfor, filters: museum.filters, limit: museum.candidatePoolSize });
  const candidates = searchResult.records ?? [];
  console.log(`Search returned ${candidates.length} candidate record(s) (resultCount: ${searchResult.resultCount ?? 'unknown'}).`);
  if (candidates.length === 0) {
    console.warn('No candidates found - check MUSEUMS[].lookfor/filters in this script against a manual query at finna.fi.');
    return { museumId: museum.id, artworks: [] };
  }

  const imagesDir = path.join(ROOT, 'public', 'data', 'artworks', museum.id, 'images');
  await mkdir(imagesDir, { recursive: true });

  const artworks = [];
  let loggedRawSample = false;

  for (const candidate of candidates) {
    if (artworks.length >= slots.length && slots.length > 0) break;
    if (!candidate.id) continue;

    let record;
    try {
      record = await finnaRecord(candidate.id);
    } catch (err) {
      console.warn(`  skip ${candidate.id}: ${err.message}`);
      continue;
    }
    if (!record) continue;

    if (!loggedRawSample) {
      console.log('  Sample record keys (for debugging field-name drift):', Object.keys(record));
      loggedRawSample = true;
    }

    const rightsText = record.imageRights?.copyright ?? record.imageRights?.description ?? '';
    if (!isReusableLicense(rightsText)) {
      console.log(`  skip ${record.id}: license not reusable ("${rightsText || 'none listed'}")`);
      continue;
    }

    const imagePath = record.images?.[0];
    if (!imagePath) {
      console.log(`  skip ${record.id}: no image`);
      continue;
    }

    const safeId = record.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const imageFile = `${safeId}.jpg`;
    try {
      const bytes = await downloadImage(imagePath, path.join(imagesDir, imageFile));
      console.log(`  ok ${record.id}: "${record.title}" (${(bytes / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.warn(`  skip ${record.id}: ${err.message}`);
      continue;
    }

    const dimensions = parseMeasurementsCm(record.measurements);
    const artist = record.nonPresenterAuthors?.[0]?.name ?? 'Unknown artist';
    const year = record.year ?? (Array.isArray(record.publicationDates) ? record.publicationDates[0] : undefined) ?? 'Unknown date';

    artworks.push({
      id: record.id,
      title: record.title ?? 'Untitled',
      artist,
      year: String(year),
      description: Array.isArray(record.summary) ? record.summary.join(' ') : record.summary ?? '',
      dimensions: dimensions
        ? { widthCm: dimensions.widthCm, heightCm: dimensions.heightCm, source: 'measured' }
        : { widthCm: 60, heightCm: 45, source: 'fallback' },
      license: rightsText,
      attribution: record.imageRights?.description ?? museum.name,
      sourceUrl: record.recordPage ? `https://www.finna.fi${record.recordPage}` : `https://www.finna.fi/Record/${encodeURIComponent(record.id)}`,
      localImage: `data/artworks/${museum.id}/images/${imageFile}`,
    });
  }

  console.log(`Kept ${artworks.length} reusable-license artwork(s) for ${museum.id}.`);

  const outPath = path.join(ROOT, 'public', 'data', 'artworks', `${museum.id}.json`);
  await writeFile(outPath, JSON.stringify(artworks, null, 2));
  console.log(`Wrote ${outPath}`);

  if (artworks.length > 0) {
    let slotIndex = 0;
    for (const floor of layout.floors) {
      for (const slot of floor.artworkSlots ?? []) {
        if (slotIndex >= artworks.length) break;
        slot.artworkId = artworks[slotIndex].id;
        slotIndex += 1;
      }
    }
    await writeFile(layoutPath, JSON.stringify(layout, null, 2));
    console.log(`Updated ${slotIndex} slot(s) in ${layoutPath} to reference fetched artworkIds.`);
  }

  return { museumId: museum.id, artworks };
}

async function main() {
  for (const museum of MUSEUMS) {
    try {
      await fetchMuseum(museum);
    } catch (err) {
      console.error(`Failed to fetch data for ${museum.id}:`, err.message);
      process.exitCode = 1;
    }
  }
}

main();
