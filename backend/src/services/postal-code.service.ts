import { z } from 'zod';
import { BizzError } from './bizz-error';
import GeographyService from './geography.service';

const responseSchema = z.object({
  cep: z.string().regex(/^\d{5}-?\d{3}$/),
  logradouro: z.string().trim().max(160),
  bairro: z.string().trim().max(100),
  uf: z.string().regex(/^[A-Z]{2}$/),
  ibge: z.string().regex(/^\d{7}$/)
});
type PostalAddress = {
  postalCode: string;
  street: string;
  neighborhood: string;
  location: { stateCode: string; cityCode: string };
};
const unavailable = () =>
  new BizzError(503, 'Não foi possível consultar o CEP. Preencha o endereço manualmente.');

export class PostalCodeService {
  private readonly cache = new Map<string, { expires: number; address: PostalAddress }>();

  constructor(private readonly request: typeof fetch = (...args) => fetch(...args)) {}

  async lookup(input: string): Promise<PostalAddress> {
    if (!/^\d{5}-?\d{3}$/.test(input))
      throw new BizzError(400, 'Informe um CEP com 8 dígitos.');
    const postalCode = input.replace('-', '');
    const cached = this.cache.get(postalCode);
    if (cached && cached.expires > Date.now()) return cached.address;
    this.cache.delete(postalCode);
    try {
      const response = await this.request(`https://viacep.com.br/ws/${postalCode}/json/`, {
        headers: { Accept: 'application/json' },
        redirect: 'error',
        signal: AbortSignal.timeout(5000)
      });
      if (!response.ok) throw unavailable();
      const raw: unknown = await response.json();
      if (
        raw &&
        typeof raw === 'object' &&
        'erro' in raw &&
        (raw.erro === true || raw.erro === 'true')
      )
        throw new BizzError(404, 'CEP não encontrado. Preencha o endereço manualmente.');
      const data = responseSchema.parse(raw);
      const city = GeographyService.city(data.ibge);
      if (data.cep.replace('-', '') !== postalCode || !city || city.stateCode !== data.uf)
        throw unavailable();
      const address = {
        postalCode,
        street: data.logradouro,
        neighborhood: data.bairro,
        location: { stateCode: city.stateCode, cityCode: city.code }
      };
      if (this.cache.size >= 500) this.cache.delete(this.cache.keys().next().value!);
      this.cache.set(postalCode, { address, expires: Date.now() + 60 * 60 * 1000 });
      return address;
    } catch (error) {
      if (error instanceof BizzError) throw error;
      throw unavailable();
    }
  }
}

export default new PostalCodeService();
