import Geography from '../../src/services/geography.service';
import { contactAddress } from '../../src/services/bizz-contact-address';

describe('shared Brazilian reference catalog and contact addresses', () => {
  it('contains unique official codes and valid state associations', () => {
    expect(Geography.states()).toHaveLength(27);
    const all = Geography.states().flatMap((state) => Geography.cities(state.code)!);
    expect(all.length).toBeGreaterThanOrEqual(5571);
    expect(new Set(all.map((city) => city.code)).size).toBe(all.length);
    expect(all.every((city) => /^\d{7}$/.test(city.code))).toBe(true);
    expect(Geography.city('3509502')).toMatchObject({ name: 'Campinas', stateCode: 'SP' });
    expect(Geography.city('5300108')).toMatchObject({ name: 'Brasília', stateCode: 'DF' });
  });
  it('matches legacy names only with a known state and country', () => {
    expect(
      Geography.match({ country: 'Brasil', state: 'São Paulo', city: 'sao paulo' })
    ).toEqual({ stateCode: 'SP', cityCode: '3550308' });
    expect(Geography.match({ state: 'SP', city: 'Cidade inexistente' })).toBeNull();
    expect(Geography.match({ city: 'Campinas' })).toBeNull();
    expect(Geography.match({ country: 'Portugal', state: 'SP', city: 'Campinas' })).toBeNull();
  });
  it('uses authoritative names and rejects a city from another state or invented codes', () => {
    expect(
      contactAddress({ city: 'Outro texto' }, { stateCode: 'SP', cityCode: '3509502' })
    ).toEqual({ city: 'Campinas', state: 'SP', country: 'Brasil', cityIbgeCode: '3509502' });
    for (const location of [
      { stateCode: 'RJ', cityCode: '3509502' },
      { stateCode: null, cityCode: '3509502' },
      { stateCode: 'SP', cityCode: '0000000' },
      { stateCode: 'XX', cityCode: null }
    ])
      expect(() => contactAddress({}, location)).toThrow();
  });
  it('preserves unresolved addresses on unrelated edits but validates replacements', () => {
    const previous = { country: 'Portugal', state: 'Lisboa', city: 'Lisboa' };
    expect(contactAddress({}, undefined, previous)).toEqual({});
    expect(contactAddress(previous, undefined, previous)).toEqual({});
    expect(() => contactAddress({ city: 'Outra cidade' }, undefined, previous)).toThrow();
    expect(
      contactAddress(previous, { stateCode: 'SP', cityCode: '3509502' }, previous)
    ).toMatchObject({ city: 'Campinas', state: 'SP', cityIbgeCode: '3509502' });
  });
  it('clears the old city code when changing or clearing the state', () => {
    const previous = {
      city: 'Campinas',
      state: 'SP',
      country: 'Brasil',
      cityIbgeCode: '3509502'
    };
    expect(contactAddress(previous, { stateCode: 'RJ', cityCode: null }, previous)).toEqual({
      country: 'Brasil',
      state: 'RJ',
      city: null,
      cityIbgeCode: null
    });
    expect(contactAddress(previous, { stateCode: null, cityCode: null }, previous)).toEqual({
      country: null,
      state: null,
      city: null,
      cityIbgeCode: null
    });
  });
});
