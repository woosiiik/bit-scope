import { Test, TestingModule } from '@nestjs/testing';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AppService],
    }).compile();

    service = module.get<AppService>(AppService);
  });

  it('서비스가 정의되어 있어야 한다', () => {
    expect(service).toBeDefined();
  });

  it('헬스 체크가 정상 상태를 반환해야 한다', () => {
    const result = service.getHealth();
    expect(result).toEqual({
      status: 'ok',
      service: 'BitScope API',
    });
  });
});
