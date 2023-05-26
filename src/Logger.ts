// 日志系统 --- 错误边界定义    (将错误限定在当前插件内部)   如何定制一个错误
import { window, commands, Uri } from 'vscode';
import { ErrorEnum, ErrorType, ILog, InfoEnum, InfoType, WarnEnum, WarnType } from "./interface/Logger.interface";
export class Logger implements ILog {

    static readonly _github: string = 'https://github.com/AKclown/js-to-ts/issues';

    static async error(error: ErrorType) {
        try {
            const result = await window.showErrorMessage(JSON.stringify(error.data), ...(error.items ?? []));
            if (result === undefined) { return; }
            switch (error.type) {
                case ErrorEnum.UNKNOWN_MISTAKE:
                    commands.executeCommand('vscode.open', Uri.parse(this._github));
                    break;
                default:
                    break;
            }
        } catch (error) {
            console.log(error);
        }
    }

    static async warn(warn: WarnType) {
        try {
            const result = await window.showWarningMessage(JSON.stringify(warn.data), ...(warn.items ?? []));
            if (result === undefined) { return; }
            switch (warn.type) {
                case WarnEnum.ILLEGAL_INPUT_VALUE:
                    break;
                case WarnEnum.FILE_OPENING_EXCEPTION:
                    break;
                default:
                    break;
            }
        } catch (error) {
            console.log(error);
        }
    }

    static async info(info: InfoType) {
        try {
            const result = await window.showInformationMessage(JSON.stringify(info.data), ...(info.items ?? []));
            if (result === undefined) { return; };
            switch (info.type) {
                case InfoEnum.TO_SETTING:
                    commands.executeCommand('workbench.action.openGlobalSettings');
                default:
                    break;
            }
        } catch (error) {
            console.log(error);
        }
    }
}