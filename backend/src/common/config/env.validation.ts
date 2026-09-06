import { plainToInstance } from 'class-transformer';
import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Min,
  validateSync,
} from 'class-validator';
import {
  DEFAULT_EMAIL_FROM,
  DEFAULT_EMAIL_FROM_NAME,
} from '../constants/brand.constants';

enum Environment {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

enum PaymentsProvider {
  MercadoPago = 'mercado_pago',
  Mock = 'mock',
}

export class EnvironmentVariables {
  // Database - Critical
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Application
  @IsEnum(Environment)
  @IsOptional()
  NODE_ENV: Environment = Environment.Development;

  @IsNumber()
  @IsOptional()
  @Min(1)
  PORT: number = 3001;

  @IsString()
  @IsOptional()
  FRONTEND_URL: string = 'http://localhost:3000';

  @IsString()
  @IsOptional()
  BACKEND_URL: string = 'http://localhost:3001';

  // Authentication - Critical
  @IsString()
  @IsNotEmpty()
  JWT_SECRET!: string;

  // Google OAuth
  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID: string = '';

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET: string = '';

  @IsString()
  @IsOptional()
  GOOGLE_CALLBACK_URL: string = 'http://localhost:3001/auth/google/callback';

  // Cloudflare Turnstile
  @IsBoolean()
  @IsOptional()
  TURNSTILE_ENABLED: boolean = false;

  @IsString()
  @IsOptional()
  TURNSTILE_SECRET_KEY: string = '';

  // Payment providers
  @IsString()
  @IsOptional()
  MP_ACCESS_TOKEN: string = '';

  @IsString()
  @IsOptional()
  MP_OAUTH_CLIENT_ID: string = '';

  @IsString()
  @IsOptional()
  MP_OAUTH_CLIENT_SECRET: string = '';

  @IsString()
  @IsOptional()
  MP_OAUTH_REDIRECT_URI: string = '';

  @IsBoolean()
  @IsOptional()
  MP_PAYOUTS_ENABLED: boolean = false;

  @IsNumber()
  @Min(0)
  PLATFORM_FEE_PERCENT!: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  SELECTED_NUMBER_PREMIUM_PERCENT: number = 5;

  @IsEnum(PaymentsProvider)
  @IsOptional()
  PAYMENTS_PROVIDER: PaymentsProvider = PaymentsProvider.MercadoPago;

  @IsBoolean()
  @IsOptional()
  ALLOW_MOCK_PAYMENTS: boolean = false;

  // Cloudinary - Critical
  @IsString()
  @IsNotEmpty()
  CLOUDINARY_CLOUD_NAME!: string;

  @IsString()
  @IsNotEmpty()
  CLOUDINARY_API_KEY!: string;

  @IsString()
  @IsNotEmpty()
  CLOUDINARY_API_SECRET!: string;

  // Email (Brevo)
  @IsString()
  @IsOptional()
  BREVO_API_KEY: string = '';

  @IsString()
  @IsOptional()
  EMAIL_FROM: string = DEFAULT_EMAIL_FROM;

  @IsString()
  @IsOptional()
  EMAIL_FROM_NAME: string = DEFAULT_EMAIL_FROM_NAME;

  // Encryption - Critical
  @IsString()
  @IsNotEmpty()
  @Matches(/^[a-fA-F0-9]{64}$/, {
    message: 'must be exactly 64 hexadecimal characters',
  })
  ENCRYPTION_KEY!: string;

  // Rate Limiting
  @IsNumber()
  @IsOptional()
  @Min(1)
  THROTTLE_TTL: number = 60;

  @IsNumber()
  @IsOptional()
  @Min(1)
  THROTTLE_LIMIT: number = 100;

  // Logging
  @IsString()
  @IsOptional()
  LOG_LEVEL: string = 'info';

  // Cron Jobs
  @IsBoolean()
  @IsOptional()
  ENABLE_CRON_JOBS: boolean = true;

  // GraphQL
  @IsBoolean()
  @IsOptional()
  GRAPHQL_PLAYGROUND: boolean = true;

  @IsBoolean()
  @IsOptional()
  GRAPHQL_DEBUG: boolean = true;

  // CORS
  @IsString()
  @IsOptional()
  CORS_ORIGIN: string = 'http://localhost:3000';

  // Optional integrations
  @IsString()
  @IsOptional()
  SENTRY_DSN: string = '';

