import { Range } from "vscode";

export interface IBaseClass {
  /** 获取到选择的区域信息 */
  getSelectedInfo(): Array<ReturnSelectedInfo>;
}

export interface ReturnSelectedInfo {
  range: Range;
  text: string;
}