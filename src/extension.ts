import * as vscode from "vscode";
import { commands, window } from "vscode";
import { COMMANDS } from "./constant";
import { Main } from "./Main";
import { ApiToTsViewProvider } from "./sidebar";
export function activate(context: vscode.ExtensionContext) {
  try {
    // *********************
    // Command Register
    // *********************

    const mainInstant = new Main();
    const defaultDisposable = commands.registerCommand(
      COMMANDS.SWAGGER_TO_TYPESCRIPT_CONVERT,
      mainInstant.swaggerToTs,
      mainInstant
    );

    const jsoTsDisposable = commands.registerCommand(
      COMMANDS.SWAGGER_TO_TYPESCRIPT_OBJECT_CONVERT,
      mainInstant.jsToTs,
      mainInstant
    );

    const addBlockComments = commands.registerCommand(
      COMMANDS.SWAGGER_TO_TYPESCRIPT_ADD_COMMENTS,
      mainInstant.addBlockComments,
      mainInstant
    );

    const provider = new ApiToTsViewProvider(context.extensionUri, mainInstant);
    const apiToTsDisposable = window.registerWebviewViewProvider(
      ApiToTsViewProvider.viewType,
      provider
    );

    // *********************
    // Destroy
    // *********************

    context.subscriptions.push(
      defaultDisposable,
      jsoTsDisposable,
      addBlockComments,
      apiToTsDisposable
    );
  } catch (error) {
    console.log("error: ", error);
  }
}

export function deactivate() {}
