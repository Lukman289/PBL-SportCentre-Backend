import Queue from 'bull';
import { config } from '../index';
import { KEYS, NAMESPACE } from './redis';
import Redis from 'ioredis';

// Cek apakah menggunakan Redis TLS (rediss://)
const isRedissTLS = config.redis.url.startsWith('rediss://');

// Konfigurasi Redis untuk Bull Queue dengan IoRedis untuk TLS
const redisConfig = {
  createClient: (type: string) => {
    console.info(`🔒 Bull Queue membuat klien Redis untuk: ${type}`);
    
    // Gunakan IoRedis untuk semua jenis koneksi (client, subscriber, bclient)
    return new Redis(config.redis.url, {
      maxRetriesPerRequest: 3,
      retryStrategy: (times: number) => {
        if (times > 10) {
          console.error('Bull: Terlalu banyak percobaan koneksi Redis. Tidak akan mencoba lagi.');
          return null; // Stop retrying
        }
        
        const delay = Math.min(Math.pow(2, times) * 50, 10000);
        console.log(`Bull: Mencoba koneksi Redis ulang dalam ${delay}ms... (percobaan ke-${times + 1})`);
        return delay;
      },
      connectTimeout: 10000,
      enableOfflineQueue: false,
      enableReadyCheck: true,
      tls: isRedissTLS ? { rejectUnauthorized: false } : undefined
    });
  },
  prefix: NAMESPACE.PREFIX || 'sportcenter',
  defaultJobOptions: {
    attempts: 3,
    removeOnComplete: true,
    removeOnFail: false,
  }
};

// Queue untuk membersihkan booking yang kedaluwarsa
export const bookingCleanupQueue = new Queue(NAMESPACE.CLEANUP || 'cleanup-expired-bookings', {
  ...redisConfig,
  // Gunakan key yang lengkap dengan namespace dan prefix
  prefix: KEYS?.QUEUE?.CLEANUP?.replace(`:${NAMESPACE.CLEANUP || 'cleanup-expired-bookings'}`, '') || 'sportcenter'
});

// Queue untuk memperbarui ketersediaan lapangan secara real-time
export const fieldAvailabilityQueue = new Queue(NAMESPACE.AVAILABILITY || 'field-availability-updates', {
  ...redisConfig,
  // Gunakan key yang lengkap dengan namespace dan prefix
  prefix: KEYS?.QUEUE?.AVAILABILITY?.replace(`:${NAMESPACE.AVAILABILITY || 'field-availability-updates'}`, '') || 'sportcenter'
});

// Event listeners untuk error handling
bookingCleanupQueue.on('error', (error) => {
  console.error(`🔥 Error dalam queue ${bookingCleanupQueue.name}:`, error);
});

fieldAvailabilityQueue.on('error', (error) => {
  console.error(`🔥 Error dalam queue ${fieldAvailabilityQueue.name}:`, error);
});

// Tambahkan event listener untuk failed jobs
bookingCleanupQueue.on('failed', (job, err) => {
  console.error(`❌ Job gagal di queue ${bookingCleanupQueue.name}:`, job.id, err);
});

fieldAvailabilityQueue.on('failed', (job, err) => {
  console.error(`❌ Job gagal di queue ${fieldAvailabilityQueue.name}:`, job.id, err);
});

console.info(`🚀 Bull Queue siap digunakan dengan Redis (${isRedissTLS ? 'TLS' : 'non-TLS'}) - Namespace: ${NAMESPACE.PREFIX || 'sportcenter'}`);
