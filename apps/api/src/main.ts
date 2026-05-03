/**
 * BitScope NestJS 백엔드 진입점
 *
 * 글로벌 파이프, 필터, 인터셉터를 설정하고
 * CORS 및 서버 포트를 구성한다.
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  // 글로벌 유효성 검증 파이프 설정
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // 글로벌 예외 필터 설정
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // 글로벌 인터셉터 설정
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
  );

  // CORS 설정: 같은 서버에서 Next.js와 함께 운영되므로 localhost만 허용
  // 로컬 개발(3500)과 Docker 환경(3000) 모두 허용
  app.enableCors({
    origin: [
      'http://localhost:3500',
      'http://localhost:3000',
      ...(process.env.CORS_ORIGINS?.split(',') || []),
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    credentials: true,
  });

  const port = process.env.PORT || 4000;
  await app.listen(port);
  logger.log(`BitScope API server is running on port ${port}`);
}

bootstrap();
