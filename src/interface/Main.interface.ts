// *********************
// class interface
// *********************

export interface IMain {
  /** 执行转换 */
  executeConverts(...args: unknown[]): void;
  /** 获取到interface模板 */
  getInterface(text: string): string;
  /** 获取内容类型模板 */
  getContent(text: string): string;
  /** 类型格式化 */
  formatType(type: string):string
}