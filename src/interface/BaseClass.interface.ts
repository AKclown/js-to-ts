import { Range } from "vscode";

export interface IBaseClass {
  /** 获取到选择的区域信息 */
  getSelectedInfo(): Array<ReturnSelectedInfo>;
  /** 设置光标位置 */
  setCursorPosition(line: number, character: number):void;
}

export interface ReturnSelectedInfo {
  range: Range;
  text: string;
}