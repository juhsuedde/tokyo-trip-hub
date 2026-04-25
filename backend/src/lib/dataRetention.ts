import cron from 'node-cron';
import { prisma } from '../lib/prisma';
import { logger } from './logger';
import { sendEmail } from './email.service';

const ARCHIVE_DAYS = parseInt(process.env.DATA_RETENTION_ARCHIVE_DAYS || '30', 10);
const DELETE_DAYS = parseInt(process.env.DATA_RETENTION_DELETE_DAYS || '90', 10);
const WARN_DAYS = parseInt(process.env.DATA_RETENTION_WARN_DAYS || '7', 10);

async function archiveOldTrips() {
  logger.info('Starting daily trip archival job');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - ARCHIVE_DAYS);

  const freeUsers = await prisma.user.findMany({
    where: { tier: 'FREE' },
    select: { id: true, email: true, name: true },
  });

  for (const user of freeUsers) {
    const tripsToArchive = await prisma.trip.findMany({
      where: {
        ownerId: user.id,
        status: 'ACTIVE',
        endDate: { lt: cutoff },
      },
    });

    for (const trip of tripsToArchive) {
      await prisma.trip.update({
        where: { id: trip.id },
        data: { status: 'ARCHIVED' },
      });
      logger.info({ tripId: trip.id }, 'Trip archived due to data retention');
    }
  }

  logger.info('Daily trip archival job complete');
}

async function deleteOldTrips() {
  logger.info('Starting weekly trip deletion job');

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DELETE_DAYS);

  const tripsToDelete = await prisma.trip.findMany({
    where: {
      status: 'ARCHIVED',
      updatedAt: { lt: cutoff },
    },
    include: { owner: true },
  });

  for (const trip of tripsToDelete) {
    if (trip.owner?.tier === 'FREE') {
      await prisma.trip.delete({ where: { id: trip.id } });
      logger.info({ tripId: trip.id }, 'Trip permanently deleted due to data retention');
    }
  }

  logger.info('Weekly trip deletion job complete');
}

async function warnBeforeDeletion() {
  logger.info('Starting deletion warning job');

  const warnCutoff = new Date();
  warnCutoff.setDate(warnCutoff.getDate() - (DELETE_DAYS - WARN_DAYS));

  const tripsToWarn = await prisma.trip.findMany({
    where: {
      status: 'ARCHIVED',
      updatedAt: { lt: warnCutoff, gt: new Date(Date.now() - DELETE_DAYS * 24 * 60 * 60 * 1000) },
    },
    include: { owner: true },
  });

  for (const trip of tripsToWarn) {
    if (trip.owner?.tier === 'FREE' && trip.owner.email) {
      await sendEmail({
        to: trip.owner.email,
        subject: 'Your TokyoTrip will be deleted soon',
        text: `Hi ${trip.owner.name},\n\nYour trip "${trip.title}" will be permanently deleted in ${WARN_DAYS} days due to data retention policy. Export it if you want to keep it.\n\n- TokyoTrip Team`,
        html: `<p>Hi ${trip.owner.name},</p><p>Your trip "<strong>${trip.title}</strong>" will be permanently deleted in ${WARN_DAYS} days due to data retention policy. Export it if you want to keep it.</p><p>- TokyoTrip Team</p>`,
      });
    }
  }

  logger.info('Deletion warning job complete');
}

function startDataRetentionJobs() {
  cron.schedule('0 2 * * *', archiveOldTrips);
  cron.schedule('0 3 * * 0', deleteOldTrips);
  cron.schedule('0 4 * * *', warnBeforeDeletion);

  logger.info('Data retention cron jobs scheduled');
}

export { startDataRetentionJobs, archiveOldTrips, deleteOldTrips, warnBeforeDeletion };
