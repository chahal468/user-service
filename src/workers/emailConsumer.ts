import 'dotenv/config';
import { connectRabbitMQ, closeRabbitMQ, EMAIL_QUEUE } from '../config/rabbitmq';

interface EmailMessage {
  to: string;
  subject: string;
  body: string;
  userName?: string;
}

const sendEmail = async (message: EmailMessage) => {
  // In a real application, you would integrate with an email service like:
  // - SendGrid
  // - AWS SES
  // - Mailgun
  // - Nodemailer with SMTP
  
  console.log('==========================================');
  console.log('SENDING EMAIL');
  console.log('==========================================');
  console.log(`To: ${message.to}`);
  console.log(`Subject: ${message.subject}`);
  console.log(`Body: ${message.body}`);
  console.log('==========================================');
  
  // Simulate email sending delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('Email sent successfully!');
  console.log('==========================================\n');
};

const startEmailConsumer = async () => {
  try {
    const channel = await connectRabbitMQ();
    const queue = EMAIL_QUEUE;
    
    console.log('Email consumer started, waiting for messages...');
    
    // Set prefetch to 1 to process one message at a time
    await channel.prefetch(1);
    
    await channel.consume(queue, async (msg) => {
      if (msg) {
        try {
          const message: EmailMessage = JSON.parse(msg.content.toString());
          
          console.log(`Received email message for: ${message.to}`);
          
          await sendEmail(message);
          
          // Acknowledge message after successful processing
          channel.ack(msg);
          console.log(`Message acknowledged for: ${message.to}\n`);
        } catch (error) {
          console.error('Error processing email message:', error);
          // Reject message (will be requeued)
          channel.nack(msg, false, true);
        }
      }
    }, { noAck: false });
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down email consumer...');
      await closeRabbitMQ();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Error starting email consumer:', error);
    process.exit(1);
  }
};

// Start the consumer if this file is run directly
if (require.main === module) {
  startEmailConsumer();
}

export { startEmailConsumer };
