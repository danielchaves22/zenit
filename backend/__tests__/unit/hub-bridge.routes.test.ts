jest.mock('../../src/services/whatsapp-integration.service', () => ({ __esModule: true, default: {
  getHubBinding: jest.fn(), dispatchForHub: jest.fn(), queryForHub: jest.fn(), disconnectBinding: jest.fn()
} }));
import express from 'express';
import request from 'supertest';
import { createHmac, randomBytes } from 'node:crypto';
import router, { verifyHubSignature } from '../../src/routes/hub-bridge.routes';
import Service from '../../src/services/whatsapp-integration.service';
const secret = 'test-only-secret-with-at-least-32-characters';
const path = '/api/integrations/hub/bridge';
const app = express();
app.use(express.json({ verify: (req, _res, buf) => { (req as any).rawBody = buf; } }));
app.use('/api', router);
function signed(body: Record<string, unknown>, time = String(Date.now())) {
  const raw = JSON.stringify(body); const nonce = randomBytes(16).toString('hex');
  const signature = createHmac('sha256', secret).update(`${time}\n${nonce}\nPOST\n${path}\n${raw}`).digest('hex');
  const send = () => request(app).post(path).set('Content-Type', 'application/json')
    .set('X-Hub-Timestamp', time).set('X-Hub-Nonce', nonce).set('X-Hub-Signature', signature).send(raw);
  return { send, raw, nonce, signature, time };
}
describe('Cash first-party Hub bridge', () => {
  beforeEach(() => { jest.resetAllMocks(); process.env.CASH_HUB_SHARED_SECRET = secret; });
  afterAll(() => { delete process.env.CASH_HUB_SHARED_SECRET; });
  it('fails closed without a configured secret or valid signature', async () => {
    delete process.env.CASH_HUB_SHARED_SECRET;
    expect((await request(app).post(path).send({ operation: 'status', sender: '5544999990000' })).status).toBe(503);
    process.env.CASH_HUB_SHARED_SECRET = secret;
    expect((await request(app).post(path).send({ operation: 'status', sender: '5544999990000' })).status).toBe(401);
  });
  it('requires fresh signed bytes and rejects replay and injected identity', async () => {
    jest.mocked(Service.getHubBinding).mockResolvedValue(null);
    const r = signed({ operation: 'status', sender: '5544999990000' });
    expect((await r.send()).body).toEqual({ connected: false });
    expect((await r.send()).status).toBe(409);
    expect((await signed({ operation: 'status', sender: '5544999990000' }, String(Date.now() - 120000)).send()).status).toBe(401);
    expect((await signed({ operation: 'status', sender: '5544999990000', userId: 1, companyId: 1, role: 'ADMIN' }).send()).status).toBe(400);
    expect(verifyHubSignature({ secret, body: Buffer.from(r.raw + ' '), time: r.time, nonce: r.nonce, signature: r.signature })).toBe(false);
  });
  it('uses the bound user for disconnect and never grants access from sender text alone', async () => {
    jest.mocked(Service.getHubBinding).mockResolvedValue(null);
    expect((await signed({ operation: 'disconnect', sender: '5544999990000' }).send()).status).toBe(403);
    expect(Service.disconnectBinding).not.toHaveBeenCalled();
    jest.mocked(Service.getHubBinding).mockResolvedValue({ binding: { userId: 7 } } as any);
    expect((await signed({ operation: 'disconnect', sender: '5544999990000' }).send()).status).toBe(200);
    expect(Service.disconnectBinding).toHaveBeenCalledWith({ userId: 7 });
  });

  it('accepts signed audio references but rejects mixed confirmation and arbitrary media URLs', async () => {
    jest.mocked(Service.dispatchForHub).mockResolvedValue({ replies: [{ text: 'Confira', buttons: [{ id: 'zenit:confirm:1:123', title: 'Confirmar' }] }] });
    const input = { operation: 'message', sender: '5544999990000', messageId: 'wamid.voice', text: '', audio: { mediaId: '123' } };
    const response = await signed(input).send();
    expect(response.status).toBe(200);
    expect(response.body.replies[0].buttons[0].id).toBe('zenit:confirm:1:123');
    expect(Service.dispatchForHub).toHaveBeenCalledWith({ waId: input.sender, messageId: input.messageId, text: '', audio: { mediaId: '123' }, buttonId: undefined });
    for (const change of [{ buttonId: 'zenit:confirm:1:123' }, { text: 'Confirmar' },
      { audio: { mediaId: 'https://other.example/private' } }, { audio: { mediaId: '123', url: 'https://other.example' } }]) {
      expect((await signed({ ...input, ...change }).send()).status).toBe(400);
    }
    expect(Service.dispatchForHub).toHaveBeenCalledTimes(1);
  });
});
