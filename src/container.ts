import type { Router } from "express";
import type { Logger } from "pino";
import type { AppConfig } from "./config/env.js";
import { createDatabase, type Database } from "./infrastructure/database/database.js";
import { RedisCacheService } from "./infrastructure/cache/cache.service.js";
import { HealthController } from "./modules/health/health.controller.js";
import { createHealthRouter } from "./modules/health/health.routes.js";
import { MetricsController } from "./modules/health/metrics.controller.js";
import { MetricsService } from "./infrastructure/observability/metrics.service.js";
import { createLogger } from "./infrastructure/observability/logger.js";
import { AuthController } from "./modules/auth/auth.controller.js";
import { AuthRepository } from "./modules/auth/auth.repository.js";
import { createAuthRouter } from "./modules/auth/auth.routes.js";
import { AuthService } from "./modules/auth/auth.service.js";
import { PasswordService } from "./modules/auth/password.service.js";
import { TokenService } from "./modules/auth/token.service.js";
import { MfaController } from "./modules/auth/mfa.controller.js";
import { MfaCryptoService } from "./modules/auth/mfa-crypto.service.js";
import { MfaRepository } from "./modules/auth/mfa.repository.js";
import { createMfaRouter } from "./modules/auth/mfa.routes.js";
import { MfaService } from "./modules/auth/mfa.service.js";
import { UserController } from "./modules/users/user.controller.js";
import { UserRepository } from "./modules/users/user.repository.js";
import { createUserRouter } from "./modules/users/user.routes.js";
import { UserService } from "./modules/users/user.service.js";
import { ProfileController } from "./modules/profiles/profile.controller.js";
import { ProfileRepository } from "./modules/profiles/profile.repository.js";
import { createProfileRouter } from "./modules/profiles/profile.routes.js";
import { ProfileService } from "./modules/profiles/profile.service.js";
import { DoctorController } from "./modules/doctors/doctor.controller.js";
import { DoctorRepository } from "./modules/doctors/doctor.repository.js";
import { createDoctorRouter } from "./modules/doctors/doctor.routes.js";
import { DoctorService } from "./modules/doctors/doctor.service.js";
import { ConsultationController } from "./modules/consultations/consultation.controller.js";
import { ConsultationRepository } from "./modules/consultations/consultation.repository.js";
import { createConsultationRouter } from "./modules/consultations/consultation.routes.js";
import { ConsultationService } from "./modules/consultations/consultation.service.js";
import { PrescriptionController } from "./modules/prescriptions/prescription.controller.js";
import { PrescriptionRepository } from "./modules/prescriptions/prescription.repository.js";
import { createPrescriptionRouter } from "./modules/prescriptions/prescription.routes.js";
import { PrescriptionService } from "./modules/prescriptions/prescription.service.js";
import { PaymentController } from "./modules/payments/payment.controller.js";
import { PaymentRepository } from "./modules/payments/payment.repository.js";
import { createPaymentRouter } from "./modules/payments/payment.routes.js";
import { PaymentService } from "./modules/payments/payment.service.js";
import { FakePaymentGateway } from "./modules/payments/fake-payment.gateway.js";
import { AuditController } from "./modules/audit/audit.controller.js";
import { AuditRepository } from "./modules/audit/audit.repository.js";
import { createAuditRouter } from "./modules/audit/audit.routes.js";
import { AuditService } from "./modules/audit/audit.service.js";
import { AnalyticsController } from "./modules/analytics/analytics.controller.js";
import { AnalyticsRepository } from "./modules/analytics/analytics.repository.js";
import { createAnalyticsRouter } from "./modules/analytics/analytics.routes.js";
import { AnalyticsService } from "./modules/analytics/analytics.service.js";
import { AccountController } from "./modules/accounts/account.controller.js";
import { AccountRepository } from "./modules/accounts/account.repository.js";
import { createAccountRouter } from "./modules/accounts/account.routes.js";
import { AccountService } from "./modules/accounts/account.service.js";
import { AdminController } from "./modules/admin/admin.controller.js";
import { AdminRepository } from "./modules/admin/admin.repository.js";
import { createAdminRouter } from "./modules/admin/admin.routes.js";
import { AdminService } from "./modules/admin/admin.service.js";
import { OpenApiController } from "./openapi/openapi.controller.js";
import { createOpenApiRouter } from "./openapi/openapi.routes.js";

