// *********************
// class interface
// *********************
import { HttpStatus } from "../constant";

export interface IMain {
  // *********************
  // Swagger To TS
  // *********************

  /** 执行转换 */
  executeConverts(...args: unknown[]): void;

  // *********************
  // API TO TS
  // *********************

  apiToTs(code: string): { value: string, status: HttpStatus };

  // *********************
  // JS To TS
  // *********************

  jsToTs(): void;
}
