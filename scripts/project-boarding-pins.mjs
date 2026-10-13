/*
  Projects towns into the /boarding fee map's coordinate space, so a new pin
  lines up with SWISS_OUTLINE_PATH (src/components/boarding/swissOutline.js).

    node scripts/project-boarding-pins.mjs "Altdorf=8.6444,46.8805" "Zug=8.536,47.140"

  Arguments are name=longitude,latitude. Prints x,y for MAP_SCHOOLS in
  src/components/boarding/config.js. Fetches the same Natural Earth outline
  the path was generated from, so the projection matches exactly.
*/
import { geoMercator } from 'd3-geo';
import { feature } from 'topojson-client';

const SOURCE = 'https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json';

const towns = process.argv.slice(2).map((arg) => {
  const [name, coords] = arg.split('=');
  const [lon, lat] = (coords || '').split(',').map(Number);
  if (!name || !Number.isFinite(lon) || !Number.isFinite(lat)) {
    throw new Error(`Expected name=longitude,latitude, got "${arg}"`);
  }
  return { name, lon, lat };
});
if (towns.length === 0) {
  console.error('Usage: node scripts/project-boarding-pins.mjs "Town=lon,lat" ...');
  process.exit(1);
}

const topo = await (await fetch(SOURCE)).json();
const switzerland = feature(topo, topo.objects.countries).features.find((f) => f.id === '756');
const projection = geoMercator().fitExtent([[24, 30], [436, 270]], switzerland);

for (const town of towns) {
  const [x, y] = projection([town.lon, town.lat]);
  console.log(`${town.name}: x: ${x.toFixed(1)}, y: ${y.toFixed(1)}`);
}
