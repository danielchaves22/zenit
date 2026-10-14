import catalog from '../data/brazil-geography.json';

export type BrazilLocation = { stateCode: string | null; cityCode: string | null };
type Address = {
  country?: string | null;
  state?: string | null;
  city?: string | null;
  cityIbgeCode?: string | null;
};
const key = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase();
const citiesByCode = new Map(catalog.cities.map((city) => [city.code, city]));
const citiesByState = new Map(
  catalog.states.map((state) => [
    state.code,
    catalog.cities.filter((city) => city.stateCode === state.code)
  ])
);

/** Global, versioned IBGE reference data, independent of company and application. */
export default class GeographyService {
  static states() {
    return catalog.states;
  }
  static cities(stateCode: string) {
    return citiesByState.get(stateCode);
  }
  static city(code: string) {
    return citiesByCode.get(code);
  }
  static isBrazil(country?: string | null) {
    return !country || ['BR', 'BRASIL', 'BRAZIL'].includes(key(country));
  }
  static state(value: string) {
    return catalog.states.find(
      (state) => state.code === key(value) || key(state.name) === key(value)
    );
  }

  // Resolve only an unambiguous city within a known Brazilian state. Never guess by city alone.
  static match(address: Address): BrazilLocation | null {
    if (!this.isBrazil(address.country)) return null;
    if (address.cityIbgeCode) {
      const city = this.city(address.cityIbgeCode);
      if (city) return { stateCode: city.stateCode, cityCode: city.code };
    }
    if (!address.state && !address.city) return { stateCode: null, cityCode: null };
    const state = this.state(address.state ?? '');
    if (!state) return null;
    if (!address.city) return { stateCode: state.code, cityCode: null };
    const matches = this.cities(state.code)!.filter(
      (city) => key(city.name) === key(address.city!)
    );
    return matches.length === 1 ? { stateCode: state.code, cityCode: matches[0].code } : null;
  }
}
