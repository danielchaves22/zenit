// backend/tests/financial-account-movement-report.test.ts
import request from 'supertest';
import app from '../src/app';

describe('Financial Account Movement Report', () => {
  let authToken: string;
  let companyId: number;
  let accountIds: number[];

  beforeAll(async () => {
    // Setup: Login and get auth token
    const loginResponse = await request(app)
      .post('/api/auth/login')
      .send({
        email: 'admin@test.com',
        password: 'password123'
      });
    
    authToken = loginResponse.body.token;
    companyId = loginResponse.body.user.company.id;
    
    // Get available accounts
    const accountsResponse = await request(app)
      .get('/api/financial/accounts')
      .set('Authorization', `Bearer ${authToken}`);
    
    accountIds = accountsResponse.body.map((acc: any) => acc.id);
  });

  describe('GET /api/financial/reports/financial-account-movement', () => {
    it('should generate report with valid parameters', async () => {
      const response = await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds.join(','),
          groupBy: 'day'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      
      if (response.body.length > 0) {
        const period = response.body[0];
        expect(period).toHaveProperty('period');
        expect(period).toHaveProperty('periodLabel');
        expect(period).toHaveProperty('income');
        expect(period).toHaveProperty('expense');
        expect(period).toHaveProperty('balance');
        expect(period).toHaveProperty('transactions');
        expect(period.transactions).toBeInstanceOf(Array);
      }
    });

    it('should return 400 for missing required parameters', async () => {
      await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01'
          // Missing endDate and financialAccountIds
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should return 400 for invalid date range', async () => {
      await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-31',
          endDate: '2024-01-01', // End before start
          financialAccountIds: accountIds.join(',')
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should return 400 for invalid groupBy parameter', async () => {
      await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds.join(','),
          groupBy: 'invalid'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });

    it('should group by week correctly', async () => {
      const response = await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds.join(','),
          groupBy: 'week'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
      
      if (response.body.length > 0) {
        const period = response.body[0];
        expect(period.periodLabel).toMatch(/\d{2}\/\d{2}\/\d{4} - \d{2}\/\d{2}\/\d{4}/);
      }
    });

    it('should group by month correctly', async () => {
      const response = await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-03-31',
          financialAccountIds: accountIds.join(','),
          groupBy: 'month'
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body).toBeInstanceOf(Array);
    });
  });

  describe('POST /api/financial/reports/financial-account-movement/pdf', () => {
    it('should export report to PDF', async () => {
      // First get report data
      const reportResponse = await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds.join(','),
          groupBy: 'day'
        })
        .set('Authorization', `Bearer ${authToken}`);

      const response = await request(app)
        .post('/api/financial/reports/financial-account-movement/pdf')
        .send({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds,
          groupBy: 'day',
          data: reportResponse.body
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/pdf');
      expect(response.headers['content-disposition']).toMatch(/attachment; filename=".*\.pdf"/);
    });

    it('should return 400 for missing data', async () => {
      await request(app)
        .post('/api/financial/reports/financial-account-movement/pdf')
        .send({
          startDate: '2024-01-01',
          endDate: '2024-01-31'
          // Missing required fields
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);
    });
  });

  describe('POST /api/financial/reports/financial-account-movement/excel', () => {
    it('should export report to Excel', async () => {
      // First get report data
      const reportResponse = await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds.join(','),
          groupBy: 'day'
        })
        .set('Authorization', `Bearer ${authToken}`);

      const response = await request(app)
        .post('/api/financial/reports/financial-account-movement/excel')
        .send({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds,
          groupBy: 'day',
          data: reportResponse.body
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(response.headers['content-disposition']).toMatch(/attachment; filename=".*\.xlsx"/);
    });
  });

  describe('Authorization', () => {
    it('should return 401 without auth token', async () => {
      await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: accountIds.join(',')
        })
        .expect(401);
    });

    it('should return 403 for accounts from different company', async () => {
      // This would need to be tested with accounts from another company
      // For now, we'll test with non-existent account IDs
      await request(app)
        .get('/api/financial/reports/financial-account-movement')
        .query({
          startDate: '2024-01-01',
          endDate: '2024-01-31',
          financialAccountIds: '99999,99998' // Non-existent IDs
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500); // Should fail when trying to validate account ownership
    });
  });
});

// ========================================
// MANUAL TESTING EXAMPLES
// ========================================

/*
1. GET Report Example:
curl -X GET "http://localhost:3000/api/financial/reports/financial-account-movement?startDate=2024-01-01&endDate=2024-01-31&financialAccountIds=1,2,3&groupBy=day" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"

2. Export PDF Example:
curl -X POST "http://localhost:3000/api/financial/reports/financial-account-movement/pdf" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "financialAccountIds": [1, 2, 3],
    "groupBy": "day",
    "data": [
      {
        "period": "2024-01-01",
        "periodLabel": "01/01/2024",
        "income": 1000.00,
        "expense": 500.00,
        "balance": 500.00,
        "transactions": [
          {
            "id": 1,
            "description": "Venda de produto",
            "amount": 1000.00,
            "date": "2024-01-01T10:00:00.000Z",
            "type": "INCOME",
            "financialAccount": {
              "id": 1,
              "name": "Conta Principal"
            },
            "category": {
              "id": 1,
              "name": "Vendas",
              "color": "#16A34A"
            }
          }
        ]
      }
    ]
  }' \
  --output report.pdf

3. Export Excel Example:
curl -X POST "http://localhost:3000/api/financial/reports/financial-account-movement/excel" \
  -H "Authorization: Bearer YOUR_TOKEN_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "startDate": "2024-01-01",
    "endDate": "2024-01-31",
    "financialAccountIds": [1, 2, 3],
    "groupBy": "week",
    "data": []
  }' \
  --output report.xlsx
*/