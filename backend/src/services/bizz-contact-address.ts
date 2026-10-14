import GeographyService, { BrazilLocation } from './geography.service';
import { BizzError } from './bizz-error';

type Address = {
  country?: string | null;
  state?: string | null;
  city?: string | null;
  cityIbgeCode?: string | null;
};
export function contactAddress(input: Address, location?: BrazilLocation, existing?: Address) {
  // A legacy record may be edited without losing an address that cannot be matched safely.
  if (
    location === undefined &&
    existing &&
    ['country', 'state', 'city'].every((field) => {
      const name = field as keyof Address;
      return input[name] === undefined || input[name] === existing[name];
    })
  )
    return {};
  const selected =
    location ?? GeographyService.match({ ...existing, ...input, cityIbgeCode: null });
  if (!selected)
    throw new BizzError(
      400,
      'Selecione um estado e uma cidade da lista. Nesta etapa, os endereços devem ser do Brasil.'
    );
  if (selected.stateCode && !GeographyService.cities(selected.stateCode))
    throw new BizzError(400, 'Selecione um estado válido.');
  const city = selected.cityCode ? GeographyService.city(selected.cityCode) : null;
  if (selected.cityCode && (!city || city.stateCode !== selected.stateCode))
    throw new BizzError(400, 'Selecione uma cidade do estado informado.');
  return {
    country: selected.stateCode ? 'Brasil' : location !== undefined ? null : input.country,
    state: selected.stateCode,
    city: city?.name ?? null,
    cityIbgeCode: city?.code ?? null
  };
}
