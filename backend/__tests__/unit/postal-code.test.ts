import { PostalCodeService } from '../../src/services/postal-code.service';

const providerAddress = {
  cep: '01001-000',
  logradouro: 'Praça da Sé',
  bairro: 'Sé',
  uf: 'SP',
  ibge: '3550308',
  complemento: 'lado ímpar',
  localidade: 'São Paulo'
};
const address = {
  postalCode: '01001000',
  street: 'Praça da Sé',
  neighborhood: 'Sé',
  location: { stateCode: 'SP', cityCode: '3550308' }
};
const response = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' }
  });

describe('postal code lookup', () => {
  const fetcher = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
  let service: PostalCodeService;
  beforeEach(() => {
    fetcher.mockReset();
    service = new PostalCodeService(fetcher);
  });

  it('resolves the IBGE city, omits the provider complement and caches equivalent CEP formats', async () => {
    fetcher.mockResolvedValue(response(providerAddress));
    expect(await service.lookup('01001000')).toEqual(address);
    expect(await service.lookup('01001-000')).toEqual(address);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('https://viacep.com.br/ws/01001000/json/', {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: expect.any(AbortSignal)
    });
  });
  it('accepts municipal CEPs without street or neighborhood', async () => {
    fetcher.mockResolvedValue(response({ ...providerAddress, logradouro: '', bairro: '' }));
    expect(await service.lookup('01001000')).toEqual({
      ...address,
      street: '',
      neighborhood: ''
    });
  });
  it.each(['', '1234567', '123456789', '../../secret', 'abcdefgh'])(
    'rejects invalid CEP %s before any external request',
    async (cep) => {
      await expect(service.lookup(cep)).rejects.toMatchObject({ status: 400 });
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
  it.each([true, 'true'])('returns not found and allows retry for erro=%s', async (erro) => {
    fetcher
      .mockResolvedValueOnce(response({ erro }))
      .mockResolvedValueOnce(response(providerAddress));
    await expect(service.lookup('01001000')).rejects.toMatchObject({ status: 404 });
    expect(await service.lookup('01001000')).toEqual(address);
  });
  it.each([
    null,
    {},
    { ...providerAddress, cep: '01002-000' },
    { ...providerAddress, uf: 'RJ' },
    { ...providerAddress, ibge: '0000000' },
    { ...providerAddress, logradouro: '<'.repeat(161) }
  ])('rejects incompatible or malformed provider data: %j', async (data) => {
    fetcher.mockResolvedValue(response(data));
    await expect(service.lookup('01001000')).rejects.toMatchObject({ status: 503 });
  });
  it('returns a safe, retryable failure for provider HTTP, network and JSON errors', async () => {
    fetcher
      .mockResolvedValueOnce(response({}, 429))
      .mockRejectedValueOnce(new Error('internal network details'))
      .mockResolvedValueOnce(new Response('invalid json'));
    for (let attempt = 0; attempt < 3; attempt++)
      await expect(service.lookup('01001000')).rejects.toMatchObject({
        status: 503,
        message: 'Não foi possível consultar o CEP. Preencha o endereço manualmente.'
      });
  });
  it('expires cached data after one hour', async () => {
    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1000);
      fetcher
        .mockResolvedValueOnce(response(providerAddress))
        .mockResolvedValueOnce(response(providerAddress));
      await service.lookup('01001000');
      now.mockReturnValue(1000 + 60 * 60 * 1000);
      await service.lookup('01001000');
      expect(fetcher).toHaveBeenCalledTimes(2);
    } finally {
      now.mockRestore();
    }
  });
});
