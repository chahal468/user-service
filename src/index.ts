import express from 'express';
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
