import { z } from 'zod';
import { validate } from '../../src/middlewares/validate.middleware';

function createResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
}

describe('validate middleware', () => {
  it('validates query params without rewriting req.body on GET', () => {
    const middleware = validate(z.object({
      search: z.string().optional(),
      page: z.coerce.number().default(1)
    }));

    const req = {
      method: 'GET',
      body: { untouched: true },
      params: {},
      query: { search: 'zenit', page: '2' }
    } as any;
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ untouched: true });
    expect(req.query).toEqual({ search: 'zenit', page: 2 });
  });

  it('keeps params and body separated on mixed-source validation', () => {
    const middleware = validate(z.object({
      id: z.coerce.number(),
      name: z.string().min(1)
    }));

    const req = {
      method: 'PUT',
      body: { name: 'Conta Principal' },
      params: { id: '42' },
      query: {}
    } as any;
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.params).toEqual({ id: 42 });
    expect(req.body).toEqual({ name: 'Conta Principal' });
    expect(req.query).toEqual({});
  });

  it('preserves route params when validating only the request body shape', () => {
    const middleware = validate(z.object({
      name: z.string().min(1)
    }));

    const req = {
      method: 'PUT',
      body: { name: 'Empresa Atualizada', ignored: true },
      params: { id: '17' },
      query: {}
    } as any;
    const res = createResponse();
    const next = jest.fn();

    middleware(req, res as any, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body).toEqual({ name: 'Empresa Atualizada' });
    expect(req.params).toEqual({ id: '17' });
    expect(req.query).toEqual({});
  });
});
