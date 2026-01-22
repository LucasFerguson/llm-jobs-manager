import 'dotenv/config';
import { Queue, Worker } from 'bullmq';

// Notes: https://github.com/taskforcesh/bullmq

const connection = {
	host: 'localhost',
	port: 6379,
	password: process.env.REDIS_PASSWORD
};

const queue = new Queue('Paint', {
	connection: connection
});

queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });
queue.add('cars', { color: 'blue' });

const worker = new Worker('Paint', async job => {
	if (job.name === 'cars') {
		await paintCar(job.data.color);
	}
}, {
	connection: connection
});

async function paintCar(color: string) {
	console.log(`Painting a car ${color}`);
}

worker.on('completed', job => {
	console.log(`Job ${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
	console.log(`Job ${job?.id} has failed with error ${err.message}`);
});



