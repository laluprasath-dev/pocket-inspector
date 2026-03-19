import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AppConfigModule } from './config/app-config.module';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { RolesGuard } from './common/guards/roles.guard';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { OrgsModule } from './modules/orgs/orgs.module';
import { ClientsModule } from './modules/clients/clients.module';
import { SitesModule } from './modules/sites/sites.module';
import { BuildingsModule } from './modules/buildings/buildings.module';
import { FloorsModule } from './modules/floors/floors.module';
import { DoorsModule } from './modules/doors/doors.module';
import { InspectionsModule } from './modules/inspections/inspections.module';
import { SurveysModule } from './modules/surveys/surveys.module';
import { StorageModule } from './modules/storage/storage.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ExportsModule } from './modules/exports/exports.module';
import { HealthModule } from './modules/health/health.module';

@Module({
  imports: [
    EventEmitterModule.forRoot({
      wildcard: false,
      delimiter: '.',
      maxListeners: 20,
    }),
    AppConfigModule,
    PrismaModule,
    AuthModule,
    UsersModule,
    OrgsModule,
    ClientsModule,
    SitesModule,
    BuildingsModule,
    FloorsModule,
    DoorsModule,
    InspectionsModule,
    SurveysModule,
    StorageModule,
    NotificationsModule,
    ExportsModule,
    HealthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
