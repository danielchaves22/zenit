// Run from the monorepo root: node backend/scripts/update-brazil-geography.cjs
// Updates a versioned reference catalog; does not connect to the database.
const { mkdir, writeFile } = require('node:fs/promises');
const path = require('node:path');
const source = 'https://servicodados.ibge.gov.br/api/v1/localidades';
async function get(resource) {
  const response = await fetch(`${source}/${resource}`, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`IBGE: ${response.status} (${resource})`);
  return response.json();
}
(async () => {
  const [ufs, municipalities] = await Promise.all([get('estados'), get('municipios')]);
  const states = ufs
    .map(({ id, sigla, nome }) => ({ id, code: sigla, name: nome }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const cities = municipalities
    .map((item) => {
      const uf =
        item.microrregiao?.mesorregiao?.UF ??
        item['regiao-imediata']?.['regiao-intermediaria']?.UF;
      if (!uf || !states.some((state) => state.id === uf.id))
        throw new Error(`Unknown UF: ${item.id}`);
      return { code: String(item.id), name: item.nome, stateCode: uf.sigla };
    })
    .sort(
      (a, b) => a.stateCode.localeCompare(b.stateCode) || a.name.localeCompare(b.name, 'pt-BR')
    );
  if (
    states.length !== 27 ||
    cities.length < 5500 ||
    new Set(cities.map((city) => city.code)).size !== cities.length
  )
    throw new Error('Unexpected IBGE catalog; inspect the source before updating.');
  const catalog = {
    source,
    retrievedAt: new Date().toISOString(),
    countryCode: 'BR',
    states,
    cities
  };
  const dir = path.join(__dirname, '../src/data');
  await mkdir(dir, { recursive: true });
  // One entry per line keeps catalog updates reviewable.
  const json = JSON.stringify(catalog, null, 2).replace(
    /\{\n\s+"(?:id|code)"[^{}]+?\n\s+\}/g,
    (entry) => JSON.stringify(JSON.parse(entry))
  );
  await writeFile(path.join(dir, 'brazil-geography.json'), `${json}\n`);
  console.log(`IBGE catalog: ${states.length} states, ${cities.length} cities.`);
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
