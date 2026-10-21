import { getChannel, EMAIL_QUEUE } from '../config/rabbitmq';

interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  userName?: string;
}

export const publishEmail = async (message: EmailMessage) => {
  try {
    const channel = getChannel();
    const queue = EMAIL_QUEUE;
    
    const sent = channel.sendToQueue(
      queue,
      Buffer.from(JSON.stringify(message)),
      { persistent: true }
    );
    
    if (sent) {
      console.log(`Email message published to queue: ${message.to}`);
    } else {
      console.warn('Failed to publish email message to queue');
    }
    
    return sent;
  } catch (error) {
    console.error('Error publishing email message:', error);
    throw error;
  }
};

export const publishWelcomeEmail = async (email: string, userName: string) => {
  const message: EmailMessage = {
    to: email,
    subject: 'Welcome to Our Platform!',
    body: `Hello ${userName},\n\nWelcome to our platform! We're excited to have you on board.\n\nBest regards,\nThe Team`,
    userName
  };
  
  return publishEmail(message);
};
