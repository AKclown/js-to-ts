import { Range, TextEditor } from "vscode";

export interface IBaseClass {
  getSelectedInfo(): Array<ReturnSelectedInfo>;
}

export type ReturnSelectedInfo = {
  range: Range;
  text: string;
};
