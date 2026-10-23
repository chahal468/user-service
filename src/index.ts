import express from 'express';
import crypto from 'crypto';
import dotenv from 'dotenv';
import swaggerUi from 'swagger-ui-express';
import { db } from './db';
import { users, userinfo } from './db/schema';
import { swaggerSpec } from './config/swagger';
import { eq } from 'drizzle-orm';
import { connectRabbitMQ } from './config/rabbitmq';
import { publishWelcomeEmail } from './services/emailPublisher';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

/**
 * @swagger
 * /:
 *   get:
 *     summary: Welcome message
 *     description: Returns a welcome message
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 */
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to the API' });
});

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Get all users
 *     description: Returns a list of all users
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: integer
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                   createdAt:
 *                     type: string
 *                     format: date-time
 *                   updatedAt:
 *                     type: string
 *                     format: date-time
 */
app.get('/users', async (req, res) => {
  try {
    const allUsers = await db.select().from(users);
    res.json(allUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Create a new user
 *     description: Creates a new user with the provided name and email
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 name:
 *                   type: string
 *                 email:
 *                   type: string
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Failed to create user
 */
app.post('/users', async (req, res) => {
  try {
    const { name, email } = req.body;
    const now = new Date();
    await db.insert(users).values({ 
      name, 
      email, 
      createdAt: now, 
      updatedAt: now 
    });
    const newUser = await db.select().from(users).where(eq(users.email, email)).limit(1);
    
    // Publish welcome email to RabbitMQ
    if (process.env.RABBITMQ_URL) {
      try {
        await publishWelcomeEmail(email, name);
      } catch (emailError) {
        console.error('Failed to publish welcome email:', emailError);
        // Don't fail the request if email publishing fails
      }
    }
    
    res.status(201).json(newUser[0]);
  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   delete:
 *     summary: Delete a user
 *     description: Deletes a user by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to delete user
 */
app.delete('/users/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const deletedUser = await db.delete(users).where(eq(users.id, userId)).returning();
    
    if (deletedUser.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    res.json({ message: 'User deleted successfully', user: deletedUser[0] });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * @swagger
 * /users/{id}:
 *   get:
 *     summary: Get a single user with info
 *     description: Returns a user with their additional information by ID
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     responses:
 *       200:
 *         description: Successful response
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     name:
 *                       type: string
 *                     email:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *                 userInfo:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: integer
 *                     userId:
 *                       type: integer
 *                     address:
 *                       type: string
 *                     city:
 *                       type: string
 *                     state:
 *                       type: string
 *                     zipcode:
 *                       type: string
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to fetch user
 */
app.get('/users/:id', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    
    const result = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        userCreatedAt: users.createdAt,
        userUpdatedAt: users.updatedAt,
        userInfoId: userinfo.id,
        address: userinfo.address,
        city: userinfo.city,
        state: userinfo.state,
        zipcode: userinfo.zipcode,
      })
      .from(users)
      .leftJoin(userinfo, eq(users.id, userinfo.userId))
      .where(eq(users.id, userId))
      .limit(1);
    
    if (result.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const row = result[0];
    res.json({
      user: {
        id: row.id,
        name: row.name,
        email: row.email,
        createdAt: row.userCreatedAt,
        updatedAt: row.userUpdatedAt,
      },
      userInfo: row.userInfoId ? {
        id: row.userInfoId,
        userId: row.id,
        address: row.address,
        city: row.city,
        state: row.state,
        zipcode: row.zipcode,
      } : null
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

/**
 * @swagger
 * /users/{id}/info:
 *   put:
 *     summary: Update user info
 *     description: Updates the address information for a user
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: User ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               address:
 *                 type: string
 *               city:
 *                 type: string
 *               state:
 *                 type: string
 *               zipcode:
 *                 type: string
 *     responses:
 *       200:
 *         description: User info updated successfully
 *       404:
 *         description: User not found
 *       500:
 *         description: Failed to update user info
 */
app.put('/users/:id/info', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const { address, city, state, zipcode } = req.body;
    
    // Check if user exists
    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (userResult.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if userinfo exists for this user
    const existingInfo = await db.select().from(userinfo).where(eq(userinfo.userId, userId)).limit(1);
    
    if (existingInfo.length > 0) {
      // Update existing userinfo
      const updatedInfo = await db
        .update(userinfo)
        .set({ address, city, state, zipcode })
        .where(eq(userinfo.userId, userId))
        .returning();
      res.json({ message: 'User info updated successfully', userInfo: updatedInfo[0] });
    } else {
      // Create new userinfo record
      const newInfo = await db
        .insert(userinfo)
        .values({ userId, address, city, state, zipcode })
        .returning();
      res.status(201).json({ message: 'User info created successfully', userInfo: newInfo[0] });
    }
  } catch (error) {
    console.error('Error updating user info:', error);
    res.status(500).json({ error: 'Failed to update user info' });
  }
});

const GUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL_REGEX = /^[A-Za-z0-9_-]+$/;

const validateJwtToken = (authHeader?: string): string | null => {
  if (!authHeader || !authHeader.trim()) {
    return 'Authorization token is required';
  }

  const match = authHeader.trim().match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1].trim()) {
    return 'Invalid Authorization header format. Expected: Bearer <token>';
  }

  const token = match[1].trim();
  const parts = token.split('.');
  if (parts.length !== 3 || parts.some((part) => !part || !BASE64URL_REGEX.test(part))) {
    return 'Invalid JWT token';
  }

  const [headerPart, payloadPart, signaturePart] = parts;
  let header: { alg?: string; typ?: string };
  let payload: { exp?: number; nbf?: number };

  try {
    header = JSON.parse(Buffer.from(headerPart, 'base64url').toString('utf8'));
    payload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8'));
  } catch {
    return 'Invalid JWT token';
  }

  if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
    return 'Invalid JWT token';
  }

  if (process.env.JWT_SECRET) {
    const algMap: Record<string, string> = {
      HS256: 'sha256',
      HS384: 'sha384',
      HS512: 'sha512',
    };
    const digest = header.alg ? algMap[header.alg] : undefined;
    if (!digest) {
      return 'Invalid JWT token algorithm';
    }
    const expectedSig = crypto
      .createHmac(digest, process.env.JWT_SECRET)
      .update(`${headerPart}.${payloadPart}`)
      .digest();
    const actualSig = Buffer.from(signaturePart, 'base64url');
    if (expectedSig.length !== actualSig.length || !crypto.timingSafeEqual(expectedSig, actualSig)) {
      return 'Invalid JWT token signature';
    }
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) {
    return 'JWT token has expired';
  }
  if (typeof payload.nbf === 'number' && payload.nbf > nowSeconds) {
    return 'JWT token is not active yet';
  }

  return null;
};

/**
 * @swagger
 * /api/outbound/pre-call/validate:
 *   post:
 *     summary: Validate an outbound call before dialing
 *     description: Pre-call check for an outbound campaign call record
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: VendorContactId
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor contact identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - campaignName
 *               - callRecordId
 *               - accountNumber
 *               - phone
 *             properties:
 *               campaignName:
 *                 type: string
 *                 example: COLL_DPD00to30_Med
 *               callRecordId:
 *                 type: string
 *                 format: uuid
 *                 example: ffdb7f0e-6455-4672-89fb-ca775264fb0e
 *               accountNumber:
 *                 type: string
 *                 example: "0014117018"
 *               phone:
 *                 type: string
 *                 example: 610-462-8023
 *               businessFields:
 *                 type: object
 *                 properties:
 *                   LastPaymentDate:
 *                     type: string
 *                     format: date-time
 *                     example: "2020-10-26T00:00:00"
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: continue
 *                 reason:
 *                   type: string
 *                   nullable: true
 *                   example: null
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: reject
 *                 reason:
 *                   type: string
 *                   example: CallRecordId is required
 *       401:
 *         description: Unauthorized (missing or invalid JWT token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: reject
 *                 reason:
 *                   type: string
 *                   example: Authorization token is required
 */
app.post('/api/outbound/pre-call/validate', (req, res) => {
  const jwtError = validateJwtToken(req.get('Authorization'));
  if (jwtError) {
    return res.status(401).json({ message: 'reject', reason: jwtError });
  }

  const vendorContactId = req.get('VendorContactId') ?? req.get('X-Vendor-Contact-Id');
  const { callRecordId, campaignName, phone, accountNumber } = req.body ?? {};
  const errors: string[] = [];

  if (!callRecordId || typeof callRecordId !== 'string' || !callRecordId.trim()) {
    errors.push('CallRecordId is required');
  } else if (!GUID_REGEX.test(callRecordId.trim())) {
    errors.push('CallRecordId must be a valid GUID');
  }

  if (!campaignName || typeof campaignName !== 'string' || !campaignName.trim()) {
    errors.push('CampaignName is required');
  }

  if (!vendorContactId || !vendorContactId.trim()) {
    errors.push('VendorContactId is required');
  }

  if (!phone || typeof phone !== 'string' || !phone.trim()) {
    errors.push('Phone is required');
  }

  if (!accountNumber || typeof accountNumber !== 'string' || !accountNumber.trim()) {
    errors.push('AccountNumber is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: 'reject', reason: errors.join(', ') });
  }

  res.json({ message: 'continue', reason: null });
});

/**
 * @swagger
 * /api/outbound/post-call/callresult:
 *   post:
 *     summary: Submit outbound post-call result
 *     description: Records the disposition and call timestamp for an outbound call record
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: VendorContactId
 *         required: true
 *         schema:
 *           type: string
 *         description: Vendor contact identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - callRecordId
 *               - callDateTime
 *               - dispositionCode
 *             properties:
 *               callRecordId:
 *                 type: string
 *                 format: uuid
 *                 example: ffdb7f0e-6455-4672-89fb-ca775264fb0e
 *               callDateTime:
 *                 type: string
 *                 format: date-time
 *                 example: "2026-10-21T21:00:00Z"
 *               dispositionCode:
 *                 type: string
 *                 example: "13400"
 *     responses:
 *       200:
 *         description: Call result updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 statusCode:
 *                   type: integer
 *                   example: 200
 *                 status:
 *                   type: string
 *                   example: OK
 *                 callRecordId:
 *                   type: string
 *                   format: uuid
 *                   example: ffdb7f0e-6455-4672-89fb-ca775264fb0e
 *                 existingCallRecordId:
 *                   type: string
 *                   nullable: true
 *                   example: null
 *                 correlationId:
 *                   type: string
 *                   example: test-corr-003
 *                 message:
 *                   type: string
 *                   example: Call result updated successfully
 *                 details:
 *                   type: string
 *                   nullable: true
 *                   example: null
 *                 timestampUtc:
 *                   type: string
 *                   format: date-time
 *                   example: "2026-07-29T20:06:51.8676725+00:00"
 *                 error:
 *                   type: string
 *                   nullable: true
 *                   example: null
 *       400:
 *         description: Validation error
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: reject
 *                 reason:
 *                   type: string
 *                   example: CallRecordId is required
 *       401:
 *         description: Unauthorized (missing or invalid JWT token)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: reject
 *                 reason:
 *                   type: string
 *                   example: Authorization token is required
 */
app.post('/api/outbound/post-call/callresult', (req, res) => {
  const jwtError = validateJwtToken(req.get('Authorization'));
  if (jwtError) {
    return res.status(401).json({ message: 'reject', reason: jwtError });
  }

  const vendorContactId = req.get('VendorContactId') ?? req.get('X-Vendor-Contact-Id');
  const { callRecordId, callDateTime, dispositionCode } = req.body ?? {};
  const errors: string[] = [];

  if (!callRecordId || typeof callRecordId !== 'string' || !callRecordId.trim()) {
    errors.push('CallRecordId is required');
  } else if (!GUID_REGEX.test(callRecordId.trim())) {
    errors.push('CallRecordId must be a valid GUID');
  }

  if (!vendorContactId || !vendorContactId.trim()) {
    errors.push('VendorContactId is required');
  }

  if (!callDateTime || typeof callDateTime !== 'string' || !callDateTime.trim()) {
    errors.push('CallDateTime is required');
  } else if (Number.isNaN(Date.parse(callDateTime.trim()))) {
    errors.push('CallDateTime must be a valid ISO date-time');
  }

  if (!dispositionCode || typeof dispositionCode !== 'string' || !dispositionCode.trim()) {
    errors.push('DispositionCode is required');
  }

  if (errors.length > 0) {
    return res.status(400).json({ message: 'reject', reason: errors.join(', ') });
  }

  res.json({
    statusCode: 200,
    status: 'OK',
    callRecordId: callRecordId.trim(),
    existingCallRecordId: null,
    correlationId: crypto.randomUUID(),
    message: 'Call result updated successfully',
    details: null,
    timestampUtc: new Date().toISOString().replace('Z', '+00:00'),
    error: null,
  });
});

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

const startServer = async () => {
  try {
    console.log('Database connection established successfully.');
    
    // Connect to RabbitMQ
    if (process.env.RABBITMQ_URL) {
      await connectRabbitMQ();
    } else {
      console.log('RABBITMQ_URL not set, skipping RabbitMQ.');
    }
    
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
      console.log(`Swagger documentation available at http://localhost:${PORT}/api-docs`);
    });
  } catch (error) {
    console.error('Unable to start server:', error);
  }
};

startServer();
