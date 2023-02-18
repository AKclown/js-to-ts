import * as vscode from "vscode";
import { commands } from "vscode";
import { COMMANDS } from "./constant";
import { Main } from "./Main";
export function activate(context: vscode.ExtensionContext) {
  try {

    // *********************
    // Command Register
    // *********************
    
    const mainInstant = new Main();
    const defaultDisposable = commands.registerCommand(
      COMMANDS.SWAGGER_TO_TYPESCRIPT_CONVERT,
      mainInstant.executeConverts,
      mainInstant
    );

        
    const jsObjectToTsDisposable = commands.registerCommand(
      COMMANDS.SWAGGER_TO_TYPESCRIPT_OBJECT_CONVERT,
      mainInstant.jsObjectToTs,
      mainInstant
    );

    // *********************
    // Destroy
    // *********************

    context.subscriptions.push(defaultDisposable,jsObjectToTsDisposable);
  } catch (error) {
    console.log("error: ", error);
  }
}

export function deactivate() {}