import amqp, { ChannelModel, Channel } from 'amqplib';

export const EMAIL_QUEUE = 'email_queue';

let connection: ChannelModel | null = null;
let channel: Channel | null = null;

export const connectRabbitMQ = async (): Promise<Channel> => {
  const conn = await amqp.connect(process.env.RABBITMQ_URL || 'amqp://localhost');
  const ch = await conn.createChannel();
  await ch.assertQueue(EMAIL_QUEUE, { durable: true });

  conn.on('close', () => {
    console.log('RabbitMQ connection closed');
    connection = null;
    channel = null;
  });
  conn.on('error', (err: Error) => console.error('RabbitMQ connection error:', err));

  connection = conn;
  channel = ch;
  console.log('RabbitMQ connected successfully');
  return ch;
};

export const getChannel = () => {
  if (!channel) {
    throw new Error('RabbitMQ channel not initialized. Call connectRabbitMQ first.');
  }
  return channel;
};

export const closeRabbitMQ = async () => {
  try {
    await channel?.close();
    await connection?.close();
  } catch (error) {
    console.error('Error closing RabbitMQ connection:', error);
  } finally {
    channel = null;
    connection = null;
  }
};
