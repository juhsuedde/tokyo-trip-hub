// Environment variables type declarations
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NODE_ENV: 'development' | 'production' | 'test';
      PORT?: string;
      DATABASE_URL: string;
      REDIS_URL?: string;
      REDIS_HOST?: string;
      JWT_SECRET: string;
      JWT_EXPIRES_IN?: string;
      OPENAI_API_KEY?: string;
      GROQ_API_KEY?: string;
      OPENROUTER_API_KEY?: string;
      MOCK_AI?: 'true' | 'false';
      BASE_URL?: string;
      APP_BASE_URL?: string;
      UPLOAD_DIR?: string;
      EXPORTS_DIR?: string;
      STORAGE_PROVIDER?: 'local' | 's3' | 'cloudinary';
      ALLOWED_ORIGINS?: string;
      AWS_REGION?: string;
      AWS_ACCESS_KEY_ID?: string;
      AWS_SECRET_ACCESS_KEY?: string;
      S3_BUCKET?: string;
      CLOUDINARY_CLOUD_NAME?: string;
      CLOUDINARY_API_KEY?: string;
      CLOUDINARY_API_SECRET?: string;
    }
  }
}

export {};