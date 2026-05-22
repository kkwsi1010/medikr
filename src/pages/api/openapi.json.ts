import type { APIRoute } from 'astro';
import { jsonResponse, corsHeaders } from '../../lib/api-cors';

// OpenAPI 3.1 spec — Swagger/Postman/openapi-generator 등에서 import
export const OPTIONS: APIRoute = () => new Response(null, { headers: corsHeaders });

export const GET: APIRoute = async () => {
  const spec = {
    openapi: '3.1.0',
    info: {
      title: 'medikr API',
      version: '1.0.0',
      description: '식약처 OpenAPI 6종 (e약은요 · 낱알식별 · 허가정보 · DUR · 회수 · 카테고리) 무료 통합 JSON API. 인증키 없음, CORS 전체 허용.',
      contact: { name: 'medikr', url: 'https://medikr.kr' },
      license: { name: 'Fair use (식약처 데이터 출처)' },
    },
    servers: [{ url: 'https://medikr.kr', description: 'Production' }],
    paths: {
      '/api/drug/{itemSeq}.json': {
        get: {
          summary: '의약품 통합 정보',
          description: 'e약은요 + 낱알식별 + 허가정보 합쳐서 JSON 1번에 반환',
          parameters: [
            {
              name: 'itemSeq', in: 'path', required: true,
              schema: { type: 'string', example: '195700020' },
              description: '의약품 품목코드 (식약처 ITEM_SEQ)',
            },
          ],
          responses: {
            '200': {
              description: '약 통합 정보',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/Drug' } } },
            },
            '404': { description: '약 없음' },
          },
        },
      },
      '/api/dur/{itemSeq}.json': {
        get: {
          summary: 'DUR 병용금기',
          description: '같이 먹으면 안 되는 약 list (식약처 DUR 80만건)',
          parameters: [
            { name: 'itemSeq', in: 'path', required: true, schema: { type: 'string', example: '195700020' } },
          ],
          responses: {
            '200': {
              description: '병용금기 array (없으면 빈 array)',
              content: { 'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/Taboo' } },
              } },
            },
          },
        },
      },
      '/api/search.json': {
        get: {
          summary: '약 검색',
          description: '약 이름 / 제약사 partial match (5만 약 색인)',
          parameters: [
            { name: 'q', in: 'query', required: true, schema: { type: 'string', minLength: 2, example: '타이레놀' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          ],
          responses: {
            '200': {
              description: '검색 결과',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/SearchResponse' } } },
            },
          },
        },
      },
      '/api/recent.json': {
        get: {
          summary: '최근 허가 의약품',
          description: '5만 약 기준 ITEM_PERMIT_DATE desc top 100',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20, maximum: 100 } },
          ],
          responses: {
            '200': {
              description: '최근 허가 약 list',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RecentResponse' } } },
            },
          },
        },
      },
      '/api/recall.json': {
        get: {
          summary: '회수·판매중지 정보',
          description: '식품 + 의약품 회수 (식약처 공시)',
          parameters: [
            { name: 'type', in: 'query', schema: { type: 'string', enum: ['food', 'drug', 'all'], default: 'all' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 500 } },
          ],
          responses: {
            '200': {
              description: '회수 정보 list',
              content: { 'application/json': { schema: { $ref: '#/components/schemas/RecallResponse' } } },
            },
          },
        },
      },
      '/api/drug-index.json': {
        get: {
          summary: '약 검색 색인 (bulk download)',
          description: 'e약은요 4,757건 약 list (검색 자동완성용, ~1MB)',
          responses: {
            '200': {
              description: '전체 약 list',
              content: { 'application/json': {
                schema: { type: 'array', items: { $ref: '#/components/schemas/DrugBrief' } },
              } },
            },
          },
        },
      },
    },
    components: {
      schemas: {
        DrugBrief: {
          type: 'object',
          properties: {
            s: { type: 'string', description: '품목코드', example: '195700020' },
            n: { type: 'string', description: '약 이름', example: '활명수' },
            e: { type: 'string', description: '제약사', example: '동화약품(주)' },
          },
        },
        Drug: {
          type: 'object',
          properties: {
            s: { type: 'string', description: '품목코드' },
            n: { type: 'string', description: '약 이름' },
            e: { type: 'string', description: '제약사' },
            efcy: { type: 'string', description: '효능·효과' },
            use: { type: 'string', description: '사용법' },
            atpn: { type: 'string', description: '주의사항' },
            warn: { type: 'string', description: '경고' },
            intrc: { type: 'string', description: '상호작용' },
            se: { type: 'string', description: '부작용' },
            deposit: { type: 'string', description: '보관방법' },
            image: { type: 'string', description: '약 이미지 URL' },
            shape: { type: 'string', description: '모양' },
            color: { type: 'string', description: '색상' },
            cls: { type: 'string', description: '약효 분류' },
            etc: { type: 'string', description: '구분 (일반/전문)' },
            ing: { type: 'string', description: '주성분' },
            permit: { type: 'string', description: '허가일자 (YYYYMMDD)' },
          },
        },
        Taboo: {
          type: 'object',
          properties: {
            seq: { type: 'string', description: '병용금기 약 품목코드' },
            name: { type: 'string', description: '병용금기 약 이름' },
            reason: { type: 'string', description: '금기 사유' },
            ingredient: { type: 'string', description: '병용금기 성분' },
          },
        },
        SearchResponse: {
          type: 'object',
          properties: {
            q: { type: 'string' },
            total: { type: 'integer' },
            results: { type: 'array', items: { $ref: '#/components/schemas/DrugBrief' } },
          },
        },
        RecentResponse: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  seq: { type: 'string' },
                  name: { type: 'string' },
                  entp: { type: 'string' },
                  date: { type: 'string', description: '허가일자 YYYYMMDD' },
                },
              },
            },
          },
        },
        RecallResponse: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['food', 'drug', 'all'] },
            total: { type: 'integer' },
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string', description: '제품명' },
                  company: { type: 'string', description: '업체명' },
                  reason: { type: 'string', description: '회수 사유' },
                  date: { type: 'string', description: '회수 명령일 YYYYMMDD' },
                  grade: { type: 'string', description: '회수 등급' },
                  itemSeq: { type: 'string', description: '품목코드 (의약품만)' },
                },
              },
            },
          },
        },
      },
    },
    'x-credit': '식약처 OpenAPI (data.go.kr) 데이터 기반. medikr 는 통합 / 정규화 / CORS / cache 제공.',
  };
  return jsonResponse(spec);
};
