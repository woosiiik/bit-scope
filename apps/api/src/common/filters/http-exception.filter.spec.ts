/**
 * GlobalHttpExceptionFilter 단위 테스트
 *
 * HTTP 예외 및 예기치 못한 오류 처리를 검증한다.
 */

import {
  HttpException,
  HttpStatus,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
} from '@nestjs/common';
import { GlobalHttpExceptionFilter } from './http-exception.filter';

describe('GlobalHttpExceptionFilter', () => {
  let filter: GlobalHttpExceptionFilter;
  let mockResponse: {
    status: jest.Mock;
    json: jest.Mock;
  };
  let mockRequest: {
    method: string;
    url: string;
  };
  let mockHost: {
    switchToHttp: jest.Mock;
  };

  beforeEach(() => {
    filter = new GlobalHttpExceptionFilter();

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    mockRequest = {
      method: 'GET',
      url: '/test',
    };
    mockHost = {
      switchToHttp: jest.fn().mockReturnValue({
        getResponse: () => mockResponse,
        getRequest: () => mockRequest,
      }),
    };
  });

  it('HttpException을 처리하고 올바른 상태 코드를 반환해야 한다', () => {
    const exception = new HttpException('Not Found', HttpStatus.NOT_FOUND);

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
        message: 'Not Found',
        path: '/test',
      }),
    );
  });

  it('BadRequestException의 message 배열을 문자열로 결합해야 한다', () => {
    const exception = new BadRequestException({
      message: ['field1 is required', 'field2 is invalid'],
      error: 'Bad Request',
    });

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.BAD_REQUEST,
        message: 'field1 is required, field2 is invalid',
      }),
    );
  });

  it('NotFoundException을 처리해야 한다', () => {
    const exception = new NotFoundException('Resource not found');

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.NOT_FOUND,
      }),
    );
  });

  it('InternalServerErrorException을 처리해야 한다', () => {
    const exception = new InternalServerErrorException();

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
  });

  it('예기치 못한 오류(non-HttpException)를 500으로 처리해야 한다', () => {
    const exception = new Error('Unexpected error');

    filter.catch(exception, mockHost as any);

    expect(mockResponse.status).toHaveBeenCalledWith(
      HttpStatus.INTERNAL_SERVER_ERROR,
    );
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
        message: '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      }),
    );
  });

  it('응답에 timestamp를 포함해야 한다', () => {
    const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost as any);

    const jsonCall = mockResponse.json.mock.calls[0][0];
    expect(jsonCall.timestamp).toBeDefined();
    expect(() => new Date(jsonCall.timestamp)).not.toThrow();
  });

  it('응답에 요청 경로를 포함해야 한다', () => {
    mockRequest.url = '/api/snapshots/0x1234';
    const exception = new HttpException('Test', HttpStatus.BAD_REQUEST);

    filter.catch(exception, mockHost as any);

    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/snapshots/0x1234',
      }),
    );
  });
});
