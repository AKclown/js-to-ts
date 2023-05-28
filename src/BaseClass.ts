import {
  Position,
  Range,
  Selection,
  window,
  Uri,
  commands,
  ViewColumn,
  env,
  workspace,
} from "vscode";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import {
  IBaseClass,
  ReturnSelectedInfo,
} from "./interface/BaseClass.interface";
import { COMMANDS, CustomConfig, Extra } from "./constant";

export class BaseClass implements IBaseClass {
  // *********************
  // Config
  // *********************

  /** 获取到配置信息 */
  getConfig(config: CustomConfig): boolean | string {
    return workspace.getConfiguration().get(config) || false;
  }

  // *********************
  // Editor
  // *********************

  /** 获取到选择的区域信息 */
  getSelectedInfo(): ReturnSelectedInfo[] {
    const data: Array<ReturnSelectedInfo> = [];
    const editor = window.activeTextEditor;
    if (editor) {
      const selections = editor.selections;

      let noEmptySelect = selections.filter(
        (item) =>
          item.start.line !== item.end.line ||
          item.start.character !== item.end.character
      );
      noEmptySelect.sort((pre, next) => pre.start.line - next.start.line);
      noEmptySelect.forEach((item) => {
        const range = new Range(item.start, item.end);
        data.push({
          range,
          text: editor.document.getText(range),
        });
      });
    }
    return data;
  }

  /** 设置光标位置 */
  setCursorPosition(line: number, character: number): void {
    const editor = window.activeTextEditor;
    if (editor) {
      const newPosition = new Position(line, character);
      const newSelection = new Selection(newPosition, newPosition);
      editor.selection = newSelection;
    }
  }

  /** 打开临时文件 */
  openTemporaryFile(code: string): void {
    const tmpFilePath = path.join(os.tmpdir(), Extra.TEMPORARY_FILE_NAME);
    const tmpFileUri = Uri.file(tmpFilePath);
    fs.writeFileSync(tmpFilePath, code);
    commands.executeCommand(
      COMMANDS.VSCODE_OPEN,
      tmpFileUri,
      this.getViewColumn()
    );
  }

  /** 获取到ViewColumn */
  getViewColumn(): ViewColumn {
    const activeEditor = window.activeTextEditor;
    if (!activeEditor) {
      return ViewColumn.One;
    }

    switch (activeEditor.viewColumn) {
      case ViewColumn.One:
        return ViewColumn.Two;
      case ViewColumn.Two:
        return ViewColumn.Three;
    }
    return activeEditor.viewColumn as ViewColumn;
  }

  /** 从剪切板获取内容 */
  async getCodeByClipboard(): Promise<string> {
    return await env.clipboard.readText();
  }
}