  @IsString()
  @IsOptional()
  REDIS_URL: string = '';

  // Social promotions
  @IsBoolean()
  @IsOptional()
  SOCIAL_PROMOTION_ENABLED: boolean = true;

  @IsString()
  @IsOptional()
  SOCIAL_PROMOTION_ALLOWED_NETWORKS: string = 'facebook,instagram,x';

  @IsString()
  @IsOptional()
  SOCIAL_PROMOTION_CHECK_CRON: string = '0 */12 * * *';

  @IsNumber()
  @IsOptional()
  @Min(1000)
  SOCIAL_PROMOTION_FETCH_TIMEOUT_MS: number = 30000;

  @IsNumber()
  @IsOptional()
  @Min(1)
  SOCIAL_PROMOTION_MIN_PROVIDER_CHARGE: number = 1;

  @IsNumber()
  @IsOptional()
  @Min(1)
  SOCIAL_PROMOTION_TOKEN_TTL_HOURS: number = 24;

  @IsString()
  @IsOptional()
  SOCIAL_PROMOTION_DEFAULT_BONUS_TIER_JSON: string = '';

  @IsBoolean()
  @IsOptional()
  SOCIAL_PROMOTION_BROWSER_ENABLED: boolean = false;
}

const BOOLEAN_ENV_KEYS = [
  'TURNSTILE_ENABLED',
  'ALLOW_MOCK_PAYMENTS',
  'MP_PAYOUTS_ENABLED',
  'ENABLE_CRON_JOBS',
  'GRAPHQL_PLAYGROUND',
  'GRAPHQL_DEBUG',
  'SOCIAL_PROMOTION_ENABLED',
  'SOCIAL_PROMOTION_BROWSER_ENABLED',
] as const;

function normalizeBooleanEnvValues(
  config: Record<string, unknown>,
): Record<string, unknown> {
  const normalizedConfig = { ...config };

  for (const key of BOOLEAN_ENV_KEYS) {
    const value = normalizedConfig[key];

    if (typeof value !== 'string') {
      continue;
    }

    const normalizedValue = value.trim().toLowerCase();

    if (normalizedValue === 'true') {
      normalizedConfig[key] = true;
      continue;
    }

    if (normalizedValue === 'false') {
      normalizedConfig[key] = false;
    }
  }

  return normalizedConfig;
}

export function validate(config: Record<string, unknown>) {
  const normalizedConfig = normalizeBooleanEnvValues(config);

  const validatedConfig = plainToInstance(
    EnvironmentVariables,
    normalizedConfig,
    {
      enableImplicitConversion: true,
    },
  );

  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });

  if (errors.length > 0) {
    const missingVars = errors
      .map(
        (error) =>
          `  - ${error.property}: ${Object.values(error.constraints || {}).join(', ')}`,
      )
      .join('\n');

    throw new Error(
      `\n\n❌ Missing or invalid environment variables:\n${missingVars}\n\nPlease check your .env file.\n`,
    );
  }

  if (
    validatedConfig.TURNSTILE_ENABLED &&
    !validatedConfig.TURNSTILE_SECRET_KEY.trim()
  ) {
    throw new Error(
      '\n\n❌ Missing required environment variable: TURNSTILE_SECRET_KEY when TURNSTILE_ENABLED=true.\n\nPlease check your .env file.\n',
    );
  }

  if (validatedConfig.MP_PAYOUTS_ENABLED) {
    const missingMercadoPagoPayoutVars = [
      ['MP_ACCESS_TOKEN', validatedConfig.MP_ACCESS_TOKEN],
      ['MP_OAUTH_CLIENT_ID', validatedConfig.MP_OAUTH_CLIENT_ID],
      ['MP_OAUTH_CLIENT_SECRET', validatedConfig.MP_OAUTH_CLIENT_SECRET],
      ['MP_OAUTH_REDIRECT_URI', validatedConfig.MP_OAUTH_REDIRECT_URI],
    ].filter(([, value]) => !String(value || '').trim());

    if (missingMercadoPagoPayoutVars.length > 0) {
      throw new Error(
        `\n\n❌ Missing Mercado Pago payout configuration while MP_PAYOUTS_ENABLED=true:\n${missingMercadoPagoPayoutVars
          .map(([key]) => `  - ${key}`)
          .join('\n')}\n\nPlease check your .env file.\n`,
      );
    }
  }

  return validatedConfig;
}