export type ContainerCradle = {
  config: AppConfig;
  logger: Logger;
  database: Database;
  cache: RedisCacheService;
  healthController: HealthController;
  healthRouter: Router;
  metricsService: MetricsService;
  metricsController: MetricsController;
  authRouter: Router;
  mfaRouter: Router;
  userRouter: Router;
  profileRouter: Router;
  doctorRouter: Router;
  consultationRouter: Router;
  prescriptionRouter: Router;
  paymentRouter: Router;
  auditRouter: Router;
  analyticsRouter: Router;
  accountRouter: Router;
  adminRouter: Router;
  openApiRouter: Router;
};

export function createAppContainer(config: AppConfig) {
  const logger = createLogger(config.LOG_LEVEL);
  const database = createDatabase({ config });
  const cache = new RedisCacheService(config.REDIS_URL, logger);
  const healthController = new HealthController(database);
  const healthRouter = createHealthRouter({ healthController });
  const metricsService = new MetricsService();
  const metricsController = new MetricsController(metricsService, config);
  const authRepository = new AuthRepository(database);
  const passwordService = new PasswordService();
  const tokenService = new TokenService(config);
  const authService = new AuthService(authRepository, passwordService, tokenService, config);
  const authController = new AuthController(authService, config);
  const authRouter = createAuthRouter({ authController, tokenService });
  const mfaRepository = new MfaRepository(database);
  const mfaCryptoService = new MfaCryptoService(config);
  const mfaService = new MfaService(mfaRepository, mfaCryptoService, tokenService, authService);
  const mfaController = new MfaController(mfaService, authController);
  const mfaRouter = createMfaRouter({ mfaController, tokenService });
  const userRepository = new UserRepository(database);
  const userService = new UserService(userRepository, authRepository);
  const userController = new UserController(userService);
  const userRouter = createUserRouter({ userController, tokenService });
  const profileRepository = new ProfileRepository(database);
  const profileService = new ProfileService(profileRepository);
  const profileController = new ProfileController(profileService);
  const profileRouter = createProfileRouter({ profileController, tokenService });
  const doctorRepository = new DoctorRepository(database);
  const doctorService = new DoctorService(doctorRepository, cache);
  const doctorController = new DoctorController(doctorService);
  const doctorRouter = createDoctorRouter({ doctorController, tokenService });
  const consultationRepository = new ConsultationRepository(database);
  const consultationService = new ConsultationService(consultationRepository, cache);
  const consultationController = new ConsultationController(consultationService);
  const consultationRouter = createConsultationRouter({ consultationController, tokenService });
  const prescriptionRepository = new PrescriptionRepository(database);
  const prescriptionService = new PrescriptionService(prescriptionRepository, consultationRepository);
  const prescriptionController = new PrescriptionController(prescriptionService);
  const prescriptionRouter = createPrescriptionRouter({ prescriptionController, tokenService });
  const paymentRepository = new PaymentRepository(database);
  const paymentGateway = new FakePaymentGateway();
  const paymentService = new PaymentService(paymentRepository, consultationRepository, config, paymentGateway);
  const paymentController = new PaymentController(paymentService);
  const paymentRouter = createPaymentRouter({ paymentController, tokenService });
  const auditRepository = new AuditRepository(database);
  const auditService = new AuditService(auditRepository);
  const auditController = new AuditController(auditService);
  const auditRouter = createAuditRouter({ auditController, tokenService });
  const analyticsRepository = new AnalyticsRepository(database);
  const analyticsService = new AnalyticsService(analyticsRepository);
  const analyticsController = new AnalyticsController(analyticsService);
  const analyticsRouter = createAnalyticsRouter({ analyticsController, tokenService });
  const accountRepository = new AccountRepository(database);
  const accountService = new AccountService(accountRepository, passwordService, authService, mfaCryptoService);
  const accountController = new AccountController(accountService);
  const accountRouter = createAccountRouter({ accountController, tokenService });
  const adminRepository = new AdminRepository(database);
  const adminService = new AdminService(adminRepository, doctorService, passwordService);
  const adminController = new AdminController(adminService);
  const adminRouter = createAdminRouter({ adminController, tokenService });
  const openApiController = new OpenApiController();
  const openApiRouter = createOpenApiRouter({ openApiController });

  const cradle: ContainerCradle = {
    config,
    logger,
    database,
    cache,
    healthController,
    healthRouter,
    metricsService,
    metricsController,
    authRouter,
    mfaRouter,
    userRouter,
    profileRouter,
    doctorRouter,
    consultationRouter,
    prescriptionRouter,
    paymentRouter,
    auditRouter,
    analyticsRouter,
    accountRouter,
    adminRouter,
    openApiRouter
  };

  return { cradle };
}
