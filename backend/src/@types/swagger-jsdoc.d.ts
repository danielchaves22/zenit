// backend/src/@types/swagger-jsdoc.d.ts

/**
 * Declarações mínimas para o pacote swagger-jsdoc
 */
declare module 'swagger-jsdoc' {
    /** Opções aceitas pela função swaggerJsdoc */
    export interface Options {
      definition: Record<string, any>;
      apis: string[];
    }
  
    /** Gera o spec OpenAPI a partir das opções. */
    export default function swaggerJsdoc(options: Options): object;
  }
  